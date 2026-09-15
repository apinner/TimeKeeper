"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { type PlainDate, toDbDate, toPlainDate, today } from "@/lib/dates";
import { sanitiseAllocation, totalMinutes } from "@/lib/domain/allocation";
import { assessOverdraft } from "@/lib/domain/balance";
import { canDecide, resolveApprover } from "@/lib/domain/routing";
import { sendMail } from "@/lib/email/mailer";
import { leaveCancelled, leaveDecided, leaveSubmitted } from "@/lib/email/templates";
import { balanceFor, patternFor } from "@/lib/queries/leave";
import { bankHolidaySet } from "@/lib/queries/bank-holidays";
import { activeDelegationsFor, isAdmin, requireUser } from "@/lib/session";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const createSchema = z.object({
  leaveTypeId: z.string().min(1, "Choose a type of leave"),
  start: dateSchema,
  end: dateSchema,
  note: z.string().max(500).optional(),
  // date -> minutes, edited by the employee. Leave is booked in hours.
  allocation: z.record(dateSchema, z.number().int().min(0).max(24 * 60)),
});

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function createLeaveRequest(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again" };
  }

  const { leaveTypeId, start, end, note } = parsed.data;
  if (end < start) return { ok: false, error: "The end date is before the start date" };

  const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!leaveType || !leaveType.isActive) return { ok: false, error: "That leave type is not available" };
  if (leaveType.requiresNote && !note?.trim()) {
    return { ok: false, error: `${leaveType.name} requires a note explaining the request` };
  }

  const [pattern, holidays] = await Promise.all([
    patternFor(user.id),
    bankHolidaySet(start, end),
  ]);

  const allocation = sanitiseAllocation(
    Object.entries(parsed.data.allocation).map(([date, minutes]) => ({ date, minutes })),
    pattern,
    holidays,
  );

  if (allocation.length === 0) {
    return { ok: false, error: "That range contains no working time to book" };
  }

  const overlapping = await prisma.leaveDay.findFirst({
    where: {
      userId: user.id,
      date: { in: allocation.map((day) => toDbDate(day.date)) },
      request: { status: { in: ["PENDING", "APPROVED"] } },
    },
    include: { request: { include: { leaveType: true } } },
  });
  if (overlapping) {
    return {
      ok: false,
      error: `You already have ${overlapping.request.leaveType.name.toLowerCase()} booked on ${toPlainDate(overlapping.date)}`,
    };
  }

  const requestMinutes = totalMinutes(allocation);

  // Over-booking warns rather than blocks: whether to allow it is the line
  // manager's decision, so the shortfall travels with the request.
  let overdraftMinutes = 0;
  if (leaveType.deductsFromAllowance) {
    const balance = await balanceFor(user.id);
    overdraftMinutes = assessOverdraft(balance, requestMinutes).shortfallMinutes;
  }

  const delegations = user.managerId
    ? await prisma.delegation.findMany({ where: { managerId: user.managerId } })
    : [];

  const routing = resolveApprover({
    requesterId: user.id,
    managerId: user.managerId,
    delegations: delegations.map((d) => ({
      managerId: d.managerId,
      delegateId: d.delegateId,
      startDate: toPlainDate(d.startDate),
      endDate: toPlainDate(d.endDate),
    })),
    onDate: today(),
  });

  const request = await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      leaveTypeId,
      startDate: toDbDate(allocation[0].date),
      endDate: toDbDate(allocation[allocation.length - 1].date),
      totalMinutes: requestMinutes,
      note: note?.trim() || null,
      status: leaveType.requiresApproval ? "PENDING" : "APPROVED",
      approverId: routing.approverId,
      ...(leaveType.requiresApproval ? {} : { decidedAt: new Date() }),
      days: {
        create: allocation.map((day) => ({
          userId: user.id,
          date: toDbDate(day.date),
          minutes: day.minutes,
        })),
      },
    },
  });

  if (leaveType.requiresApproval) {
    await notifyApprovers(routing.approverId, async (approver) => {
      const manager = routing.onBehalfOfId
        ? await prisma.user.findUnique({ where: { id: routing.onBehalfOfId } })
        : null;
      return leaveSubmitted({
        approver,
        requester: user,
        typeName: leaveType.name,
        start: allocation[0].date,
        end: allocation[allocation.length - 1].date,
        totalMinutes: requestMinutes,
        onBehalfOf: manager?.name ?? manager?.upn ?? null,
        overdraftMinutes,
      });
    });
  }

  revalidatePath("/leave");
  revalidatePath("/approvals");
  redirect(`/leave?submitted=${request.id}`);
}

