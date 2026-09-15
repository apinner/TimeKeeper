import { describe, expect, it } from "vitest";
import { formatDays, minutesToDays, parseHoursInput } from "@/lib/duration";

describe("duration parsing", () => {
  it("accepts the ways people type hours", () => {
    expect(parseHoursInput("7.5")).toBe(450);
    expect(parseHoursInput("7:30")).toBe(450);
    expect(parseHoursInput("7h30")).toBe(450);
    expect(parseHoursInput("8")).toBe(480);
    expect(parseHoursInput(" 8 ")).toBe(480);
    expect(parseHoursInput("")).toBe(0);
  });

  it("rejects nonsense rather than guessing", () => {
    expect(parseHoursInput("abc")).toBeNull();
    expect(parseHoursInput("7:75")).toBeNull();
    expect(parseHoursInput("-3")).toBeNull();
  });
});

describe("days display", () => {
  it("measures a part-timer against their own working day", () => {
    const fullTimeDay = 450; // 7.5h
    const partTimeDay = 360; // 6h

    expect(minutesToDays(450, fullTimeDay)).toBe(1);
    expect(minutesToDays(450, partTimeDay)).toBe(1.25);
    expect(formatDays(2250, fullTimeDay)).toBe("5 days");
    expect(formatDays(225, fullTimeDay)).toBe("0.5 days");
    expect(formatDays(450, fullTimeDay)).toBe("1 day");
  });
});
