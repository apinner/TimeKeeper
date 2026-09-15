/**
 * Durations are stored as integer minutes everywhere. These helpers convert to
 * the decimal hours people type, and to the days people think in.
 */

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** "7.5" — trailing zeros trimmed, so 8 hours reads "8" not "8.00". */
export function formatHours(minutes: number): string {
  const hours = minutesToHours(minutes);
  return Number.isInteger(hours) ? String(hours) : String(hours);
}

export function formatHoursLabel(minutes: number): string {
  return `${formatHours(minutes)}h`;
}

/**
 * Days, for humans. A part-timer's day is shorter than a full-timer's, so the
 * divisor is that person's own average working day.
 */
export function minutesToDays(minutes: number, averageDayMinutes: number): number {
  if (averageDayMinutes <= 0) return 0;
  return Math.round((minutes / averageDayMinutes) * 100) / 100;
}

export function formatDays(minutes: number, averageDayMinutes: number): string {
  const days = minutesToDays(minutes, averageDayMinutes);
  const rounded = Math.round(days * 2) / 2;
  const value = Math.abs(days - rounded) < 0.01 ? rounded : days;
  return `${value} ${Math.abs(value) === 1 ? "day" : "days"}`;
}

/** Accepts "7.5", "7:30" and "7h30". Returns minutes, or null if unparseable. */
export function parseHoursInput(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "");
  if (trimmed === "") return 0;

  const colon = trimmed.match(/^(\d+)[:h](\d{1,2})$/i);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (m > 59) return null;
    return h * 60 + m;
  }

  const decimal = trimmed.match(/^(\d+(?:\.\d+)?)h?$/i);
  if (decimal) return hoursToMinutes(Number(decimal[1]));

  return null;
}
