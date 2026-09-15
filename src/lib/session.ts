import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { today } from "@/lib/dates";
import type { Role, User } from "@prisma/client";

export type SessionUser = User;

const ADMIN_ROLES: Role[] = ["HR_ADMIN", "SYSADMIN"];

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return user && user.isActive ? user : null;
}

/** Every page and action starts here. Unauthenticated callers go to sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/");
  return user;
}

export function isAdmin(user: Pick<User, "role">): boolean {
  return ADMIN_ROLES.includes(user.role);
}

/**
 * Someone can see approval screens if they manage anyone, hold an active
 * delegation today, or are HR. Having direct reports is enough — the MANAGER
 * role is a label, not the gate.
 */
export async function canApproveAnything(user: SessionUser): Promise<boolean> {
  if (isAdmin(user)) return true;
  const now = new Date(`${today()}T00:00:00.000Z`);
  const [reports, delegations] = await Promise.all([
    prisma.user.count({ where: { managerId: user.id, isActive: true } }),
    prisma.delegation.count({
      where: { delegateId: user.id, startDate: { lte: now }, endDate: { gte: now } },
    }),
  ]);
  return reports > 0 || delegations > 0;
}

/** Manager ids this person is currently standing in for. */
export async function activeDelegationsFor(userId: string): Promise<string[]> {
  const now = new Date(`${today()}T00:00:00.000Z`);
  const delegations = await prisma.delegation.findMany({
    where: { delegateId: userId, startDate: { lte: now }, endDate: { gte: now } },
    select: { managerId: true },
  });
  return delegations.map((d) => d.managerId);
}
