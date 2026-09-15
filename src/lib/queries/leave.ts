import { prisma } from "@/lib/db";
import { type PlainDate, toDbDate, toPlainDate, today } from "@/lib/dates";
import { computeBalance, type Balance } from "@/lib/domain/balance";
import { carryoverExpiryDate } from "@/lib/domain/carryover";
import { leaveYearStartFor } from "@/lib/domain/leave-year";
import { averageDayMinutes, DEFAULT_PATTERN, type PatternMinutes } from "@/lib/domain/patterns";
import { getSettings } from "@/lib/settings";
import type { LeaveStatus } from "@prisma/client";

export async function patternFor(userId: string): Promise<PatternMinutes> {
  const pattern = await prisma.workingPattern.findUnique({ where: { userId } });
  return pattern ?? DEFAULT_PATTERN;
}

export interface BalanceSummary extends Balance {
  leaveYearStart: PlainDate;
  averageDayMinutes: number;
  allowanceMinutes: number;
  carriedOverMinutes: number;
  carryoverExpiresOn: PlainDate | null;
}

/**
 * The balance as a person sees it. Approved leave is subtracted; pending is
 * reported alongside so "remaining" never quietly assumes a decision.
 */
export async function balanceFor(
  userId: string,
  leaveYearStart?: PlainDate,
): Promise<BalanceSummary> {
  const settings = await getSettings();
  const asOf = today();
  const yearStart = leaveYearStart ?? leaveYearStartFor(asOf, settings);
  const yearStartDb = toDbDate(yearStart);

  const [pattern, entitlement, adjustments, leaveDays] = await Promise.all([
    patternFor(userId),
    prisma.entitlement.findUnique({
      where: { userId_leaveYearStart: { userId, leaveYearStart: yearStartDb } },
    }),
    prisma.balanceAdjustment.aggregate({
      where: { userId, leaveYearStart: yearStartDb },
      _sum: { minutes: true },
    }),
    leaveMinutesByStatus(userId, yearStart),
  ]);

  const carryoverExpiresOn = entitlement?.carryoverExpiresOn
    ? toPlainDate(entitlement.carryoverExpiresOn)
    : entitlement && entitlement.carriedOverMinutes > 0
      ? carryoverExpiryDate(yearStart, settings)
      : null;

  const balance = computeBalance({
    allowanceMinutes: entitlement?.allowanceMinutes ?? 0,
    carriedOverMinutes: entitlement?.carriedOverMinutes ?? 0,
    carryoverExpiresOn,
    adjustmentMinutes: adjustments._sum.minutes ?? 0,
    approvedMinutes: leaveDays.approved,
    pendingMinutes: leaveDays.pending,
    asOf,
  });

  return {
    ...balance,
    leaveYearStart: yearStart,
    averageDayMinutes: averageDayMinutes(pattern),
    allowanceMinutes: entitlement?.allowanceMinutes ?? 0,
    carriedOverMinutes: entitlement?.carriedOverMinutes ?? 0,
    carryoverExpiresOn,
  };
}

/** Only types flagged as deducting count against the allowance. */
async function leaveMinutesByStatus(
  userId: string,
  leaveYearStart: PlainDate,
): Promise<{ approved: number; pending: number }> {
  const yearEnd = new Date(toDbDate(leaveYearStart));
  yearEnd.setUTCFullYear(yearEnd.getUTCFullYear() + 1);
  yearEnd.setUTCDate(yearEnd.getUTCDate() - 1);

  const days = await prisma.leaveDay.findMany({
    where: {
      userId,
      date: { gte: toDbDate(leaveYearStart), lte: yearEnd },
      request: {
        status: { in: ["APPROVED", "PENDING"] },
        leaveType: { deductsFromAllowance: true },
      },
    },
    select: { minutes: true, request: { select: { status: true } } },
  });

  return days.reduce(
    (totals, day) => {
      if (day.request.status === "APPROVED") totals.approved += day.minutes;
      else totals.pending += day.minutes;
      return totals;
    },
    { approved: 0, pending: 0 },
  );
}

export async function listLeaveRequests(userId: string, statuses?: LeaveStatus[]) {
  return prisma.leaveRequest.findMany({
    where: { userId, ...(statuses ? { status: { in: statuses } } : {}) },
    include: { leaveType: true, days: { orderBy: { date: "asc" } }, decidedBy: true },
    orderBy: { startDate: "desc" },
  });
}

export interface AbsenceEntry {
  userId: string;
  userName: string;
  date: PlainDate;
  minutes: number;
  typeName: string;
  colour: string;
  status: LeaveStatus;
}

/** Everyone's absence in a window: the team calendar and clash detection. */
export async function absencesBetween(
  from: PlainDate,
  to: PlainDate,
  options: { userIds?: string[]; includePending?: boolean } = {},
): Promise<AbsenceEntry[]> {
  const statuses: LeaveStatus[] = options.includePending
    ? ["APPROVED", "PENDING"]
    : ["APPROVED"];

  const days = await prisma.leaveDay.findMany({
    where: {
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      ...(options.userIds ? { userId: { in: options.userIds } } : {}),
      request: { status: { in: statuses } },
    },
    include: {
      user: { select: { id: true, name: true, upn: true } },
      request: { select: { status: true, leaveType: true } },
    },
    orderBy: { date: "asc" },
  });

  return days.map((day) => ({
    userId: day.userId,
    userName: day.user.name ?? day.user.upn,
    date: toPlainDate(day.date),
    minutes: day.minutes,
    typeName: day.request.leaveType.name,
    colour: day.request.leaveType.colour,
    status: day.request.status,
  }));
}

/**
 * Who else in the same team is off during these dates. Shown to the approver so
 * the cover decision is theirs, made with the facts in front of them.
 */
export async function clashesFor(
  userId: string,
  from: PlainDate,
  to: PlainDate,
): Promise<AbsenceEntry[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];

  const colleagues = await prisma.user.findMany({
    where: {
      id: { not: userId },
      isActive: true,
      OR: [
        ...(user.managerId ? [{ managerId: user.managerId }] : []),
        ...(user.department ? [{ department: user.department }] : []),
        { managerId: userId },
      ],
    },
    select: { id: true },
  });

  if (colleagues.length === 0) return [];
  return absencesBetween(from, to, { userIds: colleagues.map((c) => c.id) });
}
