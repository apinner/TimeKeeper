import { AD_PERSON_FILTER } from "./attributes";

export interface LdapConfig {
  url: string;
  baseDn: string;
  /** Appended when someone types a bare username. */
  upnSuffix: string | null;
  /** Only members of this group may sign in. Null means anyone in the directory. */
  accessGroupDn: string | null;
  /** Service account, used by the nightly sync only. Sign-in binds as the user. */
  bindDn: string | null;
  bindPassword: string | null;
  startTls: boolean;
  rejectUnauthorized: boolean;
  /** Resolve nested group membership via AD's matching rule. */
  nestedGroups: boolean;
  /** What counts as a person; AD's objectCategory is not universal. */
  personFilter: string;
  /**
   * "upn" binds directly as alex.pinner@example.co.uk, which Active Directory
   * accepts. "search" looks the person up first and binds as their full
   * distinguished name, which is what other directories require.
   */
  bindMode: "upn" | "search";
  timeoutMs: number;
}

export function ldapConfig(): LdapConfig | null {
  const url = process.env.LDAP_URL?.trim();
  const baseDn = process.env.LDAP_BASE_DN?.trim();
  if (!url || !baseDn) return null;

  return {
    url,
    baseDn,
    upnSuffix: process.env.LDAP_UPN_SUFFIX?.trim() || null,
    accessGroupDn: process.env.LDAP_ACCESS_GROUP_DN?.trim() || null,
    bindDn: process.env.LDAP_BIND_DN?.trim() || null,
    bindPassword: process.env.LDAP_BIND_PASSWORD || null,
    startTls: process.env.LDAP_STARTTLS === "true",
    rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
    nestedGroups: process.env.LDAP_NESTED_GROUPS !== "false",
    personFilter: process.env.LDAP_PERSON_FILTER?.trim() || AD_PERSON_FILTER,
    bindMode: process.env.LDAP_BIND_MODE === "search" ? "search" : "upn",
    timeoutMs: Number(process.env.LDAP_TIMEOUT_MS ?? 10_000),
  };
}

export function requireLdapConfig(): LdapConfig {
  const config = ldapConfig();
  if (!config) {
    throw new Error(
      "LDAP is not configured: set LDAP_URL and LDAP_BASE_DN. See docs/SETUP.md.",
    );
  }
  return config;
}
