import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db";
import { addDays, formatDate, startOfWeek, toDbDate, today } from "@/lib/dates";
import { formatHours } from "@/lib/duration";
import { reportableUserIds, scopeFilter } from "@/lib/queries/scope";
import { canApproveAnything, requireUser } from "@/lib/session";

export default async function HoursReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; approvedOnly?: string }>;
}) {
  const user = await requireUser();
  if (!(await canApproveAnything(user))) redirect("/");

  const params = await searchParams;
  const to = params.to ?? today();
  const from = params.from ?? addDays(startOfWeek(to), -28);
  const approvedOnly = params.approvedOnly !== "false";

  const scope = await reportableUserIds(user);
  const entries = await prisma.timeEntry.findMany({
    where: {
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      timesheet: {
        ...scopeFilter(scope),
        ...(approvedOnly ? { status: "APPROVED" } : {}),
      },
    },
    include: {
      task: { include: { project: true } },
      timesheet: { include: { user: { select: { name: true, upn: true } } } },
    },
  });

  const byProject = new Map<
    string,
    { code: string; name: string; client: string | null; minutes: number; tasks: Map<string, number>; people: Map<string, number> }
  >();

  for (const entry of entries) {
    const project = entry.task.project;
    const row = byProject.get(project.id) ?? {
      code: project.code,
      name: project.name,
      client: project.client,
      minutes: 0,
      tasks: new Map<string, number>(),
      people: new Map<string, number>(),
    };
    row.minutes += entry.minutes;
    row.tasks.set(entry.task.name, (row.tasks.get(entry.task.name) ?? 0) + entry.minutes);
    const person = entry.timesheet.user.name ?? entry.timesheet.user.upn;
    row.people.set(person, (row.people.get(person) ?? 0) + entry.minutes);
    byProject.set(project.id, row);
  }

  const projects = [...byProject.entries()].sort((a, b) => b[1].minutes - a[1].minutes);
  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <AppShell user={user} current="/reports">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">Project time</h1>
          <p className="page-subtitle">
            {formatDate(from)} to {formatDate(to)} ·{" "}
            {approvedOnly ? "approved timesheets only" : "all timesheets including drafts"} ·{" "}
            {formatHours(total)} hours
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/reports/hours?from=${from}&to=${to}&approvedOnly=${approvedOnly ? "false" : "true"}`}
            className="btn btn-secondary btn-sm"
          >
            {approvedOnly ? "Include drafts" : "Approved only"}
          </a>
          <a href={`/api/reports/hours?from=${from}&to=${to}`} className="btn btn-primary btn-sm">
            Download CSV
          </a>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="card-body text-sm text-[var(--color-muted)]">
            No hours recorded in this period.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(([id, project]) => (
            <div key={id} className="card">
              <div className="card-header">
                <div>
                  <h2 className="font-semibold">
                    {project.code} · {project.name}
                  </h2>
                  {project.client ? (
                    <p className="text-xs text-[var(--color-muted)]">{project.client}</p>
                  ) : null}
                </div>
                <span className="pill pill-brand">{formatHours(project.minutes)}h</span>
              </div>
              <div className="card-body grid gap-5 sm:grid-cols-2">
                <Breakdown title="By task" entries={project.tasks} />
                <Breakdown title="By person" entries={project.people} />
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Breakdown({ title, entries }: { title: string; entries: Map<string, number> }) {
  const sorted = [...entries.entries()].sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;

  return (
    <div>
      <div className="section-title mb-1.5">{title}</div>
      <ul className="space-y-1.5">
        {sorted.map(([label, minutes]) => (
          <li key={label}>
            <div className="flex justify-between text-sm">
              <span className="truncate pr-2">{label}</span>
              <span className="font-medium tabular-nums">{formatHours(minutes)}h</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-canvas)] mt-1">
              <div
                className="h-1.5 rounded-full bg-[var(--color-brand)]"
                style={{ width: `${Math.max(3, (minutes / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const dynamic = "force-dynamic";
