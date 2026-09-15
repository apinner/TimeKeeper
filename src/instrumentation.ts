/**
 * Next.js calls this once when the server starts. The scheduler lives in the
 * app process rather than a separate container, which is the right trade at
 * this size; set ENABLE_SCHEDULER=false on any replica that should not run it.
 *
 * The import is nested inside the runtime check so the Node-only database and
 * mail code is never pulled into the Edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.ENABLE_SCHEDULER === "false") return;
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
