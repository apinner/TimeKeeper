import { AppShell } from "@/components/app-shell";
import { updateSettings } from "@/lib/actions/admin";
import { monthName } from "@/lib/dates";
import { minutesToHours } from "@/lib/duration";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/session";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default async function SettingsPage() {
  const user = await requireAdmin();
  const settings = await getSettings();

  return (
    <AppShell user={user} current="/admin">
      <div className="mb-5">
        <h1 className="page-title">Company settings</h1>
        <p className="page-subtitle">Applies to everyone. Changes take effect immediately.</p>
      </div>

      <form action={updateSettings} className="space-y-4">
        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Identity</h2>
          </div>
          <div className="card-body grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="companyName">
                Company name
              </label>
              <input
                id="companyName"
                name="companyName"
                className="input"
                defaultValue={settings.companyName}
              />
            </div>
            <div>
              <label className="label" htmlFor="logoPath">
                Logo path
              </label>
              <input
                id="logoPath"
                name="logoPath"
                className="input"
                defaultValue={settings.logoPath}
              />
              <p className="hint">
                A file in the public folder, e.g. /logo.svg. Replace that file to change the logo.
              </p>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Leave year</h2>
          </div>
          <div className="card-body space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="leaveYearStartDay">
                  Starts on day
                </label>
                <input
                  id="leaveYearStartDay"
                  name="leaveYearStartDay"
                  type="number"
                  min="1"
                  max="31"
                  className="input"
                  defaultValue={settings.leaveYearStartDay}
                />
              </div>
              <div>
                <label className="label" htmlFor="leaveYearStartMonth">
                  of month
                </label>
                <select
                  id="leaveYearStartMonth"
                  name="leaveYearStartMonth"
                  className="select"
                  defaultValue={settings.leaveYearStartMonth}
                >
                  {MONTHS.map((month) => (
                    <option key={month} value={month}>
                      {monthName(month)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="defaultAllowanceHours">
                  Default allowance (hours)
                </label>
                <input
                  id="defaultAllowanceHours"
                  name="defaultAllowanceHours"
                  type="number"
                  step="0.25"
                  min="0"
                  className="input"
                  defaultValue={minutesToHours(settings.defaultAllowanceMinutes)}
                />
                <p className="hint">
                  Given to new starters, pro-rated if they join mid-year.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="carryoverCapHours">
                  Carryover cap (hours)
                </label>
                <input
                  id="carryoverCapHours"
                  name="carryoverCapHours"
                  type="number"
                  step="0.25"
                  min="0"
                  className="input"
                  defaultValue={minutesToHours(settings.carryoverCapMinutes)}
                />
              </div>
              <div>
                <label className="label" htmlFor="carryoverExpiryDay">
                  Carried leave expires on day
                </label>
                <input
                  id="carryoverExpiryDay"
                  name="carryoverExpiryDay"
                  type="number"
                  min="1"
                  max="31"
                  className="input"
                  defaultValue={settings.carryoverExpiryDay}
                />
              </div>
              <div>
                <label className="label" htmlFor="carryoverExpiryMonth">
                  of month
                </label>
                <select
                  id="carryoverExpiryMonth"
                  name="carryoverExpiryMonth"
                  className="select"
                  defaultValue={settings.carryoverExpiryMonth}
                >
                  {MONTHS.map((month) => (
                    <option key={month} value={month}>
                      {monthName(month)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="hint">
              At year end, unused leave up to the cap carries forward and lapses on the expiry date.
              A negative balance carries forward in full rather than being written off.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Scheduled jobs</h2>
            <span className="text-sm text-[var(--color-muted)]">Times are local</span>
          </div>
          <div className="card-body space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="timesheetRemindersOn"
                defaultChecked={settings.timesheetRemindersOn}
              />
              Remind anyone whose week is not submitted
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="reminderDayOfWeek">
                  Reminder day
                </label>
                <select
                  id="reminderDayOfWeek"
                  name="reminderDayOfWeek"
                  className="select"
                  defaultValue={settings.reminderDayOfWeek}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="reminderHour">
                  Reminder hour
                </label>
                <input
                  id="reminderHour"
                  name="reminderHour"
                  type="number"
                  min="0"
                  max="23"
                  className="input"
                  defaultValue={settings.reminderHour}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="managerDigestOn"
                defaultChecked={settings.managerDigestOn}
              />
              Send approvers a digest of what is waiting
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="digestDayOfWeek">
                  Digest day
                </label>
                <select
                  id="digestDayOfWeek"
                  name="digestDayOfWeek"
                  className="select"
                  defaultValue={settings.digestDayOfWeek}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="digestHour">
                  Digest hour
                </label>
                <input
                  id="digestHour"
                  name="digestHour"
                  type="number"
                  min="0"
                  max="23"
                  className="input"
                  defaultValue={settings.digestHour}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="directorySyncHour">
                  Directory sync hour
                </label>
                <input
                  id="directorySyncHour"
                  name="directorySyncHour"
                  type="number"
                  min="0"
                  max="23"
                  className="input"
                  defaultValue={settings.directorySyncHour}
                />
              </div>
              <div>
                <label className="label" htmlFor="rolloverHour">
                  Year-end rollover hour
                </label>
                <input
                  id="rolloverHour"
                  name="rolloverHour"
                  type="number"
                  min="0"
                  max="23"
                  className="input"
                  defaultValue={settings.rolloverHour}
                />
              </div>
              <div>
                <label className="label" htmlFor="sessionHours">
                  Stay signed in (hours)
                </label>
                <input
                  id="sessionHours"
                  name="sessionHours"
                  type="number"
                  min="1"
                  max="168"
                  className="input"
                  defaultValue={settings.sessionHours}
                />
                <p className="hint">Applies to new sign-ins.</p>
              </div>
            </div>

            <p className="hint">
              Sending needs a mail relay, configured under Admin → Email. Without one, messages are
              written to the application log.
            </p>
          </div>
        </section>

        <button type="submit" className="btn btn-primary">
          Save settings
        </button>
      </form>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
