"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { startOfWeek, toDbDate, toPlainDate, today } from "@/lib/dates";
import { canDecide, resolveApprover } from "@/lib/domain/routing";
import { isEditableByOwner } from "@/lib/domain/timesheet";
import { sendMail } from "@/lib/email/mailer";
import { timesheetDecided, timesheetSubmitted } from "@/lib/email/templates";
import { getOrCreateTimesheet, loadWeek } from "@/lib/queries/timesheets";
import { activeDelegationsFor, isAdmin, requireUser } from "@/lib/session";
import type { ActionResult } from "./leave";

const cellSchema = z.object({
  taskId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(0).max(24 * 60),
});

const saveSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cells: z.array(cellSchema).max(500),
});

/**
 * The grid saves the whole week at once. Cells set to zero are deleted rather
 * than stored, so an empty week leaves no rows behind.
 */
export async function saveWeek(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not read those hours" };

  const weekStart = startOfWeek(parsed.data.weekStart);
  const timesheet = await getOrCreateTimesheet(user.id, weekStart);

  if (!isEditableByOwner(timesheet.status)) {
    return { ok: false, error: "This week has been submitted and can no longer be edited" };
  }

  const weekDatesSet = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${weekStart}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    }),
  );
  if (parsed.data.cells.some((cell) => !weekDatesSet.has(cell.date))) {
    return { ok: false, error: "Those hours are not all in the week being edited" };
  }

  const taskIds = [...new Set(parsed.data.cells.map((cell) => cell.taskId))];
  const validTasks = await prisma.task.count({ where: { id: { in: taskIds }, isActive: true } });
  if (validTasks !== taskIds.length) {
    return { ok: false, error: "One of those tasks is no longer available" };
  }

  await prisma.$transaction(async (tx) => {
    for (const cell of parsed.data.cells) {
      const key = {
        timesheetId_taskId_date: {
          timesheetId: timesheet.id,
          taskId: cell.taskId,
          date: toDbDate(cell.date),
        },
      };

      if (cell.minutes === 0) {
        await tx.timeEntry.deleteMany({
          where: { timesheetId: timesheet.id, taskId: cell.taskId, date: toDbDate(cell.date) },
        });
        continue;
      }

      await tx.timeEntry.upsert({
        where: key,
        create: {
          timesheetId: timesheet.id,
          taskId: cell.taskId,
          date: toDbDate(cell.date),
          minutes: cell.minutes,
        },
        update: { minutes: cell.minutes },
      });
    }

    // Editing after a rejection puts the week back into draft.
    if (timesheet.status === "REJECTED") {
      await tx.timesheet.update({ where: { id: timesheet.id }, data: { status: "OPEN" } });
    }
  });

  revalidatePath("/timesheets");
  return { ok: true, message: "Saved" };
}

const submitSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  varianceReason: z.string().max(500).optional(),
});

export async function submitWeek(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not submit that week" };

  const weekStart = startOfWeek(parsed.data.weekStart);
  const week = await loadWeek(user.id, weekStart);

  if (!isEditableByOwner(week.status)) {
    return { ok: false, error: "This week has already been submitted" };
  }
  if (week.totals.accountedMinutes === 0) {
    return { ok: false, error: "There is nothing to submit for this week" };
  }

  // A mismatch against contracted hours asks for a reason. It never blocks:
  // people do work short and long weeks.
  const reason = parsed.data.varianceReason?.trim() || null;
  if (!week.totals.matchesContract && !reason) {
    return {
      ok: false,
      error: "This week does not match your contracted hours. Add a brief reason to submit it.",
    };
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

  await prisma.timesheet.update({
    where: { id: week.timesheetId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      approverId: routing.approverId,
      varianceReason: week.totals.matchesContract ? null : reason,
      decisionComment: null,
    },
  });

  const recipients = routing.approverId
    ? await prisma.user.findMany({ where: { id: routing.approverId, isActive: true } })
    : await prisma.user.findMany({
        where: { isActive: true, role: { in: ["HR_ADMIN", "SYSADMIN"] } },
      });

  for (const approver of recipients) {
    await sendMail(
      await timesheetSubmitted({
        approver,
        owner: user,
        weekStart,
        accountedMinutes: week.totals.accountedMinutes,
        contractedMinutes: week.totals.contractedMinutes,
        varianceReason: reason,
      }),
    );
  }

  revalidatePath("/timesheets");
  revalidatePath("/approvals");
  return { ok: true, message: "Timesheet submitted" };
}

const decideSchema = z.object({
  timesheetId: z.string().min(1),
  approve: z.boolean(),
  comment: z.string().max(500).optional(),
});

export async function decideTimesheet(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid decision" };

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: parsed.data.timesheetId },
    include: { user: true },
  });
  if (!timesheet) return { ok: false, error: "That timesheet no longer exists" };
  if (timesheet.status !== "SUBMITTED") {
    return { ok: false, error: "That timesheet has already been decided" };
  }

  const allowed = canDecide({
    actorId: user.id,
    actorRole: user.role,
    requesterId: timesheet.userId,
    approverId: timesheet.approverId,
    actingForManagerIds: await activeDelegationsFor(user.id),
  });
  if (!allowed) return { ok: false, error: "You cannot decide that timesheet" };

  const onBehalfOfId =
    timesheet.approverId && timesheet.approverId !== user.id ? timesheet.approverId : null;

  await prisma.timesheet.update({
    where: { id: timesheet.id },
    data: {
      // Rejection reopens the week so it can be corrected and resubmitted.
      status: parsed.data.approve ? "APPROVED" : "REJECTED",
      decidedById: user.id,
      decidedAt: new Date(),
      decisionComment: parsed.data.comment?.trim() || null,
      decidedOnBehalfOfId: onBehalfOfId,
    },
  });

  await sendMail(
    await timesheetDecided({
      owner: timesheet.user,
      decider: user,
      approved: parsed.data.approve,
      weekStart: toPlainDate(timesheet.weekStart),
      comment: parsed.data.comment?.trim() || null,
    }),
  );

  revalidatePath("/approvals");
  revalidatePath("/timesheets");
  return { ok: true, message: parsed.data.approve ? "Timesheet approved" : "Timesheet sent back" };
}

/** Admins can reopen an approved week when payroll finds a mistake. */
export async function reopenTimesheet(timesheetId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isAdmin(user)) return { ok: false, error: "Only an administrator can reopen a week" };

  await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: "OPEN",
      submittedAt: null,
      decidedById: null,
      decidedAt: null,
      decisionComment: `Reopened by ${user.name ?? user.upn}`,
    },
  });

  revalidatePath("/timesheets");
  revalidatePath("/admin/timesheets");
  return { ok: true, message: "Week reopened" };
}
