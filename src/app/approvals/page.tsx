import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DecisionForm } from "@/components/decision-form";
import { prisma } from "@/lib/db";
import { formatDate, formatLongDate, toPlainDate } from "@/lib/dates";
import { formatDays, formatHours } from "@/lib/duration";
import { assessOverdraft } from "@/lib/domain/balance";
import { pendingLeaveRequests, pendingTimesheets } from "@/lib/queries/approvals";
import { balanceFor, clashesFor } from "@/lib/queries/leave";
import { canApproveAnything, requireUser } from "@/lib/session";

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (!(await canApproveAnything(user))) redirect("/");

  const [leaveRequests, timesheets] = await Promise.all([
    pendingLeaveRequests(user),
    pendingTimesheets(user),
  ]);

  // Each request carries the requester's balance and their team's clashes, so
  // the decision is made with the facts rather than a guess.
  const leaveDetail = await Promise.all(
    leaveRequests.map(async (request) => {
      const start = toPlainDate(request.startDate);
      const end = toPlainDate(request.endDate);
      const [balance, clashes, manager] = await Promise.all([
        balanceFor(request.userId),
        clashesFor(request.userId, start, end),
        request.user.managerId
          ? prisma.user.findUnique({ where: { id: request.user.managerId } })
          : Promise.resolve(null),
      ]);

      return {
        request,
        start,
        end,
        balance,
        clashes,
        managerName: manager?.name ?? manager?.upn ?? null,
        overdraft: request.leaveType.deductsFromAllowance
          ? assessOverdraft(balance, request.totalMinutes)
          : null,
      };
    }),
  );

  const total = leaveRequests.length + timesheets.length;

  return (
    <AppShell user={user} current="/approvals">
      <div className="mb-5">
        <h1 className="page-title">Approvals</h1>
        <p className="page-subtitle">
          {total === 0
            ? "Nothing is waiting for a decision."
            : `${total} ${total === 1 ? "item is" : "items are"} waiting for a decision.`}
        </p>
      </div>

      <section className="mb-6">
        <h2 className="section-title mb-2">Leave requests</h2>
        {leaveDetail.length === 0 ? (
          <div className="card">
            <div className="card-body text-sm text-[var(--color-muted)]">
              No leave requests waiting.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {leaveDetail.map(({ request, start, end, balance, clashes, overdraft, managerName }) => (
              <div key={request.id} className="card">
                <div className="card-header">
                  <div>
                    <h3 className="font-semibold">{request.user.name ?? request.user.upn}</h3>
                    <p className="text-xs text-[var(--color-muted)]">
                      {request.user.department ?? "No department"}
                      {request.approverId === null ? " · HR queue (no line manager)" : ""}
                      {request.approverId && request.approverId !== user.id && managerName
                        ? ` · on behalf of ${managerName}`
                        : ""}
                    </p>
                  </div>
                  <span className="pill pill-brand">{request.leaveType.name}</span>
                </div>

                <div className="card-body grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3 text-sm">
                      <Fact label="Dates">
                        {start === end
                          ? formatLongDate(start)
                          : `${formatDate(start)} – ${formatDate(end)}`}
                      </Fact>
                      <Fact label="Total">{formatHours(request.totalMinutes)} hours</Fact>
                      <Fact label="Working days">{request.days.length}</Fact>
                    </div>

                    {request.note ? (
                      <div>
                        <div className="section-title">Note</div>
                        <p className="text-sm mt-0.5">{request.note}</p>
                      </div>
                    ) : null}

                    {overdraft?.wouldOverdraw ? (
                      <div className="notice notice-warning">
                        This exceeds their remaining allowance. Approving it takes{" "}
                        {(request.user.name ?? request.user.upn).split(" ")[0]} to{" "}
                        <strong>
                          {formatDays(overdraft.balanceAfterMinutes, balance.averageDayMinutes)}
                        </strong>{" "}
                        — a shortfall of {formatHours(overdraft.shortfallMinutes)} hours. It is your
                        decision whether to allow it.
                      </div>
                    ) : null}

                    {clashes.length > 0 ? (
                      <div>
                        <div className="section-title">Also off during these dates</div>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {groupClashes(clashes).map((clash) => (
                            <li key={clash.userId} className="text-[var(--color-graphite)]">
                              <span className="font-medium">{clash.userName}</span>{" "}
                              <span className="text-[var(--color-muted)]">
                                — {clash.dates.map(formatDate).join(", ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--color-muted)]">
                        Nobody else in their team is off during these dates.
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--color-muted)]">Balance now</span>
                        <span className="font-medium">
                          {formatDays(balance.remainingMinutes, balance.averageDayMinutes)}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[var(--color-muted)]">If approved</span>
                        <span
                          className={`font-medium ${
                            overdraft?.wouldOverdraw ? "text-[var(--color-caution)]" : ""
                          }`}
                        >
                          {formatDays(
                            balance.remainingMinutes - request.totalMinutes,
                            balance.averageDayMinutes,
                          )}
                        </span>
                      </div>
                    </div>
                    <DecisionForm kind="leave" id={request.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title mb-2">Timesheets</h2>
        {timesheets.length === 0 ? (
          <div className="card">
            <div className="card-body text-sm text-[var(--color-muted)]">
              No timesheets waiting.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {timesheets.map((timesheet) => {
              const worked = timesheet.entries.reduce((total, entry) => total + entry.minutes, 0);
              const byProject = new Map<string, number>();
              for (const entry of timesheet.entries) {
                const key = `${entry.task.project.code} · ${entry.task.project.name}`;
                byProject.set(key, (byProject.get(key) ?? 0) + entry.minutes);
              }

              return (
                <div key={timesheet.id} className="card">
                  <div className="card-header">
                    <div>
                      <h3 className="font-semibold">{timesheet.user.name ?? timesheet.user.upn}</h3>
                      <p className="text-xs text-[var(--color-muted)]">
                        Week commencing {formatDate(toPlainDate(timesheet.weekStart))}
                      </p>
                    </div>
                    <span className="pill pill-neutral">{formatHours(worked)}h worked</span>
                  </div>

                  <div className="card-body grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-3">
                      <div>
                        <div className="section-title">Where the time went</div>
                        <ul className="mt-1 text-sm space-y-0.5">
                          {[...byProject.entries()].map(([project, minutes]) => (
                            <li key={project} className="flex justify-between gap-4">
                              <span>{project}</span>
                              <span className="font-medium">{formatHours(minutes)}h</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {timesheet.varianceReason ? (
                        <div className="notice notice-warning">
                          <strong>Does not match contracted hours.</strong>{" "}
                          {timesheet.varianceReason}
                        </div>
                      ) : null}
                    </div>

                    <DecisionForm
                      kind="timesheet"
                      id={timesheet.id}
                      rejectLabel="Send back"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="section-title">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function groupClashes(
  clashes: { userId: string; userName: string; date: string }[],
): { userId: string; userName: string; dates: string[] }[] {
  const grouped = new Map<string, { userId: string; userName: string; dates: string[] }>();
  for (const clash of clashes) {
    const entry = grouped.get(clash.userId) ?? {
      userId: clash.userId,
      userName: clash.userName,
      dates: [],
    };
    entry.dates.push(clash.date);
    grouped.set(clash.userId, entry);
  }
  return [...grouped.values()];
}

export const dynamic = "force-dynamic";