const decideSchema = z.object({
  requestId: z.string().min(1),
  approve: z.boolean(),
  comment: z.string().max(500).optional(),
});

export async function decideLeaveRequest(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid decision" };

  const request = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.requestId },
    include: { user: true, leaveType: true },
  });
  if (!request) return { ok: false, error: "That request no longer exists" };
  if (request.status !== "PENDING") return { ok: false, error: "That request has already been decided" };

  const allowed = canDecide({
    actorId: user.id,
    actorRole: user.role,
    requesterId: request.userId,
    approverId: request.approverId,
    actingForManagerIds: await activeDelegationsFor(user.id),
  });
  if (!allowed) return { ok: false, error: "You cannot decide that request" };

  const onBehalfOfId =
    request.approverId && request.approverId !== user.id ? request.approverId : null;

  await prisma.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: parsed.data.approve ? "APPROVED" : "REJECTED",
      decidedById: user.id,
      decidedAt: new Date(),
      decisionComment: parsed.data.comment?.trim() || null,
      decidedOnBehalfOfId: onBehalfOfId,
    },
  });

  const onBehalfOf = onBehalfOfId
    ? await prisma.user.findUnique({ where: { id: onBehalfOfId } })
    : null;

  await sendMail(
    leaveDecided({
      requester: request.user,
      decider: user,
      approved: parsed.data.approve,
      typeName: request.leaveType.name,
      start: toPlainDate(request.startDate),
      end: toPlainDate(request.endDate),
      totalMinutes: request.totalMinutes,
      comment: parsed.data.comment?.trim() || null,
      onBehalfOf: onBehalfOf?.name ?? onBehalfOf?.upn ?? null,
    }),
  );

  revalidatePath("/approvals");
  revalidatePath("/leave");
  revalidatePath("/team");
  return { ok: true, message: parsed.data.approve ? "Request approved" : "Request rejected" };
}

/**
 * Employees withdraw their own future-dated leave and the balance returns
 * immediately. Leave that has started, or is in the past, needs an admin: the
 * record of what actually happened should not be rewritten quietly.
 */
export async function cancelLeaveRequest(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { leaveType: true, user: true },
  });
  if (!request) return { ok: false, error: "That request no longer exists" };

  const admin = isAdmin(user);
  if (request.userId !== user.id && !admin) {
    return { ok: false, error: "You cannot cancel that request" };
  }
  if (request.status === "CANCELLED" || request.status === "REJECTED") {
    return { ok: false, error: "That request is already cancelled" };
  }

  const startsInFuture = toPlainDate(request.startDate) > today();
  if (!startsInFuture && !admin) {
    return {
      ok: false,
      error: "This leave has already started. Ask an administrator to amend it.",
    };
  }

  await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  if (request.status === "APPROVED" && request.approverId) {
    const approver = await prisma.user.findUnique({ where: { id: request.approverId } });
    if (approver) {
      await sendMail(
        leaveCancelled({
          approver,
          requester: request.user,
          typeName: request.leaveType.name,
          start: toPlainDate(request.startDate),
          end: toPlainDate(request.endDate),
          totalMinutes: request.totalMinutes,
        }),
      );
    }
  }

  revalidatePath("/leave");
  revalidatePath("/approvals");
  revalidatePath("/team");
  return { ok: true, message: "Leave cancelled and the hours returned to your balance" };
}

/**
 * A request with no routed approver belongs to the shared HR queue, so the
 * notification goes to every administrator rather than nobody.
 */
async function notifyApprovers(
  approverId: string | null,
  build: (approver: { name: string | null; upn: string; email: string }) => Promise<import("@/lib/email/mailer").Mail>,
): Promise<void> {
  const recipients = approverId
    ? await prisma.user.findMany({ where: { id: approverId, isActive: true } })
    : await prisma.user.findMany({
        where: { isActive: true, role: { in: ["HR_ADMIN", "SYSADMIN"] } },
      });

  for (const recipient of recipients) {
    await sendMail(await build(recipient));
  }
}

export async function leaveDayPreview(params: {
  start: PlainDate;
  end: PlainDate;
}): Promise<{ date: PlainDate; minutes: number }[]> {
  const user = await requireUser();
  const [pattern, holidays] = await Promise.all([
    patternFor(user.id),
    bankHolidaySet(params.start, params.end),
  ]);
  const { defaultAllocation } = await import("@/lib/domain/allocation");
  return defaultAllocation({ start: params.start, end: params.end, pattern, bankHolidays: holidays });
}
