import { describe, expect, it } from "vitest";
import {
  computeWeekTotals,
  isEditableByOwner,
  requiresVarianceReason,
} from "@/lib/domain/timesheet";
import { DEFAULT_PATTERN } from "@/lib/domain/patterns";

const week = { pattern: DEFAULT_PATTERN, weekStart: "2026-09-14" };

describe("week totals", () => {
  it("balances a full week of worked hours", () => {
    const totals = computeWeekTotals({
      ...week,
      workedMinutes: 2250,
      leaveMinutes: 0,
      bankHolidayMinutes: 0,
    });

    expect(totals.contractedMinutes).toBe(2250);
    expect(totals.matchesContract).toBe(true);
    expect(requiresVarianceReason(totals)).toBe(false);
  });

  it("counts auto-filled leave and bank holidays towards the week", () => {
    const totals = computeWeekTotals({
      ...week,
      workedMinutes: 1350, // three days worked
      leaveMinutes: 450, // one day off
      bankHolidayMinutes: 450, // one bank holiday
    });

    expect(totals.accountedMinutes).toBe(2250);
    expect(totals.matchesContract).toBe(true);
  });

  it("asks for a reason on a short week without blocking it", () => {
    const totals = computeWeekTotals({
      ...week,
      workedMinutes: 1800,
      leaveMinutes: 0,
      bankHolidayMinutes: 0,
    });

    expect(totals.varianceMinutes).toBe(-450);
    expect(requiresVarianceReason(totals)).toBe(true);
  });

  it("flags overtime the same way", () => {
    const totals = computeWeekTotals({
      ...week,
      workedMinutes: 2700,
      leaveMinutes: 0,
      bankHolidayMinutes: 0,
    });

    expect(totals.varianceMinutes).toBe(450);
    expect(requiresVarianceReason(totals)).toBe(true);
  });

  it("measures a part-timer against their own contract", () => {
    const partTime = { ...DEFAULT_PATTERN, thursdayMinutes: 0, fridayMinutes: 0 };
    const totals = computeWeekTotals({
      pattern: partTime,
      weekStart: "2026-09-14",
      workedMinutes: 1350,
      leaveMinutes: 0,
      bankHolidayMinutes: 0,
    });

    expect(totals.contractedMinutes).toBe(1350);
    expect(totals.matchesContract).toBe(true);
  });
});

describe("week locking", () => {
  it("locks a week once submitted, and reopens it on rejection", () => {
    expect(isEditableByOwner("OPEN")).toBe(true);
    expect(isEditableByOwner("REJECTED")).toBe(true);
    expect(isEditableByOwner("SUBMITTED")).toBe(false);
    expect(isEditableByOwner("APPROVED")).toBe(false);
  });
});
