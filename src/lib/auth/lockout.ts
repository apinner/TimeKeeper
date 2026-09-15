/**
 * Throttling for local administrator passwords.
 *
 * Unlike directory sign-in, this endpoint checks a password we store, so it is
 * worth slowing down guessing. Lockout is time-based and clears itself: an
 * administrator locked out at 5pm can sign in again without needing another
 * administrator, which matters when there may only be one.
 */

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export function isLockedOut(lockedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return lockedUntil !== null && lockedUntil !== undefined && lockedUntil > now;
}

export function minutesRemaining(lockedUntil: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

export interface FailureOutcome {
  failedSignIns: number;
  lockedUntil: Date | null;
}

/** Applied after a failed attempt; locks once the allowance is used up. */
export function recordFailure(currentCount: number, now: Date = new Date()): FailureOutcome {
  const failedSignIns = currentCount + 1;
  if (failedSignIns < MAX_ATTEMPTS) return { failedSignIns, lockedUntil: null };
  return {
    failedSignIns,
    lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
  };
}
