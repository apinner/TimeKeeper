import { prisma } from "@/lib/db";
import { listDirectoryUsers } from "./directory";
import { upsertFromDirectory } from "./provisioning";

export interface SyncResult {
  seen: number;
  updated: number;
  deactivated: number;
  skipped: boolean;
}

/**
 * Nightly reconciliation with Active Directory.
 *
 * Refreshes everyone's details and, importantly, fills in line managers that
 * could not be resolved at sign-in because the manager had not signed in yet.
 * People who have left the access group or been disabled in the directory are
 * deactivated here rather than waiting for them to try to sign in.
 *
 * Needs a service account (LDAP_BIND_DN); without one it does nothing and says
 * so, rather than mistaking an empty result for an empty company.
 */
export async function syncDirectory(): Promise<SyncResult> {
  const profiles = await listDirectoryUsers();
  if (profiles === null) {
    return { seen: 0, updated: 0, deactivated: 0, skipped: true };
  }

  if (profiles.length === 0) {
    console.warn("[ldap] directory returned no people — skipping, rather than deactivating everyone");
    return { seen: 0, updated: 0, deactivated: 0, skipped: true };
  }

  let updated = 0;
  for (const profile of profiles) {
    try {
      await upsertFromDirectory(profile);
      updated += 1;
    } catch (error) {
      console.error(`[ldap] could not sync ${profile.upn}`, error);
    }
  }

  // A second pass now that every manager exists locally, so a manager who has
  // never signed in is still resolvable by distinguished name.
  for (const profile of profiles) {
    if (!profile.managerDn) continue;
    try {
      await upsertFromDirectory(profile);
    } catch {
      // Already reported above.
    }
  }

  const present = profiles.map((profile) => profile.upn);
  const { count: deactivated } = await prisma.user.updateMany({
    where: { isActive: true, upn: { notIn: present } },
    data: { isActive: false },
  });

  if (deactivated > 0) {
    console.info(`[ldap] deactivated ${deactivated} account(s) no longer in the directory`);
  }

  return { seen: profiles.length, updated, deactivated, skipped: false };
}
