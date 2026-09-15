import { prisma } from "@/lib/db";
import { runYearEndRollover, sendManagerDigests, sendTimesheetReminders } from "@/lib/jobs";
import { syncDirectory } from "@/lib/ldap/sync";
import { getSettings } from "@/lib/settings";

/**
 * In-process scheduler. At 50 people this is the right size of solution: no
 * broker, no separate worker image, nothing else to deploy.
 *
 * Times come from Admin → Company settings and are read on every tick, so a
 * change takes effect without a restart. A Postgres advisory lock means that if
 * the app is ever run with more than one replica, only one of them sends the
 * Friday reminder.
 */
const LOCK_KEY = 4823701; // arbitrary, must be stable across replicas
const TICK_MS = 60_000;

interface Job {
  name: string;
  /** Local hour and day of week (0 = Sunday); null means every day. */
  dayOfWeek: number | null;
  hour: number;
  run: () => Promise<number>;
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  console.info("[scheduler] started");
  setInterval(() => {
    void tick();
  }, TICK_MS).unref?.();
}

async function jobsFor(): Promise<Job[]> {
  const settings = await getSettings();
  return [
    {
      name: "timesheet-reminders",
      dayOfWeek: settings.reminderDayOfWeek,
      hour: settings.reminderHour,
      run: sendTimesheetReminders,
    },
    {
      name: "manager-digest",
      dayOfWeek: settings.digestDayOfWeek,
      hour: settings.digestHour,
      run: sendManagerDigests,
    },
    {
      name: "directory-sync",
      dayOfWeek: null,
      hour: settings.directorySyncHour,
      run: async () => (await syncDirectory()).updated,
    },
    {
      // Checked daily; the job itself does nothing unless it is the first day
      // of the leave year.
      name: "year-end-rollover",
      dayOfWeek: null,
      hour: settings.rolloverHour,
      run: () => runYearEndRollover(),
    },
  ];
}

async function tick(): Promise<void> {
  const now = new Date();
  if (now.getMinutes() !== 0) return;

  let jobs: Job[];
  try {
    jobs = await jobsFor();
  } catch (error) {
    console.error("[scheduler] could not read settings", error);
    return;
  }

  const due = jobs.filter(
    (job) => (job.dayOfWeek === null || job.dayOfWeek === now.getDay()) && job.hour === now.getHours(),
  );

  for (const job of due) {
    const locked = await acquireLock();
    if (!locked) {
      console.info(`[scheduler] ${job.name} skipped — another instance holds the lock`);
      continue;
    }

    try {
      const count = await job.run();
      console.info(`[scheduler] ${job.name} finished (${count})`);
    } catch (error) {
      console.error(`[scheduler] ${job.name} failed`, error);
    } finally {
      await releaseLock();
    }
  }
}

async function acquireLock(): Promise<boolean> {
  try {
    const rows =
      await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint)`;
    return rows[0]?.pg_try_advisory_lock ?? false;
  } catch (error) {
    console.error("[scheduler] could not take the advisory lock", error);
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`;
  } catch (error) {
    console.error("[scheduler] could not release the advisory lock", error);
  }
}
