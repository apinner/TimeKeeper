import { describe, expect, it } from "vitest";
import {
  isLockedOut,
  LOCKOUT_MINUTES,
  MAX_ATTEMPTS,
  minutesRemaining,
  recordFailure,
} from "@/lib/auth/lockout";

const now = new Date("2026-09-15T10:00:00Z");

describe("sign-in throttling", () => {
  it("allows the first few attempts without locking", () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
      expect(recordFailure(attempt, now).lockedUntil).toBeNull();
    }
  });

  it("locks once the allowance is used up", () => {
    const outcome = recordFailure(MAX_ATTEMPTS - 1, now);
    expect(outcome.failedSignIns).toBe(MAX_ATTEMPTS);
    expect(outcome.lockedUntil).toEqual(new Date("2026-09-15T10:15:00Z"));
  });

  it("clears itself with time, so no second administrator is needed", () => {
    const lockedUntil = recordFailure(MAX_ATTEMPTS - 1, now).lockedUntil!;
    expect(isLockedOut(lockedUntil, now)).toBe(true);
    expect(isLockedOut(lockedUntil, new Date("2026-09-15T10:14:59Z"))).toBe(true);
    expect(isLockedOut(lockedUntil, new Date("2026-09-15T10:15:01Z"))).toBe(false);
  });

  it("is not locked when there is no lock recorded", () => {
    expect(isLockedOut(null, now)).toBe(false);
    expect(isLockedOut(undefined, now)).toBe(false);
  });

  it("reports whole minutes remaining, never zero", () => {
    expect(minutesRemaining(new Date("2026-09-15T10:15:00Z"), now)).toBe(LOCKOUT_MINUTES);
    expect(minutesRemaining(new Date("2026-09-15T10:00:01Z"), now)).toBe(1);
  });
});
