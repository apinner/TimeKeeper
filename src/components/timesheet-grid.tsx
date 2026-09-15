"use client";

import { useMemo, useState, useTransition } from "react";
import type { PlainDate } from "@/lib/dates";
import { formatDate, shortWeekdayName } from "@/lib/dates";
import { formatHours, parseHoursInput } from "@/lib/duration";
import { saveWeek, submitWeek } from "@/lib/actions/timesheets";
import type { GridRow, ReadOnlyRow, WeekData } from "@/lib/queries/timesheets";

interface TaskOption {
  id: string;
  code: string;
  name: string;
  tasks: { id: string; name: string }[];
}

type CellValues = Record<string, string>;

const cellKey = (taskId: string, date: PlainDate) => `${taskId}|${date}`;

export function TimesheetGrid({
  week,
  taskOptions,
  editable,
}: {
  week: WeekData;
  taskOptions: TaskOption[];
  editable: boolean;
}) {
  const [rows, setRows] = useState<GridRow[]>(week.rows);
  const [values, setValues] = useState<CellValues>(() => initialValues(week.rows));
  const [varianceReason, setVarianceReason] = useState(week.varianceReason ?? "");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const workedMinutes = useMemo(
    () =>
      Object.values(values).reduce((total, value) => total + (parseHoursInput(value) ?? 0), 0),
    [values],
  );

  const readOnlyMinutes = useMemo(
    () => week.readOnlyRows.reduce((total, row) => total + sumRow(row.minutesByDate), 0),
    [week.readOnlyRows],
  );

  const accounted = workedMinutes + readOnlyMinutes;
  const variance = accounted - week.totals.contractedMinutes;
  const matchesContract = variance === 0;

  const usedTaskIds = new Set(rows.map((row) => row.taskId));

  function setCell(taskId: string, date: PlainDate, value: string) {
    setValues((previous) => ({ ...previous, [cellKey(taskId, date)]: value }));
    setFeedback(null);
  }

  function collectCells() {
    const cells: { taskId: string; date: PlainDate; minutes: number }[] = [];
    for (const row of rows) {
      for (const date of week.dates) {
        const raw = values[cellKey(row.taskId, date)] ?? "";
        const minutes = parseHoursInput(raw);
        if (minutes === null) return null;
        // Zero cells are sent too, so clearing a cell deletes the entry.
        cells.push({ taskId: row.taskId, date, minutes });
      }
    }
    return cells;
  }

  function onSave() {
    const cells = collectCells();
    if (!cells) {
      setFeedback({ kind: "error", text: "Some cells are not valid hours. Use 7.5 or 7:30." });
      return;
    }

    startTransition(async () => {
      const result = await saveWeek({ weekStart: week.weekStart, cells });
      setFeedback(
        result.ok
          ? { kind: "ok", text: result.message ?? "Saved" }
          : { kind: "error", text: result.error ?? "Could not save" },
      );
    });
  }

  function onSubmit() {
    const cells = collectCells();
    if (!cells) {
      setFeedback({ kind: "error", text: "Some cells are not valid hours. Use 7.5 or 7:30." });
      return;
    }

    startTransition(async () => {
      const saved = await saveWeek({ weekStart: week.weekStart, cells });
      if (!saved.ok) {
        setFeedback({ kind: "error", text: saved.error ?? "Could not save" });
        return;
      }
      const result = await submitWeek({
        weekStart: week.weekStart,
        varianceReason: varianceReason.trim() || undefined,
      });
      setFeedback(
        result.ok
          ? { kind: "ok", text: result.message ?? "Submitted" }
          : { kind: "error", text: result.error ?? "Could not submit" },
      );
    });
  }

  function addRow(taskId: string) {
    const project = taskOptions.find((option) => option.tasks.some((t) => t.id === taskId));
    const task = project?.tasks.find((t) => t.id === taskId);
    if (!project || !task || usedTaskIds.has(taskId)) return;

    setRows((previous) => [
      ...previous,
      {
        taskId,
        projectName: project.name,
        projectCode: project.code,
        taskName: task.name,
        minutesByDate: {},
      },
    ]);
  }

  function removeRow(taskId: string) {
    setRows((previous) => previous.filter((row) => row.taskId !== taskId));
    setValues((previous) => {
      const next = { ...previous };
      for (const date of week.dates) delete next[cellKey(taskId, date)];
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="min-w-[14rem]">Project / task</th>
                {week.dates.map((date) => {
                  const contracted = week.contractedByDate[date] ?? 0;
                  return (
                    <th
                      key={date}
                      className={`numeric ${contracted === 0 ? "cell-weekend" : ""}`}
                    >
                      <div>{shortWeekdayName(date)}</div>
                      <div className="font-normal text-[0.7rem] text-[var(--color-muted)]">
                        {date.slice(8)}/{date.slice(5, 7)}
                      </div>
                    </th>
                  );
                })}
                <th className="numeric">Total</th>
                {editable ? <th /> : null}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.taskId}>
                  <td>
                    <div className="font-medium text-[var(--color-graphite-900)]">
                      {row.taskName}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {row.projectCode} · {row.projectName}
                    </div>
                  </td>
                  {week.dates.map((date) => {
                    const contracted = week.contractedByDate[date] ?? 0;
                    return (
                      <td key={date} className={contracted === 0 ? "cell-weekend" : ""}>
                        <input
                          className="cell-input"
                          inputMode="decimal"
                          disabled={!editable || pending}
                          value={values[cellKey(row.taskId, date)] ?? ""}
                          onChange={(event) => setCell(row.taskId, date, event.target.value)}
                          aria-label={`${row.taskName} on ${formatDate(date)}`}
                          placeholder="—"
                        />
                      </td>
                    );
                  })}
                  <td className="numeric font-semibold">
                    {formatHours(rowTotal(values, row.taskId, week.dates))}
                  </td>
                  {editable ? (
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => removeRow(row.taskId)}
                        disabled={pending}
                        aria-label={`Remove ${row.taskName}`}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}

              {week.readOnlyRows.map((row) => (
                <tr key={row.key} className="row-readonly">
                  <td>
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                      style={{ background: row.colour }}
                    />
                    <span className="font-medium">{row.label}</span>
                    <div className="text-xs text-[var(--color-muted)] ml-4">
                      Filled in automatically
                    </div>
                  </td>
                  {week.dates.map((date) => (
                    <td key={date} className="numeric text-[var(--color-muted)]">
                      {row.minutesByDate[date] ? formatHours(row.minutesByDate[date]) : ""}
                    </td>
                  ))}
                  <td className="numeric font-semibold">{formatHours(sumRow(row.minutesByDate))}</td>
                  {editable ? <td /> : null}
                </tr>
              ))}

              {rows.length === 0 && week.readOnlyRows.length === 0 ? (
                <tr>
                  <td colSpan={week.dates.length + (editable ? 3 : 2)}>
                    <p className="text-sm text-[var(--color-muted)] py-2">
                      No rows yet. Add a project task below to start recording hours.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>

            <tfoot>
              <tr>
                <td className="font-semibold">Total</td>
                {week.dates.map((date) => {
                  const dayTotal =
                    columnTotal(values, rows, date) + readOnlyColumnTotal(week.readOnlyRows, date);
                  const contracted = week.contractedByDate[date] ?? 0;
                  const short = contracted > 0 && dayTotal !== contracted;
                  return (
                    <td
                      key={date}
                      className={`numeric font-semibold ${contracted === 0 ? "cell-weekend" : ""} ${
                        short ? "text-[var(--color-caution)]" : ""
                      }`}
                    >
                      {dayTotal > 0 ? formatHours(dayTotal) : "—"}
                    </td>
                  );
                })}
                <td className="numeric font-semibold">{formatHours(accounted)}</td>
                {editable ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {editable ? (
        <div className="card">
          <div className="card-body flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[16rem]">
              <label className="label" htmlFor="add-task">
                Add a project task
              </label>
              <select
                id="add-task"
                className="select"
                value=""
                disabled={pending}
                onChange={(event) => {
                  addRow(event.target.value);
                  event.target.value = "";
                }}
              >
                <option value="">Choose a task…</option>
                {taskOptions.map((project) => (
                  <optgroup key={project.id} label={`${project.code} · ${project.name}`}>
                    {project.tasks
                      .filter((task) => !usedTaskIds.has(task.id))
                      .map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-body space-y-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <Figure label="Contracted" value={`${formatHours(week.totals.contractedMinutes)}h`} />
            <Figure label="Worked" value={`${formatHours(workedMinutes)}h`} />
            <Figure label="Leave and bank holidays" value={`${formatHours(readOnlyMinutes)}h`} />
            <Figure
              label="Difference"
              value={`${variance > 0 ? "+" : ""}${formatHours(variance)}h`}
              tone={matchesContract ? "ok" : "warn"}
            />
          </div>

          {editable && !matchesContract ? (
            <div className="space-y-2">
              <div className="notice notice-warning">
                This week is {variance > 0 ? "above" : "below"} your contracted hours by{" "}
                {formatHours(Math.abs(variance))} hours. You can still submit it — just say why.
              </div>
              <div>
                <label className="label" htmlFor="variance-reason">
                  Reason
                </label>
                <input
                  id="variance-reason"
                  className="input"
                  value={varianceReason}
                  disabled={pending}
                  onChange={(event) => setVarianceReason(event.target.value)}
                  placeholder="e.g. Covered a Saturday call-out, taking the time back next week"
                />
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div className={`notice ${feedback.kind === "ok" ? "notice-success" : "notice-error"}`}>
              {feedback.text}
            </div>
          ) : null}

          {editable ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={onSave} disabled={pending}>
                {pending ? "Working…" : "Save draft"}
              </button>
              <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={pending}>
                Submit for approval
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">
              This week is locked. Ask an administrator if it needs to be reopened.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const colour =
    tone === "warn"
      ? "text-[var(--color-caution)]"
      : tone === "ok"
        ? "text-[var(--color-positive)]"
        : "text-[var(--color-graphite-900)]";
  return (
    <div>
      <div className="section-title">{label}</div>
      <div className={`text-lg font-semibold ${colour}`}>{value}</div>
    </div>
  );
}

function initialValues(rows: GridRow[]): CellValues {
  const values: CellValues = {};
  for (const row of rows) {
    for (const [date, minutes] of Object.entries(row.minutesByDate)) {
      values[cellKey(row.taskId, date)] = formatHours(minutes);
    }
  }
  return values;
}

function rowTotal(values: CellValues, taskId: string, dates: PlainDate[]): number {
  return dates.reduce(
    (total, date) => total + (parseHoursInput(values[cellKey(taskId, date)] ?? "") ?? 0),
    0,
  );
}

function columnTotal(values: CellValues, rows: GridRow[], date: PlainDate): number {
  return rows.reduce(
    (total, row) => total + (parseHoursInput(values[cellKey(row.taskId, date)] ?? "") ?? 0),
    0,
  );
}

function readOnlyColumnTotal(rows: ReadOnlyRow[], date: PlainDate): number {
  return rows.reduce((total, row) => total + (row.minutesByDate[date] ?? 0), 0);
}

function sumRow(minutesByDate: Record<string, number>): number {
  return Object.values(minutesByDate).reduce((a, b) => a + b, 0);
}
