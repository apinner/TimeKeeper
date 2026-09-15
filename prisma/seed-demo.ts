/**
 * Demo data: a fictional 50-person company with a term of history, so the
 * reports and calendar can be judged on something that looks real.
 *
 * Deliberately a separate command from the essential seed, and it refuses to
 * run against a database that already contains real people.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const FIRST_NAMES = [
  "Alice", "Ben", "Chloe", "Daniel", "Eleanor", "Faisal", "Grace", "Harry", "Isla", "Jack",
  "Kirsty", "Liam", "Maya", "Nathan", "Olivia", "Priya", "Quentin", "Rachel", "Sam", "Tara",
  "Umar", "Verity", "Wesley", "Xanthe", "Yusuf", "Zoe", "Adam", "Bethan", "Callum", "Dilys",
  "Ewan", "Fiona", "Gareth", "Heather", "Idris", "Jasmine", "Kieran", "Lorna", "Marcus", "Nia",
  "Owen", "Petra", "Rhys", "Sophie", "Tomasz", "Ursula", "Vikram", "Wendy", "Yasmin", "Zach",
];

const SURNAMES = [
  "Ashton", "Barker", "Chapman", "Doyle", "Ellis", "Fletcher", "Gibson", "Hughes", "Irving",
  "Jarvis", "Kelly", "Lawson", "Mitchell", "Newman", "O'Neill", "Palmer", "Quinn", "Reeves",
  "Sharpe", "Thornton", "Underwood", "Vaughan", "Whitfield", "Yates", "Ziegler",
];

const DEPARTMENTS = [
  { name: "Engineering", size: 18 },
  { name: "Projects", size: 10 },
  { name: "Service", size: 9 },
  { name: "Sales", size: 6 },
  { name: "Finance", size: 4 },
  { name: "Operations", size: 3 },
];

const PROJECTS = [
  { code: "ACM-01", name: "Line 3 conveyor upgrade", client: "Acme Foods", billable: true },
  { code: "BRD-04", name: "Palletiser retrofit", client: "Bradshaw Packaging", billable: true },
  { code: "CLV-02", name: "Robotic cell integration", client: "Calvert Engineering", billable: true },
  { code: "DUR-07", name: "PLC migration", client: "Durham Plastics", billable: true },
  { code: "INT-00", name: "Internal — admin and training", client: null, billable: false },
  { code: "INT-01", name: "Internal — R&D", client: null, billable: false },
];

const TASKS = ["Design", "Build", "Installation", "Commissioning", "Site support", "Documentation"];
const INTERNAL_TASKS = ["Admin", "Training", "Meetings", "Development"];

// Deterministic pseudo-randomness, so a demo database is reproducible.
let seed = 20260915;
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function plainDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = asDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return plainDate(date);
}

function startOfWeek(value: string): string {
  const dow = asDate(value).getUTCDay();
  return addDays(value, dow === 0 ? -6 : 1 - dow);
}

async function main() {
  const realPeople = await prisma.user.count({ where: { entraObjectId: { not: null } } });
  if (realPeople > 0) {
    console.error(
      `Refusing to run: this database has ${realPeople} account(s) created by real sign-ins.`,
    );
    process.exit(1);
  }

  const today = plainDate(new Date());
  const leaveYearStart = `${today.slice(0, 4)}-01-01`;

  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  const annualLeave = await prisma.leaveType.findUnique({ where: { code: "ANNUAL" } });
  const sickLeave = await prisma.leaveType.findUnique({ where: { code: "SICK" } });
  if (!annualLeave || !sickLeave) {
    console.error("Run `npm run seed` first — the leave types are missing.");
    process.exit(1);
  }

  // --- Projects and tasks -------------------------------------------------
  const taskIds: string[] = [];
  for (const project of PROJECTS) {
    const created = await prisma.project.upsert({
      where: { code: project.code },
      create: {
        code: project.code,
        name: project.name,
        client: project.client,
        isBillable: project.billable,
      },
      update: {},
    });

    for (const name of project.billable ? TASKS : INTERNAL_TASKS) {
      const task = await prisma.task.upsert({
        where: { projectId_name: { projectId: created.id, name } },
        create: { projectId: created.id, name },
        update: {},
      });
      taskIds.push(task.id);
    }
  }
  console.log(`${PROJECTS.length} projects with tasks`);

  // --- People -------------------------------------------------------------
  const usedNames = new Set<string>();
  const heads: string[] = [];
  let personIndex = 0;

  for (const department of DEPARTMENTS) {
    let headId: string | null = null;

    for (let i = 0; i < department.size; i += 1) {
      let name = `${FIRST_NAMES[personIndex % FIRST_NAMES.length]} ${pick(SURNAMES)}`;
      while (usedNames.has(name)) name = `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`;
      usedNames.add(name);
      personIndex += 1;

      const upn = `${name.toLowerCase().replace(/[^a-z]/g, ".")}@demo.local`;
      const isHead = i === 0;

      // A handful work part time, which is what makes hours-based leave worth
      // having: their "day" is not 7.5 hours.
      const partTime = !isHead && random() < 0.16;
      const dayMinutes = partTime ? between(4, 7) * 60 : 450;
      const worksFriday = !partTime || random() > 0.5;

      const startDate =
        random() < 0.2
          ? `${Number(today.slice(0, 4))}-${String(between(2, 9)).padStart(2, "0")}-01`
          : `${Number(today.slice(0, 4)) - between(1, 12)}-${String(between(1, 12)).padStart(2, "0")}-01`;

      const managerId: string | null = isHead ? null : headId;

      // Explicitly typed: the created id feeds back into managerId for the next
      // person in the department, which would otherwise make the inferred type
      // of this call circular.
      const user: { id: string } = await prisma.user.create({
        select: { id: true },
        data: {
          upn,
          email: upn,
          name,
          department: department.name,
          jobTitle: isHead ? `Head of ${department.name}` : undefined,
          role: isHead ? "MANAGER" : "EMPLOYEE",
          managerId,
          startDate: asDate(startDate),
          workingPattern: {
            create: {
              mondayMinutes: dayMinutes,
              tuesdayMinutes: dayMinutes,
              wednesdayMinutes: dayMinutes,
              thursdayMinutes: dayMinutes,
              fridayMinutes: worksFriday ? dayMinutes : 0,
              saturdayMinutes: 0,
              sundayMinutes: 0,
            },
          },
        },
      });

      if (isHead) {
        headId = user.id;
        heads.push(user.id);
      }

      const weeklyMinutes = dayMinutes * (worksFriday ? 5 : 4);
      const startedThisYear = startDate >= leaveYearStart;
      const fullAllowance = Math.round((weeklyMinutes / 5) * 25); // 25 days
      await prisma.entitlement.create({
        data: {
          userId: user.id,
          leaveYearStart: asDate(leaveYearStart),
          allowanceMinutes: startedThisYear
            ? Math.round(fullAllowance * 0.6)
            : fullAllowance,
          carriedOverMinutes: startedThisYear ? 0 : between(0, 4) * dayMinutes,
          carryoverExpiresOn: asDate(`${leaveYearStart.slice(0, 4)}-03-31`),
        },
      });
    }
  }

  // One HR administrator, and the department heads report to the first head.
  const [managingDirector] = heads;
  await prisma.user.updateMany({
    where: { id: { in: heads.slice(1) } },
    data: { managerId: managingDirector },
  });

  const hr = await prisma.user.findFirst({ where: { department: "Finance", role: "EMPLOYEE" } });
  if (hr) await prisma.user.update({ where: { id: hr.id }, data: { role: "HR_ADMIN" } });

  const people = await prisma.user.findMany({ include: { workingPattern: true } });
  console.log(`${people.length} people across ${DEPARTMENTS.length} departments`);

  // --- Leave --------------------------------------------------------------
  const holidays = new Set(
    (await prisma.bankHoliday.findMany()).map((holiday) => plainDate(holiday.date)),
  );

  let leaveCount = 0;
  for (const person of people) {
    const pattern = person.workingPattern;
    if (!pattern) continue;

    const requests = between(2, 6);
    for (let i = 0; i < requests; i += 1) {
      const start = addDays(today, between(-150, 60));
      const length = random() < 0.35 ? 1 : between(2, 9);
      const days: { date: string; minutes: number }[] = [];

      for (let d = 0; d < length; d += 1) {
        const date = addDays(start, d);
        const dow = asDate(date).getUTCDay();
        const minutes = [
          pattern.sundayMinutes,
          pattern.mondayMinutes,
          pattern.tuesdayMinutes,
          pattern.wednesdayMinutes,
          pattern.thursdayMinutes,
          pattern.fridayMinutes,
          pattern.saturdayMinutes,
        ][dow];
        if (minutes > 0 && !holidays.has(date)) days.push({ date, minutes });
      }

      if (days.length === 0) continue;

      // Occasionally a half day or a couple of hours, which is the point of
      // booking leave in hours rather than whole days.
      if (days.length === 1 && random() < 0.3) {
        days[0].minutes = random() < 0.5 ? Math.round(days[0].minutes / 2) : 120;
      }

      const inFuture = days[0].date > today;
      const sick = !inFuture && random() < 0.12;
      const status = sick ? "APPROVED" : inFuture && random() < 0.4 ? "PENDING" : "APPROVED";

      await prisma.leaveRequest.create({
        data: {
          userId: person.id,
          leaveTypeId: sick ? sickLeave.id : annualLeave.id,
          startDate: asDate(days[0].date),
          endDate: asDate(days[days.length - 1].date),
          totalMinutes: days.reduce((total, day) => total + day.minutes, 0),
          status,
          note: sick ? "Unwell" : null,
          approverId: person.managerId,
          ...(status === "APPROVED"
            ? { decidedById: person.managerId, decidedAt: new Date() }
            : {}),
          days: {
            create: days.map((day) => ({
              userId: person.id,
              date: asDate(day.date),
              minutes: day.minutes,
            })),
          },
        },
      });
      leaveCount += 1;
    }
  }
  console.log(`${leaveCount} leave requests`);

  // --- Timesheets ---------------------------------------------------------
  let weekCount = 0;
  for (const person of people) {
    const pattern = person.workingPattern;
    if (!pattern) continue;

    for (let weeksAgo = 12; weeksAgo >= 0; weeksAgo -= 1) {
      const weekStart = startOfWeek(addDays(today, -weeksAgo * 7));
      const isCurrentWeek = weeksAgo === 0;
      const status = isCurrentWeek ? "OPEN" : weeksAgo === 1 ? "SUBMITTED" : "APPROVED";

      const timesheet = await prisma.timesheet.create({
        data: {
          userId: person.id,
          weekStart: asDate(weekStart),
          status,
          submittedAt: isCurrentWeek ? null : new Date(),
          approverId: person.managerId,
          ...(status === "APPROVED"
            ? { decidedById: person.managerId, decidedAt: new Date() }
            : {}),
        },
      });

      const personTasks = [pick(taskIds), pick(taskIds), pick(taskIds)];
      for (let day = 0; day < 5; day += 1) {
        const date = addDays(weekStart, day);
        const dow = asDate(date).getUTCDay();
        const contracted = [
          pattern.sundayMinutes,
          pattern.mondayMinutes,
          pattern.tuesdayMinutes,
          pattern.wednesdayMinutes,
          pattern.thursdayMinutes,
          pattern.fridayMinutes,
          pattern.saturdayMinutes,
        ][dow];
        if (contracted === 0 || holidays.has(date)) continue;

        const onLeave = await prisma.leaveDay.findFirst({
          where: { userId: person.id, date: asDate(date), request: { status: "APPROVED" } },
        });
        const remaining = contracted - (onLeave?.minutes ?? 0);
        if (remaining <= 0) continue;

        const split = random() < 0.5 ? [remaining] : [Math.round(remaining / 2), Math.round(remaining / 2)];
        for (let s = 0; s < split.length; s += 1) {
          await prisma.timeEntry.upsert({
            where: {
              timesheetId_taskId_date: {
                timesheetId: timesheet.id,
                taskId: personTasks[s],
                date: asDate(date),
              },
            },
            create: {
              timesheetId: timesheet.id,
              taskId: personTasks[s],
              date: asDate(date),
              minutes: split[s],
            },
            update: { minutes: split[s] },
          });
        }
      }
      weekCount += 1;
    }
  }
  console.log(`${weekCount} timesheet weeks`);

  console.log("\nDemo data ready. These accounts cannot sign in — they have no Entra identity.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
