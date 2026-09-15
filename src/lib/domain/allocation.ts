import { eachDateInRange, type PlainDate } from "@/lib/dates";
import { patternMinutesFor, type PatternMinutes } from "./patterns";

export interface DayAllocation {
  date: PlainDate;
  minutes: number;
}

export interface AllocationInput {
  start: PlainDate;
  end: PlainDate;
  pattern: PatternMinutes;
  /** Dates to skip entirely: the company is closed and nobody spends leave. */
  bankHolidays?: Set<PlainDate> | PlainDate[];
}

/**
 * The default shape of a leave request: every working day in the range, filled
 * with that person's contracted minutes for that weekday.
 *
 * Leave is booked in hours, so the employee can then edit any day down — half a
 * day, or two hours for a dentist appointment. Non-working days and bank
 * holidays are omitted rather than zeroed, so a request spanning a weekend
 * costs nothing extra.
 */
export function defaultAllocation(input: AllocationInput): DayAllocation[] {
  const holidays = toSet(input.bankHolidays);
  return eachDateInRange(input.start, input.end)
    .filter((date) => !holidays.has(date))
    .map((date) => ({ date, minutes: patternMinutesFor(input.pattern, date) }))
    .filter((day) => day.minutes > 0);
}

/**
 * Clamp edited allocations back to what is legitimate: no negative hours, never
 * more than the contracted day, no bank holidays, no non-working days.
 */
export function sanitiseAllocation(
  allocations: DayAllocation[],
  pattern: PatternMinutes,
  bankHolidays?: Set<PlainDate> | PlainDate[],
): DayAllocation[] {
  const holidays = toSet(bankHolidays);
  return allocations
    .filter((day) => !holidays.has(day.date))
    .map((day) => {
      const contracted = patternMinutesFor(pattern, day.date);
      const minutes = Math.max(0, Math.min(Math.round(day.minutes), contracted));
      return { date: day.date, minutes };
    })
    .filter((day) => day.minutes > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function totalMinutes(allocations: DayAllocation[]): number {
  return allocations.reduce((total, day) => total + day.minutes, 0);
}

function toSet(dates?: Set<PlainDate> | PlainDate[]): Set<PlainDate> {
  if (!dates) return new Set();
  return dates instanceof Set ? dates : new Set(dates);
}
