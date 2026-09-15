import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { isLockedOut, minutesRemaining, recordFailure } from "./lockout";
import type { User } from "@prisma/client";

export type LocalFailure = "no-local-account" | "invalid-credentials" | "locked" | "not-admin";

export type LocalResult =
  | { ok: true; user: User }
  | { ok: false; reason: LocalFailure; lockedForMinutes?: number };

/**
 * Local passwords exist so the system can be configured and repaired without
 * the directory, so they are restricted to administrators. Everyone else comes
 * from Active Directory, which keeps one source of truth for staff.
 */
export function mayHoldLocalPassword(role: User["role"]): boolean {
  return role === "HR_ADMIN" || role === "SYSADMIN";
}

export async function findLocalAccount(upn: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { upn: upn.toLowerCase() } });
  return user?.passwordHash ? user : null;
}

export async function authenticateLocally(upn: string, password: string): Promise<LocalResult> {
  const user = await findLocalAccount(upn);
  if (!user) return { ok: false, reason: "no-local-account" };

  if (isLockedOut(user.lockedUntil)) {
    return {
      ok: false,
      reason: "locked",
      lockedForMinutes: minutesRemaining(user.lockedUntil!),
    };
  }

  if (!user.isActive || !mayHoldLocalPassword(user.role)) {
    return { ok: false, reason: "not-admin" };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, reason: "invalid-credentials" };
  }

  if (user.failedSignIns !== 0 || user.lockedUntil !== null) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedSignIns: 0, lockedUntil: null },
    });
  }

  return { ok: true, user };
}

/** Counts a failed attempt against a local account, locking it if needed. */
export async function noteFailedAttempt(upn: string): Promise<number | null> {
  const user = await findLocalAccount(upn);
  if (!user) return null;

  const outcome = recordFailure(user.failedSignIns);
  await prisma.user.update({ where: { id: user.id }, data: outcome });
  return outcome.lockedUntil ? minutesRemaining(outcome.lockedUntil) : null;
}

/** True while nobody can sign in yet, which is when the setup page is offered. */
export async function needsInitialSetup(): Promise<boolean> {
  const [withPassword, settings] = await Promise.all([
    prisma.user.count({ where: { passwordHash: { not: null } } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);
  return withPassword === 0 && !settings?.ldapEnabled;
}
