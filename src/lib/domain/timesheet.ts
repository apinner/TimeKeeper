import type { PlainDate } from "@/lib/dates";
import { contractedMinutesForWeek, type PatternMinutes } from "./patterns";

export interface WeekTotalsInput {
  pattern: PatternMinutes;
  weekStart: PlainDate;
  /** Hours typed into project/task cells. */
  workedMinutes: number;
  /** Approved leave falling in this week, auto-filled as read-only rows. */
  leaveMinutes: number;
  /** Bank holidays in this week, auto-filled as read-only rows. */
  bankHolidayMinutes: number;
}

export interface WeekTotals {
  contractedMinutes: number;
  workedMinutes: number;
  leaveMinutes: number;
  bankHolidayMinutes: number;
  accountedMinutes: number;
  varianceMinutes: number;
  matchesContract: boolean;
}

/**
 * A week is "accounted for" when worked hours plus auto-filled leave and bank
 * holidays equal contracted hours. A mismatch asks for a reason at submission
 * but never blocks: people do genuinely work short and long weeks.
 */
export function computeWeekTotals(input: WeekTotalsInput): WeekTotals {
  const contractedMinutes = contractedMinutesForWeek(input.pattern, input.weekStart);
  const accountedMinutes =
    input.workedMinutes + input.leaveMinutes + input.bankHolidayMinutes;

  return {
    contractedMinutes,
    workedMinutes: input.workedMinutes,
    leaveMinutes: input.leaveMinutes,
    bankHolidayMinutes: input.bankHolidayMinutes,
    accountedMinutes,
    varianceMinutes: accountedMinutes - contractedMinutes,
    matchesContract: accountedMinutes === contractedMinutes,
  };
}

export function requiresVarianceReason(totals: WeekTotals): boolean {
  return !totals.matchesContract;
}

/** Employees edit only an open or rejected week; everything else is locked. */
export function isEditableByOwner(status: "OPEN" | "SUBMITTED" | "APPROVED" | "REJECTED"): boolean {
  return status === "OPEN" || status === "REJECTED";
}
