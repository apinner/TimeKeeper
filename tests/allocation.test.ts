import { describe, expect, it } from "vitest";
import { defaultAllocation, sanitiseAllocation, totalMinutes } from "@/lib/domain/allocation";
import { DEFAULT_PATTERN } from "@/lib/domain/patterns";

const partTime = { ...DEFAULT_PATTERN, fridayMinutes: 0, thursdayMinutes: 240 };

describe("leave allocation", () => {
  it("fills working days and skips the weekend", () => {
    // Friday 18th to Monday 21st September 2026.
    const days = defaultAllocation({
      start: "2026-09-18",
      end: "2026-09-21",
      pattern: DEFAULT_PATTERN,
    });

    expect(days.map((d) => d.date)).toEqual(["2026-09-18", "2026-09-21"]);
    expect(totalMinutes(days)).toBe(900);
  });

  it("does not spend leave on a bank holiday", () => {
    const days = defaultAllocation({
      start: "2026-12-24",
      end: "2026-12-29",
      pattern: DEFAULT_PATTERN,
      bankHolidays: ["2026-12-25", "2026-12-28"],
    });

    expect(days.map((d) => d.date)).toEqual(["2026-12-24", "2026-12-29"]);
  });

  it("charges a part-timer their own hours, and nothing on a non-working day", () => {
    const days = defaultAllocation({
      start: "2026-09-17",
      end: "2026-09-18",
      pattern: partTime,
    });

    expect(days).toEqual([{ date: "2026-09-17", minutes: 240 }]);
  });

  it("clamps edited hours to the contracted day", () => {
    const cleaned = sanitiseAllocation(
      [
        { date: "2026-09-14", minutes: 900 }, // more than a working day
        { date: "2026-09-15", minutes: -60 }, // negative
        { date: "2026-09-16", minutes: 120 }, // a two-hour appointment
        { date: "2026-09-19", minutes: 450 }, // a Saturday
      ],
      DEFAULT_PATTERN,
    );

    expect(cleaned).toEqual([
      { date: "2026-09-14", minutes: 450 },
      { date: "2026-09-16", minutes: 120 },
    ]);
  });
});
