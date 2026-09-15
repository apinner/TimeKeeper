import { Client, InvalidCredentialsError } from "ldapts";
import {
  AD_ATTRIBUTES,
  type DirectoryProfile,
  groupMembershipFilter,
  isMemberOf,
  mapEntryToProfile,
  normaliseUpn,
  userFilter,
} from "./attributes";
import { type LdapConfig, requireLdapConfig } from "./config";

export type AuthFailure =
  | "no-credentials"
  | "invalid-credentials"
  | "not-found"
  | "disabled"
  | "not-permitted"
  | "unavailable";

export type AuthResult =
  | { ok: true; profile: DirectoryProfile }
  | { ok: false; reason: AuthFailure };

const WANTED_ATTRIBUTES = [
  AD_ATTRIBUTES.upn,
  AD_ATTRIBUTES.displayName,
  AD_ATTRIBUTES.email,
  AD_ATTRIBUTES.department,
  AD_ATTRIBUTES.jobTitle,
  AD_ATTRIBUTES.manager,
  AD_ATTRIBUTES.accountControl,
  "memberOf",
  "dn",
];

async function connect(config: LdapConfig): Promise<Client> {
  // ldapts turns any connection secure when tlsOptions are present, whatever
  // the URL scheme says, so they are only passed when TLS is actually wanted —
  // otherwise a plain ldap:// connection tries to negotiate TLS and hangs up.
  const usesTls = config.url.toLowerCase().startsWith("ldaps:") || config.startTls;

  const client = new Client({
    url: config.url,
    timeout: config.timeoutMs,
    connectTimeout: config.timeoutMs,
    ...(usesTls ? { tlsOptions: { rejectUnauthorized: config.rejectUnauthorized } } : {}),
  });

  if (config.startTls) {
    await client.startTLS({ rejectUnauthorized: config.rejectUnauthorized });
  }
  return client;
}

/**
 * Verify someone's password by binding to the directory as them, then read
 * their record over that same connection.
 *
 * The empty-password check is not a formality: Active Directory treats a bind
 * with a distinguished name and an empty password as an *unauthenticated* bind
 * and returns success, so skipping it would let anyone sign in as anyone by
 * leaving the password box blank.
 */
export async function authenticate(
  username: string,
  password: string,
  override?: LdapConfig,
): Promise<AuthResult> {
  const config = override ?? (await requireLdapConfig());
  const upn = normaliseUpn(username ?? "", config.upnSuffix);

  if (upn === "" || !password) return { ok: false, reason: "no-credentials" };

  let client: Client | null = null;
  try {
    client = await connect(config);

    // Active Directory accepts a UPN as a bind identity; other directories need
    // the full distinguished name, which means finding the person first.
    let bindIdentity = upn;
    let known: unknown = null;

    if (config.bindMode === "search") {
      const found = await findPerson(client, config, upn);
      if (!found) return { ok: false, reason: "not-found" };
      bindIdentity = (found as { dn: string }).dn;
      known = found;
    }

    try {
      await client.bind(bindIdentity, password);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return { ok: false, reason: "invalid-credentials" };
      }
      throw error;
    }

    const entry = known ?? (await findPerson(client, config, upn));
    if (!entry) return { ok: false, reason: "not-found" };

    const profile = mapEntryToProfile(entry as Record<string, unknown>);
    if (!profile) return { ok: false, reason: "not-found" };
    if (profile.isDisabled) return { ok: false, reason: "disabled" };

    if (config.accessGroupDn) {
      const permitted = await isInAccessGroup(client, config, profile, entry);
      if (!permitted) return { ok: false, reason: "not-permitted" };
    }

    return { ok: true, profile };
  } catch (error) {
    // A directory that cannot be reached is an outage, not a wrong password —
    // the sign-in page says so rather than blaming the person's credentials.
    console.error("[ldap] authentication failed", error);
    return { ok: false, reason: "unavailable" };
  } finally {
    await client?.unbind().catch(() => undefined);
  }
}

/**
 * Group membership, preferring a search that follows nested groups. Falls back
 * to the memberOf values already on the person's record, which covers
 * directories without Active Directory's matching rule.
 */
async function findPerson(
  client: Client,
  config: LdapConfig,
  upn: string,
): Promise<unknown | null> {
  const { searchEntries } = await client.search(config.baseDn, {
    scope: "sub",
    filter: userFilter(upn, { personFilter: config.personFilter }),
    attributes: WANTED_ATTRIBUTES,
    sizeLimit: 2,
  });
  return searchEntries[0] ?? null;
}

