import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db";
import { formatDays } from "@/lib/duration";
import { balanceFor } from "@/lib/queries/leave";
import { requireAdmin } from "@/lib/session";

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR_ADMIN: "HR / Admin",
  SYSADMIN: "Sysadmin",
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ showInactive?: string }>;
}) {
  const user = await requireAdmin();
  const { showInactive } = await searchParams;
  const includeInactive = showInactive === "true";

  const people = await prisma.user.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { manager: { select: { name: true, upn: true } }, workingPattern: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const balances = await Promise.all(
    people.map(async (person) => ({ id: person.id, balance: await balanceFor(person.id) })),
  );
  const balanceById = new Map(balances.map((entry) => [entry.id, entry.balance]));

  return (
    <AppShell user={user} current="/admin">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-subtitle">
            {people.length} {includeInactive ? "accounts" : "active accounts"}. Accounts are created
            automatically on first sign-in.
          </p>
        </div>
        <Link
          href={`/admin/people?showInactive=${includeInactive ? "false" : "true"}`}
          className="btn btn-secondary btn-sm"
        >
          {includeInactive ? "Hide inactive" : "Show inactive"}
        </Link>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Line manager</th>
                <th>Department</th>
                <th className="numeric">Remaining</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const balance = balanceById.get(person.id);
                return (
                  <tr key={person.id} className={person.isActive ? "" : "opacity-60"}>
                    <td>
                      <div className="font-medium">{person.name ?? person.upn}</div>
                      <div className="text-xs text-[var(--color-muted)]">{person.upn}</div>
                    </td>
                    <td>
                      <span className="pill pill-neutral">{ROLE_LABELS[person.role]}</span>
                    </td>
                    <td className={person.managerId ? "" : "text-[var(--color-caution)]"}>
                      {person.manager?.name ?? person.manager?.upn ?? "Not set — HR queue"}
                    </td>
                    <td className="text-[var(--color-muted)]">{person.department ?? "—"}</td>
                    <td className="numeric">
                      {balance
                        ? formatDays(balance.remainingMinutes, balance.averageDayMinutes)
                        : "—"}
                    </td>
                    <td className="text-right">
                      <Link href={`/admin/people/${person.id}`} className="btn btn-secondary btn-sm">
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
