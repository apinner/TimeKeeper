import { prisma } from "@/lib/db";
import { startOfWeek, toDbDate, type PlainDate, today } from "@/lib/dates";
import { computeCarryover, carryoverExpiryDate } from "@/lib/domain/carryover";
import { leaveYearStartFor } from "@/lib/domain/leave-year";
import { sendMail } from "@/lib/email/mailer";
import { managerDigest, timesheetReminder } from "@/lib/email/templates";
import { balanceFor } from "@/lib/queries/leave";
import { getSettings } from "@/lib/settings";

/** Friday nudge to anyone whose current week is still unsubmitted. */
export async function sendTimesheetReminders(now: PlainDate = today()): Promise<number> {
  const settings = await getSettings();
  if (!settings.timesheetRemindersOn) return 0;

  const weekStart = startOfWeek(now);
  const people = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { timesheets: { none: { weekStart: toDbDate(weekStart) } } },
        {
          timesheets: {
            some: { weekStart: toDbDate(weekStart), status: { in: ["OPEN", "REJECTED"] } },
          },
        },
      ],
    },
  });

  for (const person of people) {
    await sendMail(timesheetReminder({ owner: person, weekStart }));
  }
  return people.length;
}

/** Monday digest to anyone with items waiting on them. */
export async function sendManagerDigests(): Promise<number> {
  const settings = await getSettings();
  if (!settings.managerDigestOn) return 0;

  const approvers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { reports: { some: {} } },
        { role: { in: ["HR_ADMIN", "SYSADMIN"] } },
        { delegationsReceived: { some: {} } },
      ],
    },
  });

  let sent = 0;
  for (const approver of approvers) {
    const isAdmin = approver.role === "HR_ADMIN" || approver.role === "SYSADMIN";
    const scope = isAdmin
      ? {}
      : { approverId: { in: [approver.id, ...(await delegatedManagerIds(approver.id))] } };

    const [pendingLeave, pendingTimesheets] = await Promise.all([
      prisma.leaveRequest.count({
        where: { status: "PENDING", userId: { not: approver.id }, ...scope },
      }),
      prisma.timesheet.count({
        where: { status: "SUBMITTED", userId: { not: approver.id }, ...scope },
      }),
    ]);

    if (pendingLeave + pendingTimesheets === 0) continue;
    await sendMail(managerDigest({ approver, pendingLeave, pendingTimesheets }));
    sent += 1;
  }
  return sent;
}

async function delegatedManagerIds(userId: string): Promise<string[]> {
  const now = toDbDate(today());
  const delegations = await prisma.delegation.findMany({
    where: { delegateId: userId, startDate: { lte: now }, endDate: { gte: now } },
    select: { managerId: true },
  });
  return delegations.map((delegation) => delegation.managerId);
}

/**
 * Year-end roll forward, run on the first day of the new leave year.
 *
 * Unused leave carries over up to the cap and lapses on the expiry date;
 * anything above the cap is forfeited. A negative balance carries forward in
 * full as a negative opening balance rather than being written off, because
 * over-booking was a deliberate decision someone made.
 */
export async function runYearEndRollover(now: PlainDate = today()): Promise<number> {
  const settings = await getSettings();
  const newYearStart = leaveYearStartFor(now, settings);
  if (newYearStart !== now) return 0;

  const previousYearStart = shiftYear(newYearStart, -1);
  const people = await prisma.user.findMany({ where: { isActive: true } });
  let processed = 0;

  for (const person of people) {
    const existing = await prisma.entitlement.findUnique({
      where: {
        userId_leaveYearStart: { userId: person.id, leaveYearStart: toDbDate(newYearStart) },
      },
    });
    if (existing) continue;

    const previous = await prisma.entitlement.findUnique({
      where: {
        userId_leaveYearStart: { userId: person.id, leaveYearStart: toDbDate(previousYearStart) },
      },
    });

    const carryover = previous
      ? computeCarryover({
          remainingMinutes: (await balanceFor(person.id, previousYearStart)).remainingMinutes,
          capMinutes: settings.carryoverCapMinutes,
        })
      : { carriedOverMinutes: 0, forfeitedMinutes: 0 };

    await prisma.entitlement.create({
      data: {
        userId: person.id,
        leaveYearStart: toDbDate(newYearStart),
        // Their agreed allowance carries forward; the company default is only
        // used for somebody who has never had one set.
        allowanceMinutes: previous?.allowanceMinutes ?? settings.defaultAllowanceMinutes,
        carriedOverMinutes: carryover.carriedOverMinutes,
        carryoverExpiresOn: toDbDate(carryoverExpiryDate(newYearStart, settings)),
      },
    });
    processed += 1;
  }

  return processed;
}

function shiftYear(date: PlainDate, years: number): PlainDate {
  const [year, rest] = [date.slice(0, 4), date.slice(4)];
  return `${Number(year) + years}${rest}`;
}