async function isInAccessGroup(
  client: Client,
  config: LdapConfig,
  profile: DirectoryProfile,
  entry: unknown,
): Promise<boolean> {
  const memberOf = (entry as { memberOf?: string[] | string }).memberOf;
  const values = Array.isArray(memberOf) ? memberOf : memberOf ? [memberOf] : undefined;
  if (isMemberOf(values, config.accessGroupDn!)) return true;

  try {
    // Base-scoped on the group itself: "does this group have this member?"
    const { searchEntries } = await client.search(config.accessGroupDn!, {
      scope: "base",
      filter: groupMembershipFilter(profile.distinguishedName, {
        nested: config.nestedGroups,
      }),
      attributes: ["dn"],
      sizeLimit: 1,
    });
    return searchEntries.length > 0;
  } catch (error) {
    console.error("[ldap] group membership check failed", error);
    return false;
  }
}

/** Look up one entry by distinguished name — used to turn a manager DN into a person. */
export async function profileByDn(dn: string): Promise<DirectoryProfile | null> {
  const config = await requireLdapConfig();
  const client = await connectAsService(config);
  if (!client) return null;

  try {
    const { searchEntries } = await client.search(dn, {
      scope: "base",
      filter: "(objectClass=*)",
      attributes: WANTED_ATTRIBUTES,
      sizeLimit: 1,
    });
    const entry = searchEntries[0];
    return entry ? mapEntryToProfile(entry as Record<string, unknown>) : null;
  } catch (error) {
    console.error(`[ldap] could not read ${dn}`, error);
    return null;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

/** Everyone the app cares about, for the nightly sync. Needs a service account. */
export async function listDirectoryUsers(
  override?: LdapConfig,
): Promise<DirectoryProfile[] | null> {
  const config = override ?? (await requireLdapConfig());
  const client = await connectAsService(config);
  if (!client) return null;

  try {
    if (!config.accessGroupDn) {
      const { searchEntries } = await client.search(config.baseDn, {
        scope: "sub",
        filter: config.personFilter,
        attributes: WANTED_ATTRIBUTES,
        paged: true,
      });
      return toProfiles(searchEntries);
    }

    // Expand the access group by reading its own member values, the same way
    // the sign-in check tests membership. Nested groups are walked here rather
    // than relying on an attribute the directory may not maintain.
    const memberDns = await expandGroup(client, config.accessGroupDn, config.nestedGroups);
    const entries: unknown[] = [];

    for (const dn of memberDns) {
      try {
        const { searchEntries } = await client.search(dn, {
          scope: "base",
          filter: config.personFilter,
          attributes: WANTED_ATTRIBUTES,
          sizeLimit: 1,
        });
        if (searchEntries[0]) entries.push(searchEntries[0]);
      } catch {
        // A member that is not a person, or that we cannot read, is skipped.
      }
    }

    return toProfiles(entries);
  } catch (error) {
    console.error("[ldap] directory listing failed", error);
    return null;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

/** Member distinguished names of a group, following nested groups once each. */
async function expandGroup(
  client: Client,
  groupDn: string,
  nested: boolean,
  seen: Set<string> = new Set(),
): Promise<string[]> {
  const key = groupDn.toLowerCase();
  if (seen.has(key)) return [];
  seen.add(key);

  const { searchEntries } = await client.search(groupDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: ["member"],
    sizeLimit: 1,
  });

  const raw = (searchEntries[0] as { member?: string[] | string } | undefined)?.member;
  const members = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!nested) return members;

  const all: string[] = [];
  for (const member of members) {
    all.push(member);
    // A member that is itself a group contributes its own members too.
    const nestedMembers = await expandGroup(client, member, true, seen).catch(() => []);
    all.push(...nestedMembers);
  }
  return [...new Set(all)];
}

function toProfiles(entries: unknown[]): DirectoryProfile[] {
  return entries
    .map((entry) => mapEntryToProfile(entry as Record<string, unknown>))
    .filter((profile): profile is DirectoryProfile => profile !== null);
}

async function connectAsService(config: LdapConfig): Promise<Client | null> {
  if (!config.bindDn || !config.bindPassword) {
    console.warn("[ldap] no service account configured — skipping directory read");
    return null;
  }

  try {
    const client = await connect(config);
    await client.bind(config.bindDn, config.bindPassword);
    return client;
  } catch (error) {
    console.error("[ldap] service account bind failed", error);
    return null;
  }
}
