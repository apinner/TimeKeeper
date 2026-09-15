import { describe, expect, it } from "vitest";
import {
  formatLeaveYear,
  leaveYearEndFor,
  leaveYearStartFor,
  proRataAllowanceMinutes,
} from "@/lib/domain/leave-year";
import { DEFAULT_PATTERN } from "@/lib/domain/patterns";

describe("leave year boundaries", () => {
  const january = { leaveYearStartDay: 1, leaveYearStartMonth: 1 };
  const april = { leaveYearStartDay: 1, leaveYearStartMonth: 4 };

  it("finds the year containing a date", () => {
    expect(leaveYearStartFor("2026-09-15", january)).toBe("2026-01-01");
    expect(leaveYearStartFor("2026-01-01", january)).toBe("2026-01-01");
    expect(leaveYearStartFor("2026-03-31", april)).toBe("2025-04-01");
    expect(leaveYearStartFor("2026-04-01", april)).toBe("2026-04-01");
  });

  it("ends the day before the next one starts", () => {
    expect(leaveYearEndFor("2026-01-01")).toBe("2026-12-31");
    expect(leaveYearEndFor("2026-04-01")).toBe("2027-03-31");
  });

  it("labels years the way people say them", () => {
    expect(formatLeaveYear("2026-01-01")).toBe("2026");
    expect(formatLeaveYear("2026-04-01")).toBe("2026/27");
  });
});

describe("pro-rata allowance for starters", () => {
  const leaveYearStart = "2026-01-01";
  const full = 11250; // 25 days

  it("gives the full allowance to someone who started before the year", () => {
    expect(proRataAllowanceMinutes(full, DEFAULT_PATTERN, leaveYearStart, "2025-06-01")).toBe(full);
  });

  it("gives roughly half to a July starter", () => {
    const minutes = proRataAllowanceMinutes(full, DEFAULT_PATTERN, leaveYearStart, "2026-07-01");
    expect(minutes / full).toBeGreaterThan(0.48);
    expect(minutes / full).toBeLessThan(0.52);
  });

  it("gives nothing to someone starting after the year ends", () => {
    expect(proRataAllowanceMinutes(full, DEFAULT_PATTERN, leaveYearStart, "2027-01-01")).toBe(0);
  });

  it("pro-rates by contracted hours, not calendar days", () => {
    // Someone who only works Mondays starting mid-December earns almost nothing.
    const mondaysOnly = {
      mondayMinutes: 450, tuesdayMinutes: 0, wednesdayMinutes: 0, thursdayMinutes: 0,
      fridayMinutes: 0, saturdayMinutes: 0, sundayMinutes: 0,
    };
    const minutes = proRataAllowanceMinutes(full, mondaysOnly, leaveYearStart, "2026-12-15");
    expect(minutes).toBeLessThan(full * 0.05);
  });
});
