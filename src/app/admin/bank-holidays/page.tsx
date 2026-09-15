import { AppShell } from "@/components/app-shell";
import { deleteBankHoliday, saveBankHoliday } from "@/lib/actions/admin";
import { prisma } from "@/lib/db";
import { formatLongDate, toPlainDate, today, weekdayName } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";

export default async function BankHolidaysPage() {
  const user = await requireAdmin();
  const holidays = await prisma.bankHoliday.findMany({ orderBy: { date: "asc" } });
  const now = today();
  const upcoming = holidays.filter((holiday) => toPlainDate(holiday.date) >= now);
  const past = holidays.filter((holiday) => toPlainDate(holiday.date) < now);

  return (
    <AppShell user={user} current="/admin">
      <div className="mb-5">
        <h1 className="page-title">Bank holidays</h1>
        <p className="page-subtitle">
          These are never deducted from anyone&apos;s allowance, and they fill themselves into
          timesheets. Seeded with England &amp; Wales dates — edit them for your own closures.
        </p>
      </div>

      <section className="card mb-5">
        <div className="card-header">
          <h2 className="font-semibold">Add a date</h2>
        </div>
        <form action={saveBankHoliday} className="card-body flex flex-wrap gap-3 items-end">
          <div>
            <label className="label" htmlFor="date">
              Date
            </label>
            <input id="date" name="date" type="date" className="input" required />
          </div>
          <div className="flex-1 min-w-[14rem]">
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              className="input"
              placeholder="Christmas Day, or Company shutdown"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <HolidayList title={`Upcoming (${upcoming.length})`} holidays={upcoming} deletable />
        <HolidayList title={`Past (${past.length})`} holidays={past} />
      </div>
    </AppShell>
  );
}

function HolidayList({
  title,
  holidays,
  deletable = false,
}: {
  title: string;
  holidays: { id: string; date: Date; name: string }[];
  deletable?: boolean;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <tbody>
            {holidays.length === 0 ? (
              <tr>
                <td>
                  <p className="text-sm text-[var(--color-muted)]">Nothing to show.</p>
                </td>
              </tr>
            ) : (
              holidays.map((holiday) => {
                const date = toPlainDate(holiday.date);
                return (
                  <tr key={holiday.id}>
                    <td>
                      <div className="font-medium">{holiday.name}</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {weekdayName(date)}, {formatLongDate(date)}
                      </div>
                    </td>
                    {deletable ? (
                      <td className="text-right">
                        <form action={deleteBankHoliday}>
                          <input type="hidden" name="id" value={holiday.id} />
                          <button type="submit" className="btn btn-danger btn-sm">
                            Remove
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const dynamic = "force-dynamic";
