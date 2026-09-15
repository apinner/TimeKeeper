import { decryptSecret } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { AD_PERSON_FILTER } from "./attributes";
import type { Settings } from "@prisma/client";

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

/**
 * Directory settings live in the database and are edited in Admin →
 * Authentication, so the directory can be configured from inside the
 * application rather than by editing a file and redeploying.
 */
export function ldapConfigFrom(settings: Settings): LdapConfig | null {
  if (!settings.ldapEnabled) return null;

  const url = settings.ldapUrl?.trim();
  const baseDn = settings.ldapBaseDn?.trim();
  if (!url || !baseDn) return null;

  return {
    url,
    baseDn,
    upnSuffix: settings.ldapUpnSuffix?.trim() || null,
    accessGroupDn: settings.ldapAccessGroupDn?.trim() || null,
    bindDn: settings.ldapBindDn?.trim() || null,
    bindPassword: decryptSecret(settings.ldapBindPasswordEnc),
    startTls: settings.ldapStartTls,
    rejectUnauthorized: settings.ldapTlsRejectUnauthorized,
    nestedGroups: settings.ldapNestedGroups,
    personFilter: settings.ldapPersonFilter?.trim() || AD_PERSON_FILTER,
    bindMode: settings.ldapBindMode === "search" ? "search" : "upn",
    timeoutMs: settings.ldapTimeoutMs,
  };
}

export async function getLdapConfig(): Promise<LdapConfig | null> {
  return ldapConfigFrom(await getSettings());
}

export async function requireLdapConfig(): Promise<LdapConfig> {
  const config = await getLdapConfig();
  if (!config) {
    throw new Error("Directory sign-in is not configured. See Admin → Authentication.");
  }
  return config;
}
