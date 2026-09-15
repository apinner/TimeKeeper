import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { addDays, formatDate, startOfWeek, today } from "@/lib/dates";
import { canApproveAnything, requireUser } from "@/lib/session";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!(await canApproveAnything(user))) redirect("/");

  const params = await searchParams;
  const to = params.to ?? today();
  const from = params.from ?? addDays(startOfWeek(to), -28);
  const range = `from=${from}&to=${to}`;

  return (
    <AppShell user={user} current="/reports">
      <div className="mb-5">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">
          Everything below covers {formatDate(from)} to {formatDate(to)}.
        </p>
      </div>

      <div className="card mb-5">
        <div className="card-body">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label className="label" htmlFor="from">
                From
              </label>
              <input id="from" name="from" type="date" className="input" defaultValue={from} />
            </div>
            <div>
              <label className="label" htmlFor="to">
                To
              </label>
              <input id="to" name="to" type="date" className="input" defaultValue={to} />
            </div>
            <button type="submit" className="btn btn-primary">
              Update
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ReportCard
          title="Payroll export"
          description="Approved hours per person for the period, with leave and bank holidays separated out. The file payroll actually wants each month."
          viewHref={`/reports/hours?${range}`}
          downloadHref={`/api/reports/payroll?${range}`}
        />
        <ReportCard
          title="Project time"
          description="Hours by project and task, broken down by person. What the two-level project structure was for."
          viewHref={`/reports/hours?${range}`}
          downloadHref={`/api/reports/hours?${range}`}
        />
        <ReportCard
          title="Leave taken"
          description="Every approved absence in the period by person and type, day by day."
          viewHref="/team"
          downloadHref={`/api/reports/leave?${range}`}
        />
        <ReportCard
          title="Outstanding balances"
          description="Remaining and pending holiday for everyone as things stand — year-end liability, and who needs chasing to book time off."
          viewHref="/reports/balances"
          downloadHref="/api/reports/balances"
        />
      </div>
    </AppShell>
  );
}

function ReportCard({
  title,
  description,
  viewHref,
  downloadHref,
}: {
  title: string;
  description: string;
  viewHref: string;
  downloadHref: string;
}) {
  return (
    <div className="card">
      <div className="card-body">
        <h2 className="font-semibold mb-1">{title}</h2>
        <p className="text-sm text-[var(--color-muted)] mb-3">{description}</p>
        <div className="flex gap-2">
          <Link href={viewHref} className="btn btn-secondary btn-sm">
            View
          </Link>
          <a href={downloadHref} className="btn btn-primary btn-sm">
            Download CSV
          </a>
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
