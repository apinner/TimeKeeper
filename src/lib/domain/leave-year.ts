import { addDays, eachDateInRange, type PlainDate, toDbDate, toPlainDate } from "@/lib/dates";
import { patternMinutesFor, type PatternMinutes } from "./patterns";

export interface LeaveYearConfig {
  leaveYearStartDay: number;
  leaveYearStartMonth: number;
}

/** The start of the leave year containing `date`. */
export function leaveYearStartFor(date: PlainDate, config: LeaveYearConfig): PlainDate {
  const [year] = date.split("-").map(Number);
  const candidate = plainFromParts(year, config.leaveYearStartMonth, config.leaveYearStartDay);
  return date >= candidate
    ? candidate
    : plainFromParts(year - 1, config.leaveYearStartMonth, config.leaveYearStartDay);
}

export function leaveYearEndFor(start: PlainDate): PlainDate {
  const d = toDbDate(start);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return addDays(toPlainDate(d), -1);
}

export function nextLeaveYearStart(start: PlainDate): PlainDate {
  const d = toDbDate(start);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return toPlainDate(d);
}

export function formatLeaveYear(start: PlainDate): string {
  const end = leaveYearEndFor(start);
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}/${endYear.slice(2)}`;
}

/**
 * A starter part-way through the leave year earns a share of the allowance,
 * pro-rated by contracted minutes remaining rather than by calendar days, so a
 * part-timer starting in July is not over-credited.
 */
export function proRataAllowanceMinutes(
  fullAllowanceMinutes: number,
  pattern: PatternMinutes,
  leaveYearStart: PlainDate,
  startDate: PlainDate,
): number {
  const leaveYearEnd = leaveYearEndFor(leaveYearStart);
  if (startDate <= leaveYearStart) return fullAllowanceMinutes;
  if (startDate > leaveYearEnd) return 0;

  const total = contractedMinutesBetween(pattern, leaveYearStart, leaveYearEnd);
  if (total === 0) return 0;
  const remaining = contractedMinutesBetween(pattern, startDate, leaveYearEnd);
  return Math.round((fullAllowanceMinutes * remaining) / total);
}

function contractedMinutesBetween(
  pattern: PatternMinutes,
  start: PlainDate,
  end: PlainDate,
): number {
  return eachDateInRange(start, end).reduce(
    (total, date) => total + patternMinutesFor(pattern, date),
    0,
  );
}

function plainFromParts(year: number, month: number, day: number): PlainDate {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
