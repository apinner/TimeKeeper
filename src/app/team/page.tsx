import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db";
import {
  addDays,
  dayOfWeek,
  eachDateInRange,
  monthName,
  type PlainDate,
  shortWeekdayName,
  today,
} from "@/lib/dates";
import { formatHours } from "@/lib/duration";
import { absencesBetween } from "@/lib/queries/leave";
import { bankHolidaysBetween } from "@/lib/queries/bank-holidays";
import { requireUser } from "@/lib/session";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; department?: string }>;
}) {
  const user = await requireUser();
  const { month: monthParam, department } = await searchParams;

  const month = monthParam?.match(/^\d{4}-\d{2}$/) ? monthParam : today().slice(0, 7);
  const monthStart = `${month}-01` as PlainDate;
  const monthEnd = lastDayOfMonth(monthStart);
  const dates = eachDateInRange(monthStart, monthEnd);

  const [people, absences, holidays, departments] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, ...(department ? { department } : {}) },
      select: { id: true, name: true, upn: true, department: true },
      orderBy: [{ name: "asc" }],
    }),
    absencesBetween(monthStart, monthEnd, { includePending: true }),
    bankHolidaysBetween(monthStart, monthEnd),
    prisma.user.findMany({
      where: { isActive: true, department: { not: null } },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
  ]);

  const byPersonDate = new Map<string, (typeof absences)[number]>();
  for (const absence of absences) {
    byPersonDate.set(`${absence.userId}|${absence.date}`, absence);
  }

  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const query = (target: string) =>
    `/team?month=${target}${department ? `&department=${encodeURIComponent(department)}` : ""}`;

  return (
    <AppShell user={user} current="/team">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">Team calendar</h1>
          <p className="page-subtitle">
            {monthName(Number(month.slice(5, 7)))} {month.slice(0, 4)} · who is off and when
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={query(previousMonth)} className="btn btn-secondary btn-sm">
            ← {monthName(Number(previousMonth.slice(5, 7))).slice(0, 3)}
          </Link>
          <Link href={query(today().slice(0, 7))} className="btn btn-secondary btn-sm">
            Today
          </Link>
          <Link href={query(nextMonth)} className="btn btn-secondary btn-sm">
            {monthName(Number(nextMonth.slice(5, 7))).slice(0, 3)} →
          </Link>
        </div>
      </div>

      {departments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href={`/team?month=${month}`}
            className={`pill ${department ? "pill-neutral" : "pill-brand"}`}
          >
            Everyone
          </Link>
          {departments.map((row) => (
            <Link
              key={row.department}
              href={`/team?month=${month}&department=${encodeURIComponent(row.department ?? "")}`}
              className={`pill ${department === row.department ? "pill-brand" : "pill-neutral"}`}
            >
              {row.department}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table" style={{ fontSize: "0.8125rem" }}>
            <thead>
              <tr>
                <th className="sticky left-0 bg-[var(--color-surface)] min-w-[11rem]">Person</th>
                {dates.map((date) => {
                  const weekend = dayOfWeek(date) === 0 || dayOfWeek(date) === 6;
                  const holiday = holidays.has(date);
                  return (
                    <th
                      key={date}
                      className={`text-center px-1 ${weekend || holiday ? "cell-weekend" : ""}`}
                      title={holidays.get(date) ?? undefined}
                    >
                      <div className="font-normal text-[0.65rem] text-[var(--color-muted)]">
                        {shortWeekdayName(date).slice(0, 1)}
                      </div>
                      <div>{Number(date.slice(8))}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr>
                  <td colSpan={dates.length + 1}>
                    <p className="text-sm text-[var(--color-muted)] py-2">Nobody to show.</p>
                  </td>
                </tr>
              ) : (
                people.map((person) => (
                  <tr key={person.id}>
                    <td className="sticky left-0 bg-[var(--color-surface)] whitespace-nowrap">
                      <span className="font-medium">{person.name ?? person.upn}</span>
                      {person.department ? (
                        <div className="text-[0.7rem] text-[var(--color-muted)]">
                          {person.department}
                        </div>
                      ) : null}
                    </td>
                    {dates.map((date) => {
                      const weekend = dayOfWeek(date) === 0 || dayOfWeek(date) === 6;
                      const holiday = holidays.has(date);
                      const absence = byPersonDate.get(`${person.id}|${date}`);

                      return (
                        <td
                          key={date}
                          className={`text-center px-1 ${weekend || holiday ? "cell-weekend" : ""}`}
                          title={
                            absence
                              ? `${absence.typeName} — ${formatHours(absence.minutes)}h${
                                  absence.status === "PENDING" ? " (awaiting approval)" : ""
                                }`
                              : (holidays.get(date) ?? undefined)
                          }
                        >
                          {absence ? (
                            <span
                              className="inline-block w-4 h-4 rounded-sm align-middle"
                              style={{
                                background: absence.colour,
                                opacity: absence.status === "PENDING" ? 0.4 : 1,
                              }}
                              aria-label={`${absence.typeName} on ${date}`}
                            />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint mt-3">
        Solid blocks are approved leave; faded blocks are awaiting approval. Shaded columns are
        weekends and bank holidays.
      </p>
    </AppShell>
  );
}

function lastDayOfMonth(monthStart: PlainDate): PlainDate {
  const [year, month] = monthStart.split("-").map(Number);
  const firstOfNext =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return addDays(firstOfNext, -1);
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const total = year * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";
