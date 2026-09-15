import { describe, expect, it } from "vitest";
import { carryoverExpiryDate, computeCarryover } from "@/lib/domain/carryover";

describe("year-end carryover", () => {
  const cap = 2250; // 5 days at 7.5h

  it("carries up to the cap and forfeits the rest", () => {
    expect(computeCarryover({ remainingMinutes: 1350, capMinutes: cap })).toEqual({
      carriedOverMinutes: 1350,
      forfeitedMinutes: 0,
    });

    expect(computeCarryover({ remainingMinutes: 3600, capMinutes: cap })).toEqual({
      carriedOverMinutes: 2250,
      forfeitedMinutes: 1350,
    });
  });

  it("carries a negative balance forward in full rather than hiding it", () => {
    expect(computeCarryover({ remainingMinutes: -900, capMinutes: cap })).toEqual({
      carriedOverMinutes: -900,
      forfeitedMinutes: 0,
    });
  });

  it("handles a zero cap and an exactly-empty balance", () => {
    expect(computeCarryover({ remainingMinutes: 1350, capMinutes: 0 })).toEqual({
      carriedOverMinutes: 0,
      forfeitedMinutes: 1350,
    });
    expect(computeCarryover({ remainingMinutes: 0, capMinutes: cap }).carriedOverMinutes).toBe(0);
  });
});

describe("carryover expiry date", () => {
  const config = { carryoverExpiryDay: 31, carryoverExpiryMonth: 3 };

  it("falls inside the leave year it was carried into", () => {
    expect(carryoverExpiryDate("2026-01-01", config)).toBe("2026-03-31");
  });

  it("rolls into the next calendar year for an April leave year", () => {
    expect(carryoverExpiryDate("2026-04-01", config)).toBe("2027-03-31");
  });
});
