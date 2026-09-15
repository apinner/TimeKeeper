/**
 * Pure helpers for talking to Active Directory. No network access here, so the
 * parts that are easy to get dangerously wrong — filter escaping, the disabled
 * account bit, username normalisation — are covered by tests.
 */

/** Active Directory's userAccountControl flag for a disabled account. */
const ADS_UF_ACCOUNTDISABLE = 0x0002;

export interface DirectoryProfile {
  upn: string;
  directoryId: string | null;
  distinguishedName: string;
  displayName: string | null;
  email: string | null;
  department: string | null;
  jobTitle: string | null;
  /** The manager's distinguished name, resolved to a person separately. */
  managerDn: string | null;
  isDisabled: boolean;
}

/**
 * Escape a value before putting it in an LDAP search filter (RFC 4515).
 *
 * Without this, a username containing `*)(uid=*` rewrites the filter — the LDAP
 * equivalent of SQL injection, and the reason a username is never concatenated
 * into a filter raw.
 */
export function escapeFilterValue(value: string): string {
  let escaped = "";
  for (const char of value) {
    switch (char) {
      case "\\":
        escaped += "\\5c";
        break;
      case "*":
        escaped += "\\2a";
        break;
      case "(":
        escaped += "\\28";
        break;
      case ")":
        escaped += "\\29";
        break;
      case "\0":
        escaped += "\\00";
        break;
      case "/":
        escaped += "\\2f";
        break;
      default:
        escaped += char;
    }
  }
  return escaped;
}

/**
 * People type either `alex.pinner@mechatronic.co.uk` or just `alex.pinner`.
 * Both should work; the suffix is appended when it is missing.
 */
export function normaliseUpn(input: string, suffix: string | null): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return "";

  // DOMAIN\user, which people paste out of habit.
  const downLevel = trimmed.match(/^[^\\]+\\(.+)$/);
  const username = downLevel ? downLevel[1] : trimmed;

  if (username.includes("@")) return username;
  if (!suffix) return username;

  const normalisedSuffix = suffix.startsWith("@") ? suffix : `@${suffix}`;
  return `${username}${normalisedSuffix.toLowerCase()}`;
}

export function isAccountDisabled(userAccountControl: string | number | undefined): boolean {
  if (userAccountControl === undefined) return false;
  const value = Number(userAccountControl);
  if (!Number.isFinite(value)) return false;
  return (value & ADS_UF_ACCOUNTDISABLE) !== 0;
}

type RawEntry = Record<string, unknown>;

function first(entry: RawEntry, key: string): string | null {
  const value = entry[key];
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" && item !== "");
    return typeof found === "string" ? found : null;
  }
  if (typeof value === "string" && value !== "") return value;
  if (Buffer.isBuffer(value)) return value.toString("base64");
  return null;
}

export interface AttributeNames {
  upn: string;
  displayName: string;
  email: string;
  department: string;
  jobTitle: string;
  manager: string;
  objectId: string;
  accountControl: string;
}

export const AD_ATTRIBUTES: AttributeNames = {
  upn: "userPrincipalName",
  displayName: "displayName",
  email: "mail",
  department: "department",
  jobTitle: "title",
  manager: "manager",
  objectId: "objectGUID",
  accountControl: "userAccountControl",
};

export function mapEntryToProfile(
  entry: RawEntry,
  attributes: AttributeNames = AD_ATTRIBUTES,
): DirectoryProfile | null {
  const dn = first(entry, "dn");
  if (!dn) return null;

  const upn = first(entry, attributes.upn) ?? first(entry, attributes.email);
  if (!upn) return null;

  return {
    upn: upn.toLowerCase(),
    directoryId: first(entry, attributes.objectId),
    distinguishedName: dn,
    displayName: first(entry, attributes.displayName),
    email: (first(entry, attributes.email) ?? upn).toLowerCase(),
    department: first(entry, attributes.department),
    jobTitle: first(entry, attributes.jobTitle),
    managerDn: first(entry, attributes.manager),
    isDisabled: isAccountDisabled(first(entry, attributes.accountControl) ?? undefined),
  };
}

/**
 * What counts as a person. Active Directory's objectCategory does not exist in
 * other directories, so it is configurable.
 */
export const AD_PERSON_FILTER = "(objectCategory=person)";

/** Search filter for one person by the attribute they sign in with. */
export function userFilter(
  upn: string,
  options: { attributes?: AttributeNames; personFilter?: string } = {},
): string {
  const attributes = options.attributes ?? AD_ATTRIBUTES;
  const personFilter = options.personFilter ?? AD_PERSON_FILTER;
  const value = escapeFilterValue(upn);
  return `(&${personFilter}(|(${attributes.upn}=${value})(${attributes.email}=${value})))`;
}

/**
 * Membership test, applied to the group entry itself (a base-scoped search on
 * the group's distinguished name) rather than searching the whole tree for it.
 * That avoids depending on AD's distinguishedName attribute, which other
 * directories do not expose as searchable.
 *
 * 1.2.840.113556.1.4.1941 is Active Directory's LDAP_MATCHING_RULE_IN_CHAIN,
 * which walks nested groups. Directories without it use a direct test.
 */
export function groupMembershipFilter(
  userDn: string,
  options: { nested?: boolean } = {},
): string {
  const rule = options.nested === false ? "" : ":1.2.840.113556.1.4.1941:";
  return `(member${rule}=${escapeFilterValue(userDn)})`;
}

/** Group membership read from the person's own memberOf values. */
export function isMemberOf(memberOf: string[] | undefined, groupDn: string): boolean {
  if (!memberOf || memberOf.length === 0) return false;
  const target = groupDn.trim().toLowerCase();
  return memberOf.some((dn) => dn.trim().toLowerCase() === target);
}
