/**
 * Plain calendar dates, as "YYYY-MM-DD" strings.
 *
 * Leave and timesheets are calendar facts, not instants: a Tuesday booked off
 * must stay Tuesday regardless of server timezone or a BST transition. All
 * domain logic works on plain date strings; conversion to Date happens only at
 * the database boundary, where Postgres `date` columns are read and written at
 * UTC midnight.
 */

export type PlainDate = string;

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isPlainDate(value: string): value is PlainDate {
  return PLAIN_DATE.test(value);
}

/** Database Date (UTC midnight) -> plain date. */
export function toPlainDate(date: Date): PlainDate {
  return date.toISOString().slice(0, 10);
}

/** Plain date -> Date at UTC midnight, for a Postgres `date` column. */
export function toDbDate(date: PlainDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toPlainDate(d);
}

/** 0 = Sunday ... 6 = Saturday, matching Date.getUTCDay(). */
export function dayOfWeek(date: PlainDate): number {
  return toDbDate(date).getUTCDay();
}

/** The Monday on or before the given date. Weeks start Monday (UK). */
export function startOfWeek(date: PlainDate): PlainDate {
  const dow = dayOfWeek(date);
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return addDays(date, -backToMonday);
}

export function eachDateInRange(start: PlainDate, end: PlainDate): PlainDate[] {
  if (end < start) return [];
  const dates: PlainDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export function weekDates(weekStart: PlainDate): PlainDate[] {
  return eachDateInRange(weekStart, addDays(weekStart, 6));
}

export function today(now: Date = new Date()): PlainDate {
  // The container runs with TZ=Europe/London, so local date is the UK date.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** dd/mm/yyyy for display. */
export function formatDate(date: PlainDate): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatLongDate(date: PlainDate): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function weekdayName(date: PlainDate): string {
  return WEEKDAYS[dayOfWeek(date)];
}

export function shortWeekdayName(date: PlainDate): string {
  return weekdayName(date).slice(0, 3);
}

export function monthName(month: number): string {
  return MONTHS[month - 1];
}
