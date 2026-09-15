import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createDelegation, deleteDelegation } from "@/lib/actions/admin";
import { prisma } from "@/lib/db";
import { addDays, formatDate, toPlainDate, today } from "@/lib/dates";
import { canApproveAnything, isAdmin, requireUser } from "@/lib/session";

export default async function DelegationPage() {
  const user = await requireUser();
  if (!(await canApproveAnything(user))) redirect("/");

  const admin = isAdmin(user);
  const now = today();

  const [delegations, colleagues, managers] = await Promise.all([
    prisma.delegation.findMany({
      where: admin ? {} : { OR: [{ managerId: user.id }, { delegateId: user.id }] },
      include: {
        manager: { select: { id: true, name: true, upn: true } },
        delegate: { select: { id: true, name: true, upn: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    prisma.user.findMany({
      where: { isActive: true, id: { not: user.id } },
      select: { id: true, name: true, upn: true },
      orderBy: { name: "asc" },
    }),
    admin
      ? prisma.user.findMany({
          where: { isActive: true, reports: { some: {} } },
          select: { id: true, name: true, upn: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <AppShell user={user} current="/approvals">
      <div className="mb-5">
        <h1 className="page-title">Approval cover</h1>
        <p className="page-subtitle">
          Nominate someone to handle your approvals while you are away. Cover is date-bounded and
          expires by itself, and decisions are recorded as made on your behalf.
        </p>
      </div>

      <section className="card mb-5">
        <div className="card-header">
          <h2 className="font-semibold">Arrange cover</h2>
        </div>
        <form action={createDelegation} className="card-body grid gap-3 sm:grid-cols-4 items-end">
          {admin ? (
            <div>
              <label className="label" htmlFor="managerId">
                For
              </label>
              <select id="managerId" name="managerId" className="select" defaultValue={user.id}>
                <option value={user.id}>Me</option>
                {managers
                  .filter((manager) => manager.id !== user.id)
                  .map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name ?? manager.upn}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="managerId" value={user.id} />
          )}

          <div>
            <label className="label" htmlFor="delegateId">
              Covered by
            </label>
            <select id="delegateId" name="delegateId" className="select" required>
              <option value="">Choose someone…</option>
              {colleagues.map((colleague) => (
                <option key={colleague.id} value={colleague.id}>
                  {colleague.name ?? colleague.upn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="startDate">
              From
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              className="input"
              defaultValue={now}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="endDate">
              Until
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              className="input"
              defaultValue={addDays(now, 7)}
              required
            />
          </div>

          <div className="sm:col-span-4">
            <button type="submit" className="btn btn-primary">
              Arrange cover
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold">Cover arrangements</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Manager</th>
                <th>Covered by</th>
                <th>Dates</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {delegations.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="text-sm text-[var(--color-muted)] py-2">
                      No cover arranged.
                    </p>
                  </td>
                </tr>
              ) : (
                delegations.map((delegation) => {
                  const start = toPlainDate(delegation.startDate);
                  const end = toPlainDate(delegation.endDate);
                  const active = start <= now && end >= now;
                  const finished = end < now;

                  return (
                    <tr key={delegation.id}>
                      <td className="font-medium">
                        {delegation.manager.name ?? delegation.manager.upn}
                      </td>
                      <td>{delegation.delegate.name ?? delegation.delegate.upn}</td>
                      <td>
                        {formatDate(start)} – {formatDate(end)}
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            active ? "pill-approved" : finished ? "pill-neutral" : "pill-pending"
                          }`}
                        >
                          {active ? "Active" : finished ? "Expired" : "Scheduled"}
                        </span>
                      </td>
                      <td className="text-right">
                        {!finished ? (
                          <form action={deleteDelegation}>
                            <input type="hidden" name="id" value={delegation.id} />
                            <button type="submit" className="btn btn-danger btn-sm">
                              Cancel
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
