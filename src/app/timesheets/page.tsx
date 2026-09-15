import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TimesheetGrid } from "@/components/timesheet-grid";
import { StatusPill } from "@/components/status-pill";
import { addDays, formatDate, startOfWeek, today } from "@/lib/dates";
import { isEditableByOwner } from "@/lib/domain/timesheet";
import { activeTaskOptions, loadWeek } from "@/lib/queries/timesheets";
import { requireUser } from "@/lib/session";

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser();
  const { week: weekParam } = await searchParams;
  const weekStart = startOfWeek(weekParam ?? today());

  const [week, taskOptions] = await Promise.all([
    loadWeek(user.id, weekStart),
    activeTaskOptions(),
  ]);

  const editable = isEditableByOwner(week.status);
  const previous = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const isCurrentWeek = weekStart === startOfWeek(today());

  return (
    <AppShell user={user} current="/timesheets">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">My timesheet</h1>
          <p className="page-subtitle">
            Week commencing {formatDate(weekStart)} to {formatDate(addDays(weekStart, 6))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={week.status} />
          <Link href={`/timesheets?week=${previous}`} className="btn btn-secondary btn-sm">
            ← Previous
          </Link>
          {!isCurrentWeek ? (
            <Link href="/timesheets" className="btn btn-secondary btn-sm">
              This week
            </Link>
          ) : null}
          <Link href={`/timesheets?week=${next}`} className="btn btn-secondary btn-sm">
            Next →
          </Link>
        </div>
      </div>

      {week.status === "REJECTED" && week.decisionComment ? (
        <div className="notice notice-error mb-4">
          <strong>Sent back{week.decidedByName ? ` by ${week.decidedByName}` : ""}:</strong>{" "}
          {week.decisionComment}
        </div>
      ) : null}

      {week.status === "APPROVED" ? (
        <div className="notice notice-success mb-4">
          Approved{week.decidedByName ? ` by ${week.decidedByName}` : ""}.
          {week.decisionComment ? ` ${week.decisionComment}` : ""}
        </div>
      ) : null}

      {week.status === "SUBMITTED" ? (
        <div className="notice notice-info mb-4">
          Submitted and waiting for approval. You cannot edit it until it is decided.
        </div>
      ) : null}

      {taskOptions.length === 0 && editable ? (
        <div className="notice notice-warning mb-4">
          There are no projects set up yet, so there is nothing to book hours against. An
          administrator can add them under Admin → Projects.
        </div>
      ) : null}

      <TimesheetGrid week={week} taskOptions={taskOptions} editable={editable} />
    </AppShell>
  );
}
