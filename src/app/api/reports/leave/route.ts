import { prisma } from "@/lib/db";
import { addDays, startOfWeek, toDbDate, toPlainDate, today } from "@/lib/dates";
import { minutesToHours } from "@/lib/duration";
import { csvResponse, toCsv } from "@/lib/csv";
import { reportableUserIds } from "@/lib/queries/scope";
import { canApproveAnything, getCurrentUser } from "@/lib/session";

/** Every approved absence day in the period. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !(await canApproveAnything(user))) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? today();
  const from = url.searchParams.get("from") ?? addDays(startOfWeek(to), -28);
  const scope = await reportableUserIds(user);

  const days = await prisma.leaveDay.findMany({
    where: {
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      ...(scope ? { userId: { in: scope } } : {}),
      request: { status: "APPROVED" },
    },
    include: {
      user: { select: { name: true, upn: true, department: true } },
      request: { include: { leaveType: true, decidedBy: { select: { name: true, upn: true } } } },
    },
    orderBy: [{ date: "asc" }],
  });

  const csv = toCsv(
    ["Date", "Name", "UPN", "Department", "Type", "Hours", "Paid", "Deducts allowance", "Approved by"],
    days.map((day) => [
      toPlainDate(day.date),
      day.user.name ?? day.user.upn,
      day.user.upn,
      day.user.department ?? "",
      day.request.leaveType.name,
      minutesToHours(day.minutes),
      day.request.leaveType.isPaid ? "Yes" : "No",
      day.request.leaveType.deductsFromAllowance ? "Yes" : "No",
      day.request.decidedBy?.name ?? day.request.decidedBy?.upn ?? "",
    ]),
  );

  return csvResponse(`leave-taken-${from}-to-${to}.csv`, csv);
}
