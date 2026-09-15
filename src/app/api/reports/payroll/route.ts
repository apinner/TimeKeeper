import { prisma } from "@/lib/db";
import { addDays, formatDate, startOfWeek, toDbDate, today } from "@/lib/dates";
import { minutesToHours } from "@/lib/duration";
import { csvResponse, toCsv } from "@/lib/csv";
import { reportableUserIds, scopeFilter } from "@/lib/queries/scope";
import { canApproveAnything, getCurrentUser } from "@/lib/session";

/**
 * The monthly payroll file: one row per person, with worked hours separated
 * from paid and unpaid absence so they can be handled differently.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !(await canApproveAnything(user))) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? today();
  const from = url.searchParams.get("from") ?? addDays(startOfWeek(to), -28);
  const scope = await reportableUserIds(user);

  const [people, entries, leaveDays] = await Promise.all([
    prisma.user.findMany({
      where: { ...(scope ? { id: { in: scope } } : {}) },
      select: { id: true, name: true, upn: true, department: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeEntry.findMany({
      where: {
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        timesheet: { status: "APPROVED", ...scopeFilter(scope) },
      },
      include: { timesheet: { select: { userId: true } } },
    }),
    prisma.leaveDay.findMany({
      where: {
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        ...(scope ? { userId: { in: scope } } : {}),
        request: { status: "APPROVED" },
      },
      include: { request: { select: { leaveType: true } } },
    }),
  ]);

  const worked = new Map<string, number>();
  for (const entry of entries) {
    worked.set(entry.timesheet.userId, (worked.get(entry.timesheet.userId) ?? 0) + entry.minutes);
  }

  const paidLeave = new Map<string, number>();
  const unpaidLeave = new Map<string, number>();
  for (const day of leaveDays) {
    const target = day.request.leaveType.isPaid ? paidLeave : unpaidLeave;
    target.set(day.userId, (target.get(day.userId) ?? 0) + day.minutes);
  }

  const rows = people
    .filter(
      (person) =>
        worked.has(person.id) || paidLeave.has(person.id) || unpaidLeave.has(person.id),
    )
    .map((person) => {
      const workedMinutes = worked.get(person.id) ?? 0;
      const paidMinutes = paidLeave.get(person.id) ?? 0;
      const unpaidMinutes = unpaidLeave.get(person.id) ?? 0;
      return [
        person.name ?? person.upn,
        person.upn,
        person.department ?? "",
        person.isActive ? "Active" : "Inactive",
        minutesToHours(workedMinutes),
        minutesToHours(paidMinutes),
        minutesToHours(unpaidMinutes),
        minutesToHours(workedMinutes + paidMinutes),
      ];
    });

  const csv = toCsv(
    [
      "Name",
      "UPN",
      "Department",
      "Status",
      "Worked hours",
      "Paid absence hours",
      "Unpaid absence hours",
      "Total payable hours",
    ],
    rows,
  );

  return csvResponse(
    `payroll-${from}-to-${to}.csv`,
    `﻿Period,${formatDate(from)} to ${formatDate(to)}\r\nApproved timesheets only\r\n\r\n${csv.slice(1)}`,
  );
}
