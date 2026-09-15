import { AppShell } from "@/components/app-shell";
import { saveProject, saveTask } from "@/lib/actions/admin";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export default async function ProjectsPage() {
  const user = await requireAdmin();
  const projects = await prisma.project.findMany({
    include: { tasks: { orderBy: { name: "asc" } } },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return (
    <AppShell user={user} current="/admin">
      <div className="mb-5">
        <h1 className="page-title">Projects and tasks</h1>
        <p className="page-subtitle">
          Hours are booked against a task, and every task belongs to a project. Deactivate rather
          than delete, so historic timesheets keep their meaning.
        </p>
      </div>

      <section className="card mb-5">
        <div className="card-header">
          <h2 className="font-semibold">Add a project</h2>
        </div>
        <form action={saveProject} className="card-body grid gap-3 sm:grid-cols-4 items-end">
          <div>
            <label className="label" htmlFor="code">
              Code
            </label>
            <input id="code" name="code" className="input" placeholder="ACME-01" required />
          </div>
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" className="input" placeholder="Line 3 upgrade" required />
          </div>
          <div>
            <label className="label" htmlFor="client">
              Client
            </label>
            <input id="client" name="client" className="input" placeholder="Acme Foods" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isBillable" defaultChecked />
              Billable
            </label>
            <input type="hidden" name="isActive" value="on" />
            <button type="submit" className="btn btn-primary">
              Add project
            </button>
          </div>
        </form>
      </section>

      <div className="space-y-4">
        {projects.length === 0 ? (
          <div className="card">
            <div className="card-body text-sm text-[var(--color-muted)]">
              No projects yet. Nobody can record hours until at least one project with a task
              exists.
            </div>
          </div>
        ) : (
          projects.map((project) => (
            <section key={project.id} className={`card ${project.isActive ? "" : "opacity-60"}`}>
              <div className="card-header">
                <div>
                  <h2 className="font-semibold">
                    {project.code} · {project.name}
                  </h2>
                  <p className="text-xs text-[var(--color-muted)]">
                    {project.client ?? "Internal"} · {project.isBillable ? "Billable" : "Non-billable"}
                    {project.isActive ? "" : " · Inactive"}
                  </p>
                </div>
                <form action={saveProject} className="flex items-center gap-2">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <input type="hidden" name="name" value={project.name} />
                  <input type="hidden" name="client" value={project.client ?? ""} />
                  {project.isBillable ? <input type="hidden" name="isBillable" value="on" /> : null}
                  {project.isActive ? null : <input type="hidden" name="isActive" value="on" />}
                  <button type="submit" className="btn btn-secondary btn-sm">
                    {project.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>

              <div className="card-body">
                {project.tasks.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5 mb-3">
                    {project.tasks.map((task) => (
                      <li key={task.id}>
                        <span className={`pill ${task.isActive ? "pill-neutral" : "pill-rejected"}`}>
                          {task.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-muted)] mb-3">
                    No tasks yet — add one so hours can be booked.
                  </p>
                )}

                <form action={saveTask} className="flex flex-wrap gap-2 items-end">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="isActive" value="on" />
                  <div className="flex-1 min-w-[12rem]">
                    <label className="label" htmlFor={`task-${project.id}`}>
                      Add a task
                    </label>
                    <input
                      id={`task-${project.id}`}
                      name="name"
                      className="input"
                      placeholder="Design, Installation, Commissioning…"
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-secondary">
                    Add task
                  </button>
                </form>
              </div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
