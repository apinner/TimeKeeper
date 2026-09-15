import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { formatDays, formatHours } from "@/lib/duration";
import { formatLeaveYear, leaveYearEndFor } from "@/lib/domain/leave-year";
import { balanceFor } from "@/lib/queries/leave";
import { reportableUserIds } from "@/lib/queries/scope";
import { canApproveAnything, requireUser } from "@/lib/session";

export default async function BalancesReportPage() {
  const user = await requireUser();
  if (!(await canApproveAnything(user))) redirect("/");

  const scope = await reportableUserIds(user);
  const people = await prisma.user.findMany({
    where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) },
    select: { id: true, name: true, upn: true, department: true },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    people.map(async (person) => ({ person, balance: await balanceFor(person.id) })),
  );

  const leaveYearStart = rows[0]?.balance.leaveYearStart;
  const totalRemaining = rows.reduce((sum, row) => sum + row.balance.remainingMinutes, 0);

  return (
    <AppShell user={user} current="/reports">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">Outstanding balances</h1>
          <p className="page-subtitle">
            {leaveYearStart
              ? `Leave year ${formatLeaveYear(leaveYearStart)}, ending ${formatDate(leaveYearEndFor(leaveYearStart))}`
              : "No entitlements yet"}{" "}
            · {formatHours(totalRemaining)} hours outstanding in total
          </p>
        </div>
        <a href="/api/reports/balances" className="btn btn-primary btn-sm">
          Download CSV
        </a>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Person</th>
                <th>Department</th>
                <th className="numeric">Entitlement</th>
                <th className="numeric">Taken</th>
                <th className="numeric">Pending</th>
                <th className="numeric">Expired</th>
                <th className="numeric">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="text-sm text-[var(--color-muted)] py-2">Nobody to show.</p>
                  </td>
                </tr>
              ) : (
                rows.map(({ person, balance }) => (
                  <tr key={person.id}>
                    <td className="font-medium">{person.name ?? person.upn}</td>
                    <td className="text-[var(--color-muted)]">{person.department ?? "—"}</td>
                    <td className="numeric">
                      {formatDays(balance.entitledMinutes, balance.averageDayMinutes)}
                    </td>
                    <td className="numeric">
                      {formatDays(balance.approvedMinutes, balance.averageDayMinutes)}
                    </td>
                    <td className="numeric text-[var(--color-muted)]">
                      {balance.pendingMinutes > 0
                        ? formatDays(balance.pendingMinutes, balance.averageDayMinutes)
                        : "—"}
                    </td>
                    <td className="numeric text-[var(--color-muted)]">
                      {balance.lapsedMinutes > 0
                        ? formatDays(balance.lapsedMinutes, balance.averageDayMinutes)
                        : "—"}
                    </td>
                    <td
                      className={`numeric font-semibold ${
                        balance.isNegative ? "text-[var(--color-negative)]" : ""
                      }`}
                    >
                      {formatDays(balance.remainingMinutes, balance.averageDayMinutes)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint mt-3">
        Remaining excludes anything still awaiting approval, and is entitlement less leave taken
        less any carried-over days that expired unused. A negative figure means approved leave has
        exceeded the allowance, which is permitted at a manager&apos;s discretion.
      </p>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
