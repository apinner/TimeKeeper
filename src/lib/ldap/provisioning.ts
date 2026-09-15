import { prisma } from "@/lib/db";
import { bootstrapRoleFor, ensureUserSetUp } from "@/lib/provisioning";
import type { DirectoryProfile } from "./attributes";
import { profileByDn } from "./directory";
import type { User } from "@prisma/client";

/**
 * Create or refresh the local account from what the directory says.
 *
 * Active Directory is the source of truth for names, email, department and job
 * title, so anything edited in the admin screens is overwritten on the next
 * sign-in. Roles, allowances and working patterns are ours and are never
 * touched here.
 */
export async function upsertFromDirectory(profile: DirectoryProfile): Promise<User> {
  const existing =
    (profile.directoryId
      ? await prisma.user.findUnique({ where: { directoryId: profile.directoryId } })
      : null) ?? (await prisma.user.findUnique({ where: { upn: profile.upn } }));

  const attributes = {
    upn: profile.upn,
    email: profile.email ?? profile.upn,
    name: profile.displayName,
    department: profile.department,
    jobTitle: profile.jobTitle,
    directoryId: profile.directoryId,
    directoryDn: profile.distinguishedName,
    isActive: !profile.isDisabled,
  };

  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: attributes })
    : await prisma.user.create({
        data: { ...attributes, role: bootstrapRoleFor(profile.upn) ?? "EMPLOYEE" },
      });

  if (!existing) await ensureUserSetUp(user.id);

  const managerId = await resolveManager(profile, user.id);
  if (managerId !== undefined && managerId !== user.managerId) {
    return prisma.user.update({ where: { id: user.id }, data: { managerId } });
  }

  return user;
}

/**
 * Turn the directory's manager attribute — a distinguished name — into one of
 * our users.
 *
 * Matching on the stored distinguished name works as soon as the manager has
 * signed in once. Before that, and only when a service account is configured,
 * the manager's record is read from the directory so they can be matched by
 * username instead. Returns undefined to mean "leave the current value alone",
 * so a directory hiccup never silently unassigns somebody's manager.
 */
async function resolveManager(
  profile: DirectoryProfile,
  userId: string,
): Promise<string | null | undefined> {
  if (!profile.managerDn) return undefined;

  const byDn = await prisma.user.findFirst({
    where: { directoryDn: profile.managerDn, id: { not: userId } },
    select: { id: true },
  });
  if (byDn) return byDn.id;

  const managerProfile = await profileByDn(profile.managerDn);
  if (!managerProfile) return undefined;

  const byUpn = await prisma.user.findFirst({
    where: { upn: managerProfile.upn, id: { not: userId } },
    select: { id: true },
  });
  return byUpn?.id ?? undefined;
}
