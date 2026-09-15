import { prisma } from "@/lib/db";
import {
  addDays,
  type PlainDate,
  startOfWeek,
  toDbDate,
  toPlainDate,
  weekDates,
} from "@/lib/dates";
import { computeWeekTotals, type WeekTotals } from "@/lib/domain/timesheet";
import { patternMinutesFor, type PatternMinutes } from "@/lib/domain/patterns";
import { bankHolidaysBetween } from "./bank-holidays";
import { patternFor } from "./leave";
import type { TimesheetStatus } from "@prisma/client";

export interface GridRow {
  taskId: string;
  projectName: string;
  projectCode: string;
  taskName: string;
  minutesByDate: Record<PlainDate, number>;
}

/** Leave and bank holidays, auto-filled and not editable. */
export interface ReadOnlyRow {
  key: string;
  label: string;
  colour: string;
  minutesByDate: Record<PlainDate, number>;
}

export interface WeekData {
  weekStart: PlainDate;
  dates: PlainDate[];
  status: TimesheetStatus;
  timesheetId: string;
  pattern: PatternMinutes;
  contractedByDate: Record<PlainDate, number>;
  rows: GridRow[];
  readOnlyRows: ReadOnlyRow[];
  totals: WeekTotals;
  varianceReason: string | null;
  decisionComment: string | null;
  decidedByName: string | null;
  submittedAt: Date | null;
}

export async function getOrCreateTimesheet(userId: string, weekStart: PlainDate) {
  const monday = startOfWeek(weekStart);
  const existing = await prisma.timesheet.findUnique({
    where: { userId_weekStart: { userId, weekStart: toDbDate(monday) } },
  });
  if (existing) return existing;
  return prisma.timesheet.create({ data: { userId, weekStart: toDbDate(monday) } });
}

/** Everything the weekly grid needs, in one place. */
export async function loadWeek(userId: string, week: PlainDate): Promise<WeekData> {
  const weekStart = startOfWeek(week);
  const weekEnd = addDays(weekStart, 6);
  const dates = weekDates(weekStart);

  const timesheet = await getOrCreateTimesheet(userId, weekStart);

  const [pattern, entries, leaveDays, holidays, decider] = await Promise.all([
    patternFor(userId),
    prisma.timeEntry.findMany({
      where: { timesheetId: timesheet.id },
      include: { task: { include: { project: true } } },
      orderBy: [{ task: { project: { code: "asc" } } }, { task: { name: "asc" } }],
    }),
    prisma.leaveDay.findMany({
      where: {
        userId,
        date: { gte: toDbDate(weekStart), lte: toDbDate(weekEnd) },
        request: { status: "APPROVED" },
      },
      include: { request: { include: { leaveType: true } } },
    }),
    bankHolidaysBetween(weekStart, weekEnd),
    timesheet.decidedById
      ? prisma.user.findUnique({ where: { id: timesheet.decidedById } })
      : Promise.resolve(null),
  ]);

  const rowsByTask = new Map<string, GridRow>();
  for (const entry of entries) {
    const row = rowsByTask.get(entry.taskId) ?? {
      taskId: entry.taskId,
      projectName: entry.task.project.name,
      projectCode: entry.task.project.code,
      taskName: entry.task.name,
      minutesByDate: {},
    };
    row.minutesByDate[toPlainDate(entry.date)] = entry.minutes;
    rowsByTask.set(entry.taskId, row);
  }

  const leaveByType = new Map<string, ReadOnlyRow>();
  for (const day of leaveDays) {
    const type = day.request.leaveType;
    const row = leaveByType.get(type.id) ?? {
      key: `leave-${type.id}`,
      label: type.name,
      colour: type.colour,
      minutesByDate: {},
    };
    const date = toPlainDate(day.date);
    row.minutesByDate[date] = (row.minutesByDate[date] ?? 0) + day.minutes;
    leaveByType.set(type.id, row);
  }

  const readOnlyRows = [...leaveByType.values()];

  if (holidays.size > 0) {
    const row: ReadOnlyRow = {
      key: "bank-holidays",
      label: "Bank holiday",
      colour: "#53565a",
      minutesByDate: {},
    };
    for (const [date] of holidays) {
      row.minutesByDate[date] = patternMinutesFor(pattern, date);
    }
    readOnlyRows.push(row);
  }

  const workedMinutes = entries.reduce((total, entry) => total + entry.minutes, 0);
  const leaveMinutes = leaveDays.reduce((total, day) => total + day.minutes, 0);
  const bankHolidayMinutes = readOnlyRows
    .filter((row) => row.key === "bank-holidays")
    .reduce(
      (total, row) => total + Object.values(row.minutesByDate).reduce((a, b) => a + b, 0),
      0,
    );

  const contractedByDate: Record<PlainDate, number> = {};
  for (const date of dates) contractedByDate[date] = patternMinutesFor(pattern, date);

  return {
    weekStart,
    dates,
    status: timesheet.status,
    timesheetId: timesheet.id,
    pattern,
    contractedByDate,
    rows: [...rowsByTask.values()],
    readOnlyRows,
    totals: computeWeekTotals({
      pattern,
      weekStart,
      workedMinutes,
      leaveMinutes,
      bankHolidayMinutes,
    }),
    varianceReason: timesheet.varianceReason,
    decisionComment: timesheet.decisionComment,
    decidedByName: decider?.name ?? decider?.upn ?? null,
    submittedAt: timesheet.submittedAt,
  };
}

export async function activeTaskOptions() {
  const projects = await prisma.project.findMany({
    where: { isActive: true },
    include: { tasks: { where: { isActive: true }, orderBy: { name: "asc" } } },
    orderBy: { code: "asc" },
  });
  return projects
    .filter((project) => project.tasks.length > 0)
    .map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      tasks: project.tasks.map((task) => ({ id: task.id, name: task.name })),
    }));
}
