import { describe, expect, it } from "vitest";
import {
  addDays,
  eachDateInRange,
  formatDate,
  startOfWeek,
  toDbDate,
  toPlainDate,
  weekDates,
} from "@/lib/dates";

describe("plain dates", () => {
  it("round-trips through the database representation", () => {
    expect(toPlainDate(toDbDate("2026-03-29"))).toBe("2026-03-29");
  });

  it("survives the spring BST transition", () => {
    // 29 March 2026 is when UK clocks go forward. A date must not drift.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(toPlainDate(toDbDate("2026-10-25"))).toBe("2026-10-25");
  });

  it("starts weeks on Monday", () => {
    expect(startOfWeek("2026-09-15")).toBe("2026-09-14"); // Tuesday -> Monday
    expect(startOfWeek("2026-09-14")).toBe("2026-09-14"); // Monday -> itself
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14"); // Sunday -> back 6
  });

  it("enumerates inclusive ranges and empty ones", () => {
    expect(eachDateInRange("2026-01-01", "2026-01-03")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(eachDateInRange("2026-01-03", "2026-01-01")).toEqual([]);
    expect(weekDates("2026-09-14")).toHaveLength(7);
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });

  it("formats for UK readers", () => {
    expect(formatDate("2026-09-15")).toBe("15/09/2026");
  });
});
