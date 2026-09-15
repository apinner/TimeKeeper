"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toDbDate, today } from "@/lib/dates";
import { hoursToMinutes } from "@/lib/duration";
import { carryoverExpiryDate } from "@/lib/domain/carryover";
import { leaveYearStartFor } from "@/lib/domain/leave-year";
import { sendMail } from "@/lib/email/mailer";
import { delegationAssigned } from "@/lib/email/templates";
import { getSettings } from "@/lib/settings";
import { isAdmin, requireAdmin, requireUser } from "@/lib/session";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function number(form: FormData, key: string): number {
  return Number(form.get(key) ?? 0);
}

// --- People ---------------------------------------------------------------

export async function updatePerson(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = text(form, "userId");
  const managerId = text(form, "managerId");
  const role = text(form, "role");
  const startDate = text(form, "startDate");

  if (!userId) return;
  // Nobody manages themselves, and the last administrator keeps their role.
  if (managerId === userId) return;

  if (role && !["EMPLOYEE", "MANAGER", "HR_ADMIN", "SYSADMIN"].includes(role)) return;
  if (userId === admin.id && role && !["HR_ADMIN", "SYSADMIN"].includes(role)) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      managerId: managerId || null,
      role: (role || undefined) as never,
      department: text(form, "department") || null,
      jobTitle: text(form, "jobTitle") || null,
      startDate: startDate ? toDbDate(startDate) : null,
      isActive: form.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${userId}`);
}

export async function updateWorkingPattern(form: FormData): Promise<void> {
  await requireAdmin();
  const userId = text(form, "userId");
  if (!userId) return;

  const minutes = (day: string) => Math.max(0, Math.min(hoursToMinutes(number(form, day)), 24 * 60));
  const data = {
    mondayMinutes: minutes("monday"),
    tuesdayMinutes: minutes("tuesday"),
    wednesdayMinutes: minutes("wednesday"),
    thursdayMinutes: minutes("thursday"),
    fridayMinutes: minutes("friday"),
    saturdayMinutes: minutes("saturday"),
    sundayMinutes: minutes("sunday"),
  };

  await prisma.workingPattern.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  revalidatePath(`/admin/people/${userId}`);
}

export async function updateEntitlement(form: FormData): Promise<void> {
  await requireAdmin();
  const settings = await getSettings();
  const userId = text(form, "userId");
  if (!userId) return;

  const leaveYearStart = text(form, "leaveYearStart") || leaveYearStartFor(today(), settings);
  const allowanceMinutes = Math.max(0, hoursToMinutes(number(form, "allowanceHours")));
  const carriedOverMinutes = hoursToMinutes(number(form, "carriedOverHours"));

  await prisma.entitlement.upsert({
    where: {
      userId_leaveYearStart: { userId, leaveYearStart: toDbDate(leaveYearStart) },
    },
    create: {
      userId,
      leaveYearStart: toDbDate(leaveYearStart),
      allowanceMinutes,
      carriedOverMinutes,
      carryoverExpiresOn: toDbDate(carryoverExpiryDate(leaveYearStart, settings)),
    },
    update: {
      allowanceMinutes,
      carriedOverMinutes,
      carryoverExpiresOn: toDbDate(carryoverExpiryDate(leaveYearStart, settings)),
    },
  });

  revalidatePath(`/admin/people/${userId}`);
  revalidatePath("/reports/balances");
}

/**
 * Adjustments are append-only: buying days, a goodwill exception, or
 * correcting an earlier mistake all stay visible rather than overwriting the
 * allowance.
 */
export async function addAdjustment(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const userId = text(form, "userId");
  const reason = text(form, "reason");
  const hours = number(form, "hours");
  if (!userId || !reason || !hours) return;

  await prisma.balanceAdjustment.create({
    data: {
      userId,
      leaveYearStart: toDbDate(text(form, "leaveYearStart") || leaveYearStartFor(today(), settings)),
      minutes: hoursToMinutes(hours),
      reason,
      createdById: admin.id,
    },
  });

  revalidatePath(`/admin/people/${userId}`);
  revalidatePath("/reports/balances");
}

// --- Projects and tasks ---------------------------------------------------

export async function saveProject(form: FormData): Promise<void> {
  await requireAdmin();
  const id = text(form, "projectId");
  const data = {
    code: text(form, "code").toUpperCase(),
    name: text(form, "name"),
    client: text(form, "client") || null,
    isBillable: form.get("isBillable") === "on",
    isActive: form.get("isActive") === "on",
  };
  if (!data.code || !data.name) return;

  if (id) await prisma.project.update({ where: { id }, data });
  else await prisma.project.create({ data });

  revalidatePath("/admin/projects");
}

export async function saveTask(form: FormData): Promise<void> {
  await requireAdmin();
  const id = text(form, "taskId");
  const projectId = text(form, "projectId");
  const name = text(form, "name");
  if (!name || (!id && !projectId)) return;

  if (id) {
    await prisma.task.update({
      where: { id },
      data: { name, code: text(form, "code") || null, isActive: form.get("isActive") === "on" },
    });
  } else {
    await prisma.task.create({
      data: { projectId, name, code: text(form, "code") || null },
    });
  }

  revalidatePath("/admin/projects");
}

// --- Leave types ----------------------------------------------------------

export async function saveLeaveType(form: FormData): Promise<void> {
  await requireAdmin();
  const id = text(form, "leaveTypeId");
  const data = {
    code: text(form, "code").toUpperCase(),
    name: text(form, "name"),
    colour: text(form, "colour") || "#53565a",
    deductsFromAllowance: form.get("deductsFromAllowance") === "on",
    requiresApproval: form.get("requiresApproval") === "on",
    isPaid: form.get("isPaid") === "on",
    requiresNote: form.get("requiresNote") === "on",
    isActive: form.get("isActive") === "on",
    sortOrder: Math.trunc(number(form, "sortOrder")),
  };
  if (!data.code || !data.name) return;

  if (id) await prisma.leaveType.update({ where: { id }, data });
  else await prisma.leaveType.create({ data });

  revalidatePath("/admin/leave-types");
}

// --- Bank holidays --------------------------------------------------------

export async function saveBankHoliday(form: FormData): Promise<void> {
  await requireAdmin();
  const parsed = z.object({ date, name: z.string().min(1) }).safeParse({
    date: text(form, "date"),
    name: text(form, "name"),
  });
  if (!parsed.success) return;

  await prisma.bankHoliday.upsert({
    where: { date: toDbDate(parsed.data.date) },
    create: { date: toDbDate(parsed.data.date), name: parsed.data.name },
    update: { name: parsed.data.name, isActive: true },
  });

  revalidatePath("/admin/bank-holidays");
}

export async function deleteBankHoliday(form: FormData): Promise<void> {
  await requireAdmin();
  const id = text(form, "id");
  if (id) await prisma.bankHoliday.delete({ where: { id } });
  revalidatePath("/admin/bank-holidays");
}

// --- Settings -------------------------------------------------------------

export async function updateSettings(form: FormData): Promise<void> {
  await requireAdmin();

  await prisma.settings.update({
    where: { id: 1 },
    data: {
      companyName: text(form, "companyName") || "TimeKeeper",
      logoPath: text(form, "logoPath") || "/logo.svg",
      leaveYearStartDay: clamp(number(form, "leaveYearStartDay"), 1, 31),
      leaveYearStartMonth: clamp(number(form, "leaveYearStartMonth"), 1, 12),
      defaultAllowanceMinutes: Math.max(0, hoursToMinutes(number(form, "defaultAllowanceHours"))),
      carryoverCapMinutes: Math.max(0, hoursToMinutes(number(form, "carryoverCapHours"))),
      carryoverExpiryDay: clamp(number(form, "carryoverExpiryDay"), 1, 31),
      carryoverExpiryMonth: clamp(number(form, "carryoverExpiryMonth"), 1, 12),
      timesheetRemindersOn: form.get("timesheetRemindersOn") === "on",
      managerDigestOn: form.get("managerDigestOn") === "on",
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/");
}

// --- Delegation -----------------------------------------------------------

/**
 * A manager sets their own cover; HR can set anyone's. Windows are
 * date-bounded, so cover expires by itself instead of quietly persisting.
 */
export async function createDelegation(form: FormData): Promise<void> {
  const user = await requireUser();
  const managerId = text(form, "managerId") || user.id;
  const delegateId = text(form, "delegateId");

  if (managerId !== user.id && !isAdmin(user)) return;
  if (!delegateId || delegateId === managerId) return;

  const parsed = z
    .object({ startDate: date, endDate: date })
    .safeParse({ startDate: text(form, "startDate"), endDate: text(form, "endDate") });
  if (!parsed.success || parsed.data.endDate < parsed.data.startDate) return;

  await prisma.delegation.create({
    data: {
      managerId,
      delegateId,
      startDate: toDbDate(parsed.data.startDate),
      endDate: toDbDate(parsed.data.endDate),
      note: text(form, "note") || null,
    },
  });

  const [manager, delegate] = await Promise.all([
    prisma.user.findUnique({ where: { id: managerId } }),
    prisma.user.findUnique({ where: { id: delegateId } }),
  ]);

  if (manager && delegate) {
    await sendMail(
      delegationAssigned({
        delegate,
        manager,
        start: parsed.data.startDate,
        end: parsed.data.endDate,
      }),
    );
  }

  revalidatePath("/delegation");
  revalidatePath("/admin/people");
}

export async function deleteDelegation(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = text(form, "id");
  if (!id) return;

  const delegation = await prisma.delegation.findUnique({ where: { id } });
  if (!delegation) return;
  if (delegation.managerId !== user.id && !isAdmin(user)) return;

  await prisma.delegation.delete({ where: { id } });
  revalidatePath("/delegation");
  revalidatePath("/admin/people");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value) || min));
}
