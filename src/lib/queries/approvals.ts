import { prisma } from "@/lib/db";
import { activeDelegationsFor, isAdmin, type SessionUser } from "@/lib/session";
import type { Prisma } from "@prisma/client";

/**
 * What lands in someone's approval queue.
 *
 * HR and sysadmins see everything pending, which is what stops a queue rotting
 * while its owner is away and what covers requests routed to the shared HR
 * queue because the requester has no line manager. Everyone else sees what was
 * routed to them, plus anything routed to a manager they are currently
 * standing in for.
 */
async function approverIds(user: SessionUser): Promise<string[]> {
  const delegated = await activeDelegationsFor(user.id);
  return [user.id, ...delegated];
}

export async function leaveQueueWhere(user: SessionUser): Promise<Prisma.LeaveRequestWhereInput> {
  if (isAdmin(user)) return { status: "PENDING", userId: { not: user.id } };
  return {
    status: "PENDING",
    userId: { not: user.id },
    approverId: { in: await approverIds(user) },
  };
}

export async function timesheetQueueWhere(
  user: SessionUser,
): Promise<Prisma.TimesheetWhereInput> {
  if (isAdmin(user)) return { status: "SUBMITTED", userId: { not: user.id } };
  return {
    status: "SUBMITTED",
    userId: { not: user.id },
    approverId: { in: await approverIds(user) },
  };
}

export async function pendingApprovalCount(user: SessionUser): Promise<number> {
  const [leaveWhere, timesheetWhere] = await Promise.all([
    leaveQueueWhere(user),
    timesheetQueueWhere(user),
  ]);
  const [leave, timesheets] = await Promise.all([
    prisma.leaveRequest.count({ where: leaveWhere }),
    prisma.timesheet.count({ where: timesheetWhere }),
  ]);
  return leave + timesheets;
}

export async function pendingLeaveRequests(user: SessionUser) {
  return prisma.leaveRequest.findMany({
    where: await leaveQueueWhere(user),
    include: {
      user: { select: { id: true, name: true, upn: true, department: true, managerId: true } },
      leaveType: true,
      days: { orderBy: { date: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function pendingTimesheets(user: SessionUser) {
  return prisma.timesheet.findMany({
    where: await timesheetQueueWhere(user),
    include: {
      user: { select: { id: true, name: true, upn: true } },
      entries: { include: { task: { include: { project: true } } } },
    },
    orderBy: { weekStart: "asc" },
  });
}
