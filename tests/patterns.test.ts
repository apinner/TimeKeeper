import { describe, expect, it } from "vitest";
import {
  averageDayMinutes,
  contractedMinutesForWeek,
  DEFAULT_PATTERN,
  isWorkingDay,
  patternMinutesFor,
  weeklyMinutes,
  workingDaysPerWeek,
} from "@/lib/domain/patterns";

const fourDayWeek = {
  mondayMinutes: 450,
  tuesdayMinutes: 450,
  wednesdayMinutes: 450,
  thursdayMinutes: 240,
  fridayMinutes: 0,
  saturdayMinutes: 0,
  sundayMinutes: 0,
};

describe("working patterns", () => {
  it("reads the right weekday", () => {
    expect(patternMinutesFor(DEFAULT_PATTERN, "2026-09-14")).toBe(450); // Monday
    expect(patternMinutesFor(DEFAULT_PATTERN, "2026-09-19")).toBe(0); // Saturday
    expect(patternMinutesFor(fourDayWeek, "2026-09-18")).toBe(0); // Friday off
  });

  it("totals a standard week at 37.5 hours", () => {
    expect(weeklyMinutes(DEFAULT_PATTERN)).toBe(2250);
    expect(contractedMinutesForWeek(DEFAULT_PATTERN, "2026-09-14")).toBe(2250);
  });

  it("derives an average day from the days actually worked", () => {
    expect(workingDaysPerWeek(fourDayWeek)).toBe(4);
    expect(weeklyMinutes(fourDayWeek)).toBe(1590);
    expect(averageDayMinutes(fourDayWeek)).toBe(398);
    expect(averageDayMinutes(DEFAULT_PATTERN)).toBe(450);
  });

  it("treats a zero-hour weekday as a non-working day", () => {
    expect(isWorkingDay(fourDayWeek, "2026-09-18")).toBe(false);
    expect(isWorkingDay(fourDayWeek, "2026-09-17")).toBe(true);
  });
});
