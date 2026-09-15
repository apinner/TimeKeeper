"use client";

import { useMemo, useState, useTransition } from "react";
import { defaultAllocation, type DayAllocation, totalMinutes } from "@/lib/domain/allocation";
import type { PatternMinutes } from "@/lib/domain/patterns";
import { formatDate, formatLongDate, shortWeekdayName, type PlainDate } from "@/lib/dates";
import { formatDays, formatHours, parseHoursInput } from "@/lib/duration";
import { createLeaveRequest } from "@/lib/actions/leave";

interface LeaveTypeOption {
  id: string;
  name: string;
  requiresNote: boolean;
  deductsFromAllowance: boolean;
}

export function LeaveRequestForm({
  leaveTypes,
  pattern,
  bankHolidays,
  remainingMinutes,
  averageDayMinutes,
}: {
  leaveTypes: LeaveTypeOption[];
  pattern: PatternMinutes;
  bankHolidays: PlainDate[];
  remainingMinutes: number;
  averageDayMinutes: number;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [overrides, setOverrides] = useState<Record<PlainDate, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const holidaySet = useMemo(() => new Set(bankHolidays), [bankHolidays]);
  const selectedType = leaveTypes.find((type) => type.id === leaveTypeId);

  // The same allocation logic the server uses, so what you see before
  // submitting is what gets booked.
  const days: DayAllocation[] = useMemo(() => {
    if (!start || !end || end < start) return [];
    return defaultAllocation({ start, end, pattern, bankHolidays: holidaySet });
  }, [start, end, pattern, holidaySet]);

  const allocation = useMemo(
    () =>
      days.map((day) => {
        const override = overrides[day.date];
        const minutes = override === undefined ? day.minutes : (parseHoursInput(override) ?? 0);
        return { date: day.date, minutes: Math.min(minutes, day.minutes) };
      }),
    [days, overrides],
  );

  const requested = totalMinutes(allocation);
  const deducts = selectedType?.deductsFromAllowance ?? true;
  const balanceAfter = remainingMinutes - requested;
  const overdrawn = deducts && balanceAfter < 0;

  function submit() {
    setError(null);
    const payload = {
      leaveTypeId,
      start,
      end,
      note: note.trim() || undefined,
      allocation: Object.fromEntries(allocation.map((day) => [day.date, day.minutes])),
    };

    startTransition(async () => {
      const result = await createLeaveRequest(payload);
      if (result && !result.ok) setError(result.error ?? "Could not submit that request");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="card">
          <div className="card-body space-y-4">
            <div>
              <label className="label" htmlFor="leave-type">
                Type of leave
              </label>
              <select
                id="leave-type"
                className="select"
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                disabled={pending}
              >
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="start-date">
                  First day
                </label>
                <input
                  id="start-date"
                  type="date"
                  className="input"
                  value={start}
                  disabled={pending}
                  onChange={(event) => {
                    setStart(event.target.value);
                    setOverrides({});
                    if (!end || end < event.target.value) setEnd(event.target.value);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="end-date">
                  Last day
                </label>
                <input
                  id="end-date"
                  type="date"
                  className="input"
                  value={end}
                  min={start}
                  disabled={pending}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setOverrides({});
                  }}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="note">
                Note {selectedType?.requiresNote ? "" : "(optional)"}
              </label>
              <textarea
                id="note"
                className="textarea"
                rows={2}
                value={note}
                disabled={pending}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything your manager should know"
              />
            </div>
          </div>
        </div>

        {allocation.length > 0 ? (
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">Hours to book</h2>
              <span className="text-sm text-[var(--color-muted)]">
                Edit any day for a part day
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th className="numeric">Normally works</th>
                    <th className="numeric">Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => {
                    const value =
                      overrides[day.date] === undefined
                        ? formatHours(day.minutes)
                        : overrides[day.date];
                    return (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td className="text-[var(--color-muted)]">{shortWeekdayName(day.date)}</td>
                        <td className="numeric text-[var(--color-muted)]">
                          {formatHours(day.minutes)}h
                        </td>
                        <td className="numeric w-28">
                          <input
                            className="cell-input"
                            inputMode="decimal"
                            value={value}
                            disabled={pending}
                            aria-label={`Hours on ${formatLongDate(day.date)}`}
                            onChange={(event) =>
                              setOverrides((previous) => ({
                                ...previous,
                                [day.date]: event.target.value,
                              }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card-body border-t border-[var(--color-line)] text-sm text-[var(--color-muted)]">
              Weekends, your non-working days and bank holidays are left out automatically and cost
              you nothing.
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="card">
          <div className="card-body space-y-3">
            <div>
              <div className="section-title">Requesting</div>
              <div className="text-2xl font-semibold">
                {requested > 0 ? formatDays(requested, averageDayMinutes) : "—"}
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {requested > 0 ? `${formatHours(requested)} hours` : "Choose your dates"}
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--color-line)]">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted)]">Balance now</span>
                <span className="font-medium">
                  {formatDays(remainingMinutes, averageDayMinutes)}
                </span>
              </div>
              {deducts ? (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-[var(--color-muted)]">After this request</span>
                  <span
                    className={`font-medium ${overdrawn ? "text-[var(--color-caution)]" : ""}`}
                  >
                    {formatDays(balanceAfter, averageDayMinutes)}
                  </span>
                </div>
              ) : (
                <p className="hint">
                  {selectedType?.name} does not come out of your holiday allowance.
                </p>
              )}
            </div>
          </div>
        </div>

        {overdrawn ? (
          <div className="notice notice-warning">
            This takes you {formatDays(Math.abs(balanceAfter), averageDayMinutes)} beyond your
            remaining allowance. You can still submit it — your manager decides whether to approve
            it, and they will see the shortfall.
          </div>
        ) : null}

        {error ? <div className="notice notice-error">{error}</div> : null}

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={submit}
          disabled={pending || allocation.length === 0 || !leaveTypeId}
        >
          {pending ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </div>
  );
}
