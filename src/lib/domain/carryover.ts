import type { PlainDate } from "@/lib/dates";

export interface CarryoverInput {
  /** Remaining balance at the end of the leave year. May be negative. */
  remainingMinutes: number;
  capMinutes: number;
}

export interface CarryoverResult {
  carriedOverMinutes: number;
  forfeitedMinutes: number;
}

/**
 * Year-end roll forward.
 *
 * A negative balance carries forward in full as a negative opening balance:
 * over-booking is permitted at the manager's discretion, and quietly zeroing
 * the debt at midnight on 31 December would hide it.
 */
export function computeCarryover(input: CarryoverInput): CarryoverResult {
  if (input.remainingMinutes <= 0) {
    return { carriedOverMinutes: input.remainingMinutes, forfeitedMinutes: 0 };
  }
  const cap = Math.max(0, input.capMinutes);
  const carriedOverMinutes = Math.min(input.remainingMinutes, cap);
  return {
    carriedOverMinutes,
    forfeitedMinutes: input.remainingMinutes - carriedOverMinutes,
  };
}

export interface ExpiryConfig {
  carryoverExpiryDay: number;
  carryoverExpiryMonth: number;
}

/**
 * The date carried-over leave lapses, within the leave year it was carried
 * into. If the configured day/month falls before the leave year starts, it
 * belongs to the following calendar year.
 */
export function carryoverExpiryDate(
  leaveYearStart: PlainDate,
  config: ExpiryConfig,
): PlainDate {
  const year = Number(leaveYearStart.slice(0, 4));
  const sameYear = plain(year, config.carryoverExpiryMonth, config.carryoverExpiryDay);
  return sameYear >= leaveYearStart
    ? sameYear
    : plain(year + 1, config.carryoverExpiryMonth, config.carryoverExpiryDay);
}

function plain(year: number, month: number, day: number): PlainDate {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
