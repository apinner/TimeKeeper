import { AppShell } from "@/components/app-shell";
import { saveLeaveType } from "@/lib/actions/admin";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export default async function LeaveTypesPage() {
  const user = await requireAdmin();
  const types = await prisma.leaveType.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <AppShell user={user} current="/admin">
      <div className="mb-5">
        <h1 className="page-title">Leave types</h1>
        <p className="page-subtitle">
          Each type carries its own rules, so adding one later is a settings change rather than a
          code change.
        </p>
      </div>

      <div className="card mb-5">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Deducts allowance</th>
                <th>Needs approval</th>
                <th>Paid</th>
                <th>Note required</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.id}>
                  <td>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                      style={{ background: type.colour }}
                    />
                    <span className="font-medium">{type.name}</span>
                    <span className="text-xs text-[var(--color-muted)] ml-2">{type.code}</span>
                  </td>
                  <td>{type.deductsFromAllowance ? "Yes" : "No"}</td>
                  <td>{type.requiresApproval ? "Yes" : "No"}</td>
                  <td>{type.isPaid ? "Yes" : "No"}</td>
                  <td>{type.requiresNote ? "Yes" : "No"}</td>
                  <td>
                    <span className={`pill ${type.isActive ? "pill-approved" : "pill-neutral"}`}>
                      {type.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="font-semibold">Add a leave type</h2>
        </div>
        <form action={saveLeaveType} className="card-body space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="code">
                Code
              </label>
              <input id="code" name="code" className="input" placeholder="JURY" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" placeholder="Jury service" required />
            </div>
            <div>
              <label className="label" htmlFor="colour">
                Colour
              </label>
              <input
                id="colour"
                name="colour"
                type="color"
                className="input h-[38px] p-1"
                defaultValue="#53565a"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="deductsFromAllowance" />
              Deducts from holiday allowance
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresApproval" defaultChecked />
              Requires approval
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isPaid" defaultChecked />
              Paid
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresNote" />
              Note required
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isActive" defaultChecked />
              Active
            </label>
          </div>

          <input type="hidden" name="sortOrder" value={types.length + 1} />
          <button type="submit" className="btn btn-primary">
            Add leave type
          </button>
        </form>
      </section>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
