import { prisma } from "@/lib/db";
import { addDays, startOfWeek, toDbDate, toPlainDate, today } from "@/lib/dates";
import { minutesToHours } from "@/lib/duration";
import { csvResponse, toCsv } from "@/lib/csv";
import { reportableUserIds, scopeFilter } from "@/lib/queries/scope";
import { canApproveAnything, getCurrentUser } from "@/lib/session";

/** One row per time entry: the raw material for any billing analysis. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !(await canApproveAnything(user))) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? today();
  const from = url.searchParams.get("from") ?? addDays(startOfWeek(to), -28);
  const scope = await reportableUserIds(user);

  const entries = await prisma.timeEntry.findMany({
    where: {
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      timesheet: { ...scopeFilter(scope) },
    },
    include: {
      task: { include: { project: true } },
      timesheet: { include: { user: { select: { name: true, upn: true, department: true } } } },
    },
    orderBy: [{ date: "asc" }],
  });

  const csv = toCsv(
    [
      "Date",
      "Name",
      "UPN",
      "Department",
      "Project code",
      "Project",
      "Client",
      "Billable",
      "Task",
      "Hours",
      "Note",
      "Timesheet status",
    ],
    entries.map((entry) => [
      toPlainDate(entry.date),
      entry.timesheet.user.name ?? entry.timesheet.user.upn,
      entry.timesheet.user.upn,
      entry.timesheet.user.department ?? "",
      entry.task.project.code,
      entry.task.project.name,
      entry.task.project.client ?? "",
      entry.task.project.isBillable ? "Yes" : "No",
      entry.task.name,
      minutesToHours(entry.minutes),
      entry.note ?? "",
      entry.timesheet.status,
    ]),
  );

  return csvResponse(`project-time-${from}-to-${to}.csv`, csv);
}
