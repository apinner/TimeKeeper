/**
 * Essential seed: reference data every deployment needs. Safe to run repeatedly
 * — everything here is an upsert.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { encryptSecret } from "../src/lib/crypto";

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

/**
 * Directory and mail settings used to live in the environment. On the first
 * start after upgrading, anything still set there is copied into the database
 * once, so an existing deployment keeps working and the variables can then be
 * deleted. Settings already in the database are never overwritten.
 */
async function importLegacyEnvironment() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) return;

  const imported: string[] = [];
  const data: Record<string, unknown> = {};

  if (!settings.ldapUrl && process.env.LDAP_URL) {
    Object.assign(data, {
      ldapEnabled: true,
      ldapUrl: process.env.LDAP_URL,
      ldapBaseDn: process.env.LDAP_BASE_DN ?? null,
      ldapUpnSuffix: process.env.LDAP_UPN_SUFFIX ?? null,
      ldapAccessGroupDn: process.env.LDAP_ACCESS_GROUP_DN ?? null,
      ldapBindDn: process.env.LDAP_BIND_DN ?? null,
      ldapBindPasswordEnc: process.env.LDAP_BIND_PASSWORD
        ? encryptSecret(process.env.LDAP_BIND_PASSWORD)
        : null,
      ldapStartTls: process.env.LDAP_STARTTLS === "true",
      ldapTlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
      ldapNestedGroups: process.env.LDAP_NESTED_GROUPS !== "false",
      ldapBindMode: process.env.LDAP_BIND_MODE === "search" ? "search" : "upn",
    });
    if (process.env.LDAP_PERSON_FILTER) data.ldapPersonFilter = process.env.LDAP_PERSON_FILTER;
    imported.push("directory");
  }

  if (!settings.smtpHost && process.env.SMTP_HOST) {
    Object.assign(data, {
      smtpHost: process.env.SMTP_HOST,
      smtpPort: Number(process.env.SMTP_PORT ?? 587),
      smtpSecure: process.env.SMTP_SECURE === "true",
      smtpUser: process.env.SMTP_USER ?? null,
      smtpPasswordEnc: process.env.SMTP_PASSWORD
        ? encryptSecret(process.env.SMTP_PASSWORD)
        : null,
    });
    if (process.env.SMTP_FROM) data.smtpFrom = process.env.SMTP_FROM;
    imported.push("email");
  }

  if (!settings.appUrl && process.env.APP_URL) {
    data.appUrl = process.env.APP_URL;
  }

  if (Object.keys(data).length === 0) return;

  await prisma.settings.update({ where: { id: 1 }, data });
  console.log(
    `Imported ${imported.join(" and ")} settings from the environment — these are now managed in Admin, and the variables can be removed`,
  );
}

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  console.log("Settings ready");
  await importLegacyEnvironment();

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

  const [administrators, withPassword, settings] = await Promise.all([
    prisma.user.count({ where: { role: { in: ["HR_ADMIN", "SYSADMIN"] } } }),
    prisma.user.count({ where: { passwordHash: { not: null } } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  if (withPassword === 0 && !settings?.ldapEnabled) {
    console.log("\nNobody can sign in yet. Open TimeKeeper in a browser to create the first");
    console.log("administrator — the setup page is offered until one exists.");
  } else {
    console.log(`${administrators} administrator(s); ${withPassword} with a local password`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
