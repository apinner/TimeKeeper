import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { CancelLeaveButton } from "@/components/cancel-leave-button";
import { formatDate, formatLongDate, toPlainDate, today } from "@/lib/dates";
import { formatDays, formatHours } from "@/lib/duration";
import { formatLeaveYear, leaveYearEndFor } from "@/lib/domain/leave-year";
import { balanceFor, listLeaveRequests } from "@/lib/queries/leave";
import { requireUser } from "@/lib/session";

export default async function LeavePage() {
  const user = await requireUser();
  const [balance, requests] = await Promise.all([
    balanceFor(user.id),
    listLeaveRequests(user.id),
  ]);

  const now = today();

  return (
    <AppShell user={user} current="/leave">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">My leave</h1>
          <p className="page-subtitle">
            Leave year {formatLeaveYear(balance.leaveYearStart)} · ends{" "}
            {formatDate(leaveYearEndFor(balance.leaveYearStart))}
          </p>
        </div>
        <Link href="/leave/new" className="btn btn-primary btn-sm">
          Book leave
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <Figure
          label="Remaining"
          value={formatDays(balance.remainingMinutes, balance.averageDayMinutes)}
          detail={`${formatHours(balance.remainingMinutes)} hours`}
          tone={balance.isNegative ? "warn" : "default"}
        />
        <Figure
          label="Entitlement"
          value={formatDays(balance.entitledMinutes, balance.averageDayMinutes)}
          detail={
            balance.carriedOverMinutes !== 0
              ? `includes ${formatDays(balance.carriedOverMinutes, balance.averageDayMinutes)} carried over`
              : "allowance for this year"
          }
        />
        <Figure
          label="Taken or booked"
          value={formatDays(balance.approvedMinutes, balance.averageDayMinutes)}
          detail="approved leave"
        />
        <Figure
          label="Awaiting approval"
          value={formatDays(balance.pendingMinutes, balance.averageDayMinutes)}
          detail={
            balance.pendingMinutes > 0
              ? `would leave ${formatDays(balance.remainingIfPendingApprovedMinutes, balance.averageDayMinutes)}`
              : "nothing pending"
          }
        />
      </div>

      {balance.carryoverExpiresOn && balance.carriedOverMinutes > 0 ? (
        <div className="notice notice-info mb-4">
          {formatDays(balance.carriedOverMinutes, balance.averageDayMinutes)} carried over from last
          year. Carried days are used first and expire on{" "}
          {formatLongDate(balance.carryoverExpiresOn)}.
        </div>
      ) : null}

      {balance.lapsedMinutes > 0 ? (
        <div className="notice notice-warning mb-4">
          {formatDays(balance.lapsedMinutes, balance.averageDayMinutes)} of carried-over leave
          expired unused on {formatLongDate(balance.carryoverExpiresOn ?? "")}.
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Requests</h2>
          <span className="text-sm text-[var(--color-muted)]">{requests.length} in total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Dates</th>
                <th>Type</th>
                <th className="numeric">Hours</th>
                <th>Status</th>
                <th>Decision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="text-sm text-[var(--color-muted)] py-2">
                      You have not booked any leave yet.
                    </p>
                  </td>
                </tr>
              ) : (
                requests.map((request) => {
                  const start = toPlainDate(request.startDate);
                  const end = toPlainDate(request.endDate);
                  const cancellable =
                    (request.status === "APPROVED" || request.status === "PENDING") && start > now;

                  return (
                    <tr key={request.id}>
                      <td>
                        <div className="font-medium">
                          {formatDate(start)}
                          {start !== end ? ` – ${formatDate(end)}` : ""}
                        </div>
                        {request.days.length > 1 ? (
                          <div className="text-xs text-[var(--color-muted)]">
                            {request.days.length} days
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                          style={{ background: request.leaveType.colour }}
                        />
                        {request.leaveType.name}
                      </td>
                      <td className="numeric">{formatHours(request.totalMinutes)}</td>
                      <td>
                        <StatusPill status={request.status} />
                      </td>
                      <td className="text-sm text-[var(--color-muted)]">
                        {request.decidedBy
                          ? `${request.decidedBy.name ?? request.decidedBy.upn}${
                              request.decisionComment ? ` — ${request.decisionComment}` : ""
                            }`
                          : "—"}
                      </td>
                      <td className="text-right">
                        {cancellable ? <CancelLeaveButton requestId={request.id} /> : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Figure({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="section-title">{label}</div>
        <div
          className={`text-2xl font-semibold mt-1 ${
            tone === "warn" ? "text-[var(--color-caution)]" : "text-[var(--color-graphite-900)]"
          }`}
        >
          {value}
        </div>
        <div className="text-xs text-[var(--color-muted)] mt-0.5">{detail}</div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
