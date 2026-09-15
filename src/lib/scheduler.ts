import { prisma } from "@/lib/db";
import { runYearEndRollover, sendManagerDigests, sendTimesheetReminders } from "@/lib/jobs";
import { syncDirectory } from "@/lib/ldap/sync";

/**
 * In-process scheduler. At 50 people this is the right size of solution: no
 * broker, no separate worker image, nothing else to deploy.
 *
 * A Postgres advisory lock means that if the app is ever run with more than one
 * replica, only one of them sends the Friday reminder.
 */
const LOCK_KEY = 4823701; // arbitrary, must be stable across replicas
const TICK_MS = 60_000;

interface Job {
  name: string;
  /** Local hour and minute, and day of week (0 = Sunday), in the container's TZ. */
  dayOfWeek: number | null;
  hour: number;
  minute: number;
  run: () => Promise<number>;
}

const JOBS: Job[] = [
  {
    name: "timesheet-reminders",
    dayOfWeek: 5, // Friday
    hour: 16,
    minute: 0,
    run: sendTimesheetReminders,
  },
  {
    name: "manager-digest",
    dayOfWeek: 1, // Monday
    hour: 9,
    minute: 0,
    run: sendManagerDigests,
  },
  {
    name: "directory-sync",
    dayOfWeek: null,
    hour: 2,
    minute: 0,
    run: async () => (await syncDirectory()).updated,
  },
  {
    name: "year-end-rollover",
    dayOfWeek: null, // checked daily; the job itself no-ops unless it is the date
    hour: 1,
    minute: 0,
    run: () => runYearEndRollover(),
  },
];

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  console.info("[scheduler] started");
  setInterval(() => {
    void tick();
  }, TICK_MS).unref?.();
}

async function tick(): Promise<void> {
  const now = new Date();
  const due = JOBS.filter(
    (job) =>
      (job.dayOfWeek === null || job.dayOfWeek === now.getDay()) &&
      job.hour === now.getHours() &&
      job.minute === now.getMinutes(),
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
