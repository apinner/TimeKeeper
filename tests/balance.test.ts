import { describe, expect, it } from "vitest";
import { assessOverdraft, computeBalance } from "@/lib/domain/balance";

const base = {
  allowanceMinutes: 11250, // 25 days at 7.5h
  carriedOverMinutes: 0,
  carryoverExpiresOn: null,
  adjustmentMinutes: 0,
  approvedMinutes: 0,
  pendingMinutes: 0,
  asOf: "2026-06-01",
};

describe("leave balance", () => {
  it("subtracts approved leave and reports pending separately", () => {
    const balance = computeBalance({
      ...base,
      approvedMinutes: 2250,
      pendingMinutes: 900,
    });

    expect(balance.remainingMinutes).toBe(9000);
    expect(balance.pendingMinutes).toBe(900);
    expect(balance.remainingIfPendingApprovedMinutes).toBe(8100);
  });

  it("applies signed adjustments", () => {
    expect(computeBalance({ ...base, adjustmentMinutes: 450 }).remainingMinutes).toBe(11700);
    expect(computeBalance({ ...base, adjustmentMinutes: -450 }).remainingMinutes).toBe(10800);
  });

  it("draws from carryover first, so unused carryover lapses at expiry", () => {
    const beforeExpiry = computeBalance({
      ...base,
      carriedOverMinutes: 2250,
      carryoverExpiresOn: "2026-03-31",
      approvedMinutes: 900,
      asOf: "2026-03-01",
    });
    expect(beforeExpiry.lapsedMinutes).toBe(0);
    expect(beforeExpiry.remainingMinutes).toBe(12600);

    const afterExpiry = computeBalance({
      ...base,
      carriedOverMinutes: 2250,
      carryoverExpiresOn: "2026-03-31",
      approvedMinutes: 900,
      asOf: "2026-04-01",
    });
    // 900 of the carried 2250 was used; the remaining 1350 lapses.
    expect(afterExpiry.lapsedMinutes).toBe(1350);
    expect(afterExpiry.remainingMinutes).toBe(11250);
  });

  it("does not lapse carryover that was fully used", () => {
    const balance = computeBalance({
      ...base,
      carriedOverMinutes: 2250,
      carryoverExpiresOn: "2026-03-31",
      approvedMinutes: 2250,
      asOf: "2026-04-01",
    });
    expect(balance.lapsedMinutes).toBe(0);
    expect(balance.remainingMinutes).toBe(11250);
  });

  it("allows a negative balance, because over-booking is a manager decision", () => {
    const balance = computeBalance({ ...base, approvedMinutes: 12000 });
    expect(balance.remainingMinutes).toBe(-750);
    expect(balance.isNegative).toBe(true);
  });
});

describe("overdraft warning", () => {
  it("states exactly how far into the red a request takes someone", () => {
    const balance = computeBalance({ ...base, approvedMinutes: 10800 }); // 1 day left
    const warning = assessOverdraft(balance, 1350); // asking for 3 days

    expect(warning.wouldOverdraw).toBe(true);
    expect(warning.shortfallMinutes).toBe(900); // 2 days short
    expect(warning.balanceAfterMinutes).toBe(-900);
  });

  it("stays quiet when the request fits", () => {
    const balance = computeBalance(base);
    const warning = assessOverdraft(balance, 450);

    expect(warning.wouldOverdraw).toBe(false);
    expect(warning.shortfallMinutes).toBe(0);
  });
});
