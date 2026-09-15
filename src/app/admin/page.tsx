import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export default async function AdminPage() {
  const user = await requireAdmin();

  const [people, missingManager, projects, leaveTypes, holidays] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, managerId: null, role: "EMPLOYEE" } }),
    prisma.project.count({ where: { isActive: true } }),
    prisma.leaveType.count({ where: { isActive: true } }),
    prisma.bankHoliday.count({ where: { isActive: true } }),
  ]);

  return (
    <AppShell user={user} current="/admin">
      <div className="mb-5">
        <h1 className="page-title">Admin</h1>
        <p className="page-subtitle">Company settings, people and reference data.</p>
      </div>

      {missingManager > 0 ? (
        <div className="notice notice-warning mb-5">
          <strong>
            {missingManager} {missingManager === 1 ? "person has" : "people have"} no line manager.
          </strong>{" "}
          Their requests go to the HR queue until you assign one. Accounts are created on first
          sign-in and the org chart is not read from Microsoft 365, so this is set here.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminCard
          href="/admin/people"
          title="People"
          detail={`${people} active — roles, line managers, working patterns, allowances`}
        />
        <AdminCard
          href="/admin/projects"
          title="Projects and tasks"
          detail={`${projects} active projects — what hours can be booked against`}
        />
        <AdminCard
          href="/admin/leave-types"
          title="Leave types"
          detail={`${leaveTypes} active — what deducts from allowance, what needs approval`}
        />
        <AdminCard
          href="/admin/bank-holidays"
          title="Bank holidays"
          detail={`${holidays} dates — never deducted from anyone's allowance`}
        />
        <AdminCard
          href="/admin/settings"
          title="Company settings"
          detail="Leave year, carryover cap and expiry, default allowance, reminders"
        />
        <AdminCard
          href="/delegation"
          title="Approval cover"
          detail="Date-bounded delegates for managers who are away"
        />
      </div>
    </AppShell>
  );
}

function AdminCard({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="card hover:border-[var(--color-brand)] transition-colors">
      <div className="card-body">
        <h2 className="font-semibold mb-1">{title}</h2>
        <p className="text-sm text-[var(--color-muted)]">{detail}</p>
      </div>
    </Link>
  );
}

export const dynamic = "force-dynamic";
