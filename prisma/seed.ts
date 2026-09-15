/**
 * Essential seed: reference data every deployment needs. Safe to run repeatedly
 * — everything here is an upsert.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const LEAVE_TYPES = [
  {
    code: "ANNUAL",
    name: "Annual leave",
    colour: "#f08120",
    deductsFromAllowance: true,
    requiresApproval: true,
    isPaid: true,
    requiresNote: false,
    sortOrder: 1,
  },
  {
    code: "SICK",
    name: "Sick leave",
    colour: "#b3261e",
    deductsFromAllowance: false,
    requiresApproval: false,
    isPaid: true,
    requiresNote: true,
    sortOrder: 2,
  },
  {
    code: "UNPAID",
    name: "Unpaid leave",
    colour: "#6b6f75",
    deductsFromAllowance: false,
    requiresApproval: true,
    isPaid: false,
    requiresNote: true,
    sortOrder: 3,
  },
  {
    code: "COMPASSIONATE",
    name: "Compassionate leave",
    colour: "#53565a",
    deductsFromAllowance: false,
    requiresApproval: true,
    isPaid: true,
    requiresNote: false,
    sortOrder: 4,
  },
  {
    code: "TOIL",
    name: "Time off in lieu",
    colour: "#1b7f4d",
    deductsFromAllowance: false,
    requiresApproval: true,
    isPaid: true,
    requiresNote: false,
    sortOrder: 5,
  },
];

/**
 * England & Wales. Admins edit these in the app, so no outbound call to gov.uk
 * is needed from the Docker host — and adding a company shutdown works the
 * same way.
 */
const BANK_HOLIDAYS: [string, string][] = [
  ["2026-01-01", "New Year's Day"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-06", "Easter Monday"],
  ["2026-05-04", "Early May bank holiday"],
  ["2026-05-25", "Spring bank holiday"],
  ["2026-08-31", "Summer bank holiday"],
  ["2026-12-25", "Christmas Day"],
  ["2026-12-28", "Boxing Day (substitute day)"],
  ["2027-01-01", "New Year's Day"],
  ["2027-03-26", "Good Friday"],
  ["2027-03-29", "Easter Monday"],
  ["2027-05-03", "Early May bank holiday"],
  ["2027-05-31", "Spring bank holiday"],
  ["2027-08-30", "Summer bank holiday"],
  ["2027-12-27", "Christmas Day (substitute day)"],
  ["2027-12-28", "Boxing Day (substitute day)"],
  ["2028-01-03", "New Year's Day (substitute day)"],
  ["2028-04-14", "Good Friday"],
  ["2028-04-17", "Easter Monday"],
  ["2028-05-01", "Early May bank holiday"],
  ["2028-05-29", "Spring bank holiday"],
  ["2028-08-28", "Summer bank holiday"],
  ["2028-12-25", "Christmas Day"],
  ["2028-12-26", "Boxing Day"],
];

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  console.log("Settings ready");

  for (const type of LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { code: type.code },
      create: type,
      update: {},
    });
  }
  console.log(`${LEAVE_TYPES.length} leave types ready`);

  for (const [date, name] of BANK_HOLIDAYS) {
    await prisma.bankHoliday.upsert({
      where: { date: asDate(date) },
      create: { date: asDate(date), name },
      update: {},
    });
  }
  console.log(`${BANK_HOLIDAYS.length} bank holidays ready (England & Wales)`);

  const admin = process.env.BOOTSTRAP_ADMIN_UPN?.trim();
  if (admin) {
    console.log(`First administrator will be ${admin} when they first sign in`);
  } else {
    console.warn("BOOTSTRAP_ADMIN_UPN is not set — nobody will be able to reach the admin screens");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
