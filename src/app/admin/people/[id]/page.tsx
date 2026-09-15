import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  addAdjustment,
  updateEntitlement,
  updatePerson,
  updateWorkingPattern,
} from "@/lib/actions/admin";
import { prisma } from "@/lib/db";
import { formatDate, toPlainDate } from "@/lib/dates";
import { formatDays, formatHours, minutesToHours } from "@/lib/duration";
import { formatLeaveYear } from "@/lib/domain/leave-year";
import { DEFAULT_PATTERN } from "@/lib/domain/patterns";
import { balanceFor } from "@/lib/queries/leave";
import { requireAdmin } from "@/lib/session";

const DAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
] as const;

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;

  const person = await prisma.user.findUnique({
    where: { id },
    include: { workingPattern: true },
  });
  if (!person) notFound();

  const balance = await balanceFor(person.id);
  const [colleagues, entitlement, adjustments] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, id: { not: person.id } },
      select: { id: true, name: true, upn: true },
      orderBy: { name: "asc" },
    }),
    prisma.entitlement.findFirst({
      where: { userId: person.id },
      orderBy: { leaveYearStart: "desc" },
    }),
    prisma.balanceAdjustment.findMany({
      where: { userId: person.id },
      include: { createdBy: { select: { name: true, upn: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const pattern = person.workingPattern ?? DEFAULT_PATTERN;

  return (
    <AppShell user={admin} current="/admin">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">{person.name ?? person.upn}</h1>
          <p className="page-subtitle">{person.upn}</p>
        </div>
        <Link href="/admin/people" className="btn btn-secondary btn-sm">
          Back to people
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Details</h2>
          </div>
          <form action={updatePerson} className="card-body space-y-3">
            <input type="hidden" name="userId" value={person.id} />

            <div>
              <label className="label" htmlFor="role">
                Role
              </label>
              <select id="role" name="role" className="select" defaultValue={person.role}>
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="HR_ADMIN">HR / Admin</option>
                <option value="SYSADMIN">Sysadmin</option>
              </select>
              <p className="hint">
                Approval rights follow from having direct reports; HR and Sysadmin can action
                anything.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="managerId">
                Line manager
              </label>
              <select
                id="managerId"
                name="managerId"
                className="select"
                defaultValue={person.managerId ?? ""}
              >
                <option value="">None — requests go to the HR queue</option>
                {colleagues.map((colleague) => (
                  <option key={colleague.id} value={colleague.id}>
                    {colleague.name ?? colleague.upn}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="department">
                  Department
                </label>
                <input
                  id="department"
                  name="department"
                  className="input"
                  defaultValue={person.department ?? ""}
                />
              </div>
              <div>
                <label className="label" htmlFor="jobTitle">
                  Job title
                </label>
                <input
                  id="jobTitle"
                  name="jobTitle"
                  className="input"
                  defaultValue={person.jobTitle ?? ""}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="startDate">
                Start date
              </label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                className="input"
                defaultValue={person.startDate ? toPlainDate(person.startDate) : ""}
              />
              <p className="hint">Used to pro-rate a first-year allowance.</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={person.isActive} />
              Active — an inactive account cannot sign in
            </label>

            <button type="submit" className="btn btn-primary">
              Save details
            </button>
          </form>
        </section>

        <div className="space-y-4">
          <section className="card">
            <div className="card-header">
              <h2 className="font-semibold">Working pattern</h2>
              <span className="text-sm text-[var(--color-muted)]">
                {formatHours(
                  DAYS.reduce(
                    (total, [key]) => total + pattern[`${key}Minutes` as keyof typeof pattern],
                    0,
                  ),
                )}
                h per week
              </span>
            </div>
            <form action={updateWorkingPattern} className="card-body space-y-3">
              <input type="hidden" name="userId" value={person.id} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DAYS.map(([key, label]) => (
                  <div key={key}>
                    <label className="label" htmlFor={key}>
                      {label.slice(0, 3)}
                    </label>
                    <input
                      id={key}
                      name={key}
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      className="input"
                      defaultValue={minutesToHours(
                        pattern[`${key}Minutes` as keyof typeof pattern],
                      )}
                    />
                  </div>
                ))}
              </div>
              <p className="hint">
                Hours worked on each weekday. Leave is deducted against this, so part-time staff are
                charged correctly, and a day here is what &ldquo;one day&rdquo; means for them.
              </p>
              <button type="submit" className="btn btn-primary">
                Save pattern
              </button>
            </form>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="font-semibold">Allowance</h2>
              <span className="pill pill-brand">
                {formatDays(balance.remainingMinutes, balance.averageDayMinutes)} left
              </span>
            </div>
            <form action={updateEntitlement} className="card-body space-y-3">
              <input type="hidden" name="userId" value={person.id} />
              <input type="hidden" name="leaveYearStart" value={balance.leaveYearStart} />

              <p className="text-sm text-[var(--color-muted)]">
                Leave year {formatLeaveYear(balance.leaveYearStart)}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="allowanceHours">
                    Allowance (hours)
                  </label>
                  <input
                    id="allowanceHours"
                    name="allowanceHours"
                    type="number"
                    step="0.25"
                    min="0"
                    className="input"
                    defaultValue={minutesToHours(balance.allowanceMinutes)}
                  />
                  <p className="hint">
                    ≈ {formatDays(balance.allowanceMinutes, balance.averageDayMinutes)}
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="carriedOverHours">
                    Carried over (hours)
                  </label>
                  <input
                    id="carriedOverHours"
                    name="carriedOverHours"
                    type="number"
                    step="0.25"
                    className="input"
                    defaultValue={minutesToHours(balance.carriedOverMinutes)}
                  />
                  <p className="hint">
                    {entitlement?.carryoverExpiresOn
                      ? `Expires ${formatDate(toPlainDate(entitlement.carryoverExpiresOn))}`
                      : "Set automatically at year end"}
                  </p>
                </div>
              </div>

              <button type="submit" className="btn btn-primary">
                Save allowance
              </button>
            </form>
          </section>
        </div>
      </div>

      <section className="card mt-4">
        <div className="card-header">
          <h2 className="font-semibold">Balance adjustments</h2>
          <span className="text-sm text-[var(--color-muted)]">
            Added, never edited — the history stays visible
          </span>
        </div>
        <form action={addAdjustment} className="card-body grid gap-3 sm:grid-cols-[8rem_1fr_auto] items-end">
          <input type="hidden" name="userId" value={person.id} />
          <input type="hidden" name="leaveYearStart" value={balance.leaveYearStart} />
          <div>
            <label className="label" htmlFor="hours">
              Hours
            </label>
            <input
              id="hours"
              name="hours"
              type="number"
              step="0.25"
              className="input"
              placeholder="7.5"
            />
            <p className="hint">Negative to take hours away</p>
          </div>
          <div>
            <label className="label" htmlFor="reason">
              Reason
            </label>
            <input
              id="reason"
              name="reason"
              className="input"
              placeholder="e.g. Bought 2 extra days, agreed with HR"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Add adjustment
          </button>
        </form>

        {adjustments.length > 0 ? (
          <div className="overflow-x-auto border-t border-[var(--color-line)]">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th className="numeric">Hours</th>
                  <th>Reason</th>
                  <th>Added by</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td>{formatDate(toPlainDate(adjustment.createdAt))}</td>
                    <td
                      className={`numeric font-medium ${
                        adjustment.minutes < 0 ? "text-[var(--color-negative)]" : ""
                      }`}
                    >
                      {adjustment.minutes > 0 ? "+" : ""}
                      {formatHours(adjustment.minutes)}
                    </td>
                    <td>{adjustment.reason}</td>
                    <td className="text-[var(--color-muted)]">
                      {adjustment.createdBy?.name ?? adjustment.createdBy?.upn ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
