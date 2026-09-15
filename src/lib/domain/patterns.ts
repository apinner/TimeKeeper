import { dayOfWeek, type PlainDate, weekDates } from "@/lib/dates";

/** Shape matches the WorkingPattern model, so Prisma rows pass straight in. */
export interface PatternMinutes {
  mondayMinutes: number;
  tuesdayMinutes: number;
  wednesdayMinutes: number;
  thursdayMinutes: number;
  fridayMinutes: number;
  saturdayMinutes: number;
  sundayMinutes: number;
}

/** 37.5 hours over Monday to Friday. */
export const DEFAULT_PATTERN: PatternMinutes = {
  mondayMinutes: 450,
  tuesdayMinutes: 450,
  wednesdayMinutes: 450,
  thursdayMinutes: 450,
  fridayMinutes: 450,
  saturdayMinutes: 0,
  sundayMinutes: 0,
};

const BY_DAY_OF_WEEK: (keyof PatternMinutes)[] = [
  "sundayMinutes",
  "mondayMinutes",
  "tuesdayMinutes",
  "wednesdayMinutes",
  "thursdayMinutes",
  "fridayMinutes",
  "saturdayMinutes",
];

/** Contracted minutes for the weekday this date falls on. */
export function patternMinutesFor(pattern: PatternMinutes, date: PlainDate): number {
  return pattern[BY_DAY_OF_WEEK[dayOfWeek(date)]];
}

export function isWorkingDay(pattern: PatternMinutes, date: PlainDate): boolean {
  return patternMinutesFor(pattern, date) > 0;
}

export function weeklyMinutes(pattern: PatternMinutes): number {
  return BY_DAY_OF_WEEK.reduce((total, key) => total + pattern[key], 0);
}

export function workingDaysPerWeek(pattern: PatternMinutes): number {
  return BY_DAY_OF_WEEK.filter((key) => pattern[key] > 0).length;
}

/**
 * The divisor for showing balances in days. A four-day week of 30 hours gives
 * a 7.5 hour day, so 150 minutes of leave reads as "0.33 days" rather than
 * being measured against someone else's working day.
 */
export function averageDayMinutes(pattern: PatternMinutes): number {
  const days = workingDaysPerWeek(pattern);
  return days === 0 ? 0 : Math.round(weeklyMinutes(pattern) / days);
}

/** Contracted minutes across a Monday-start week. */
export function contractedMinutesForWeek(pattern: PatternMinutes, weekStart: PlainDate): number {
  return weekDates(weekStart).reduce((total, date) => total + patternMinutesFor(pattern, date), 0);
}
