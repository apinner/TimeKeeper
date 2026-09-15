import { prisma } from "@/lib/db";
import { isAdmin, type SessionUser } from "@/lib/session";

/**
 * Reporting scope. Administrators see the whole company; a manager sees their
 * own team and themselves, so reports never leak beyond someone's line of
 * responsibility.
 */
export async function reportableUserIds(user: SessionUser): Promise<string[] | null> {
  if (isAdmin(user)) return null; // null means "no restriction"

  const reports = await prisma.user.findMany({
    where: { managerId: user.id },
    select: { id: true },
  });
  return [user.id, ...reports.map((report) => report.id)];
}

export function scopeFilter(userIds: string[] | null) {
  return userIds ? { userId: { in: userIds } } : {};
}
