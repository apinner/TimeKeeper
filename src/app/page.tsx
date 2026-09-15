import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { prisma } from "@/lib/db";
import { formatDate, formatLongDate, startOfWeek, toDbDate, toPlainDate, today } from "@/lib/dates";
import { formatDays, formatHours } from "@/lib/duration";
import { balanceFor } from "@/lib/queries/leave";
import { pendingApprovalCount } from "@/lib/queries/approvals";
import { loadWeek } from "@/lib/queries/timesheets";
import { canApproveAnything, isAdmin, requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = today();
  const weekStart = startOfWeek(now);

  const [balance, week, canApprove, upcoming, unsubmittedCount] = await Promise.all([
    balanceFor(user.id),
    loadWeek(user.id, weekStart),
    canApproveAnything(user),
    prisma.leaveRequest.findMany({
      where: {
        userId: user.id,
        status: { in: ["PENDING", "APPROVED"] },
        endDate: { gte: toDbDate(now) },
      },
      include: { leaveType: true },
      orderBy: { startDate: "asc" },
      take: 4,
    }),
    prisma.timesheet.count({
      where: {
        userId: user.id,
        status: { in: ["OPEN", "REJECTED"] },
        weekStart: { lt: toDbDate(weekStart) },
      },
    }),
  ]);

  const pending = canApprove ? await pendingApprovalCount(user) : 0;
  const missingManager =
    isAdmin(user) &&
    (await prisma.user.count({ where: { isActive: true, managerId: null, role: "EMPLOYEE" } }));

  return (
    <AppShell user={user} current="/">
      <div className="mb-5">
        <h1 className="page-title">
          {greeting()}, {(user.name ?? user.upn).split(" ")[0]}
        </h1>
        <p className="page-subtitle">{formatLongDate(now)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <Stat
          label="Holiday remaining"
          value={formatDays(balance.remainingMinutes, balance.averageDayMinutes)}
          detail={`${formatHours(balance.remainingMinutes)} hours`}
          tone={balance.isNegative ? "warn" : "default"}
        />
        <Stat
          label="Awaiting approval"
          value={formatDays(balance.pendingMinutes, balance.averageDayMinutes)}
          detail={balance.pendingMinutes > 0 ? "Not yet deducted" : "Nothing pending"}
        />
        <Stat
          label="This week"
          value={`${formatHours(week.totals.accountedMinutes)}h`}
          detail={`of ${formatHours(week.totals.contractedMinutes)}h contracted`}
          tone={week.totals.matchesContract ? "good" : "default"}
        />
        {canApprove ? (
          <Stat
            label="Waiting on you"
            value={String(pending)}
            detail={pending === 1 ? "item to review" : "items to review"}
            tone={pending > 0 ? "warn" : "default"}
          />
        ) : (
          <Stat
            label="Holiday booked"
            value={formatDays(balance.approvedMinutes, balance.averageDayMinutes)}
            detail="Approved so far this year"
          />
        )}
      </div>

      {balance.isNegative ? (
        <div className="notice notice-warning mb-4">
          Your holiday balance is {formatDays(Math.abs(balance.remainingMinutes), balance.averageDayMinutes)}{" "}
          overdrawn. Approved leave beyond your allowance is at your manager&apos;s discretion, but
          it is worth checking with them.
        </div>
      ) : null}

      {!user.managerId ? (
        <div className="notice notice-info mb-4">
          You have no line manager set, so your requests go to the HR queue for approval. An
          administrator can set your manager under Admin → People.
        </div>
      ) : null}

      {missingManager ? (
        <div className="notice notice-warning mb-4">
          {missingManager} {missingManager === 1 ? "person has" : "people have"} no line manager, so
          their requests fall to the HR queue.{" "}
          <Link href="/admin/people" className="underline font-semibold">
            Assign managers
          </Link>
        </div>
      ) : null}

      {unsubmittedCount > 0 ? (
        <div className="notice notice-warning mb-4">
          You have {unsubmittedCount} earlier {unsubmittedCount === 1 ? "week" : "weeks"} that{" "}
          {unsubmittedCount === 1 ? "has" : "have"} not been submitted.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">This week&apos;s timesheet</h2>
            <StatusPill status={week.status} />
          </div>
          <div className="card-body">
            <p className="text-sm text-[var(--color-muted)] mb-3">
              Week commencing {formatDate(weekStart)}. {formatHours(week.totals.workedMinutes)}h
              worked, {formatHours(week.totals.leaveMinutes + week.totals.bankHolidayMinutes)}h
              leave and bank holidays.
            </p>
            <Link href="/timesheets" className="btn btn-primary btn-sm">
              {week.status === "OPEN" ? "Fill in timesheet" : "View timesheet"}
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Upcoming leave</h2>
            <Link href="/leave/new" className="btn btn-primary btn-sm">
              Book leave
            </Link>
          </div>
          <div className="card-body">
            {upcoming.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                Nothing booked. You have {formatDays(balance.remainingMinutes, balance.averageDayMinutes)}{" "}
                left this leave year.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {formatDate(toPlainDate(request.startDate))}
                        {toPlainDate(request.startDate) !== toPlainDate(request.endDate)
                          ? ` – ${formatDate(toPlainDate(request.endDate))}`
                          : ""}
                      </div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {request.leaveType.name} · {formatHours(request.totalMinutes)}h
                      </div>
                    </div>
                    <StatusPill status={request.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "good" | "warn";
}) {
  const colour =
    tone === "warn"
      ? "text-[var(--color-caution)]"
      : tone === "good"
        ? "text-[var(--color-positive)]"
        : "text-[var(--color-graphite-900)]";
  return (
    <div className="card">
      <div className="card-body">
        <div className="section-title">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${colour}`}>{value}</div>
        <div className="text-xs text-[var(--color-muted)] mt-0.5">{detail}</div>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export const dynamic = "force-dynamic";
