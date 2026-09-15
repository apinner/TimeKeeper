import { prisma } from "@/lib/db";
import { minutesToDays, minutesToHours } from "@/lib/duration";
import { csvResponse, toCsv } from "@/lib/csv";
import { balanceFor } from "@/lib/queries/leave";
import { reportableUserIds } from "@/lib/queries/scope";
import { canApproveAnything, getCurrentUser } from "@/lib/session";

/** Year-end liability, and who still needs to book time off. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !(await canApproveAnything(user))) {
    return new Response("Forbidden", { status: 403 });
  }

  const scope = await reportableUserIds(user);
  const people = await prisma.user.findMany({
    where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
    select: { id: true, name: true, upn: true, department: true },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    people.map(async (person) => {
      const balance = await balanceFor(person.id);
      return [
        person.name ?? person.upn,
        person.upn,
        person.department ?? "",
        balance.leaveYearStart,
        minutesToDays(balance.entitledMinutes, balance.averageDayMinutes),
        minutesToDays(balance.approvedMinutes, balance.averageDayMinutes),
        minutesToDays(balance.pendingMinutes, balance.averageDayMinutes),
        minutesToDays(balance.lapsedMinutes, balance.averageDayMinutes),
        minutesToDays(balance.remainingMinutes, balance.averageDayMinutes),
        minutesToHours(balance.remainingMinutes),
      ];
    }),
  );

  const csv = toCsv(
    [
      "Name",
      "UPN",
      "Department",
      "Leave year start",
      "Entitlement (days)",
      "Taken (days)",
      "Pending (days)",
      "Expired carryover (days)",
      "Remaining (days)",
      "Remaining (hours)",
    ],
    rows,
  );

  return csvResponse(`leave-balances-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
