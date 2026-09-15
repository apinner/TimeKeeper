import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { ldapConfigFrom } from "@/lib/ldap/config";
import { smtpConfigFrom } from "@/lib/email/mailer";
import type { Settings } from "@prisma/client";

beforeAll(() => {
  process.env.AUTH_SECRET = "a-test-secret-used-only-by-the-suite";
});

const settings = (overrides: Partial<Settings> = {}): Settings =>
  ({
    id: 1,
    companyName: "Mechtech Automation",
    logoPath: "/logo.svg",
    leaveYearStartDay: 1,
    leaveYearStartMonth: 1,
    defaultAllowanceMinutes: 10500,
    carryoverCapMinutes: 2250,
    carryoverExpiryDay: 31,
    carryoverExpiryMonth: 3,
    timesheetRemindersOn: true,
    managerDigestOn: true,
    ldapEnabled: false,
    ldapUrl: null,
    ldapBaseDn: null,
    ldapUpnSuffix: null,
    ldapAccessGroupDn: null,
    ldapBindDn: null,
    ldapBindPasswordEnc: null,
    ldapStartTls: false,
    ldapTlsRejectUnauthorized: true,
    ldapNestedGroups: true,
    ldapPersonFilter: "(objectCategory=person)",
    ldapBindMode: "upn",
    ldapTimeoutMs: 10000,
    smtpHost: null,
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: null,
    smtpPasswordEnc: null,
    smtpFrom: "TimeKeeper <timekeeper@example.com>",
    appUrl: null,
    reminderDayOfWeek: 5,
    reminderHour: 16,
    digestDayOfWeek: 1,
    digestHour: 9,
    directorySyncHour: 2,
    rolloverHour: 1,
    sessionHours: 12,
    updatedAt: new Date(),
    ...overrides,
  }) as Settings;

describe("directory settings", () => {
  it("is not configured until it is switched on and filled in", () => {
    expect(ldapConfigFrom(settings())).toBeNull();
    expect(
      ldapConfigFrom(settings({ ldapUrl: "ldap://dc:389", ldapBaseDn: "DC=x" })),
    ).toBeNull(); // still disabled
    expect(ldapConfigFrom(settings({ ldapEnabled: true, ldapUrl: "ldap://dc:389" }))).toBeNull();
  });

  it("decrypts the service account password", () => {
    const config = ldapConfigFrom(
      settings({
        ldapEnabled: true,
        ldapUrl: "ldap://dc:389",
        ldapBaseDn: "DC=example,DC=local",
        ldapBindPasswordEnc: encryptSecret("service-secret"),
      }),
    );
    expect(config?.bindPassword).toBe("service-secret");
  });

  it("survives a password it cannot decrypt, rather than failing to load", () => {
    const config = ldapConfigFrom(
      settings({
        ldapEnabled: true,
        ldapUrl: "ldap://dc:389",
        ldapBaseDn: "DC=example,DC=local",
        ldapBindPasswordEnc: "v1.corrupt.corrupt.corrupt",
      }),
    );
    expect(config).not.toBeNull();
    expect(config?.bindPassword).toBeNull();
  });

  it("treats blank optional fields as unset", () => {
    const config = ldapConfigFrom(
      settings({
        ldapEnabled: true,
        ldapUrl: "ldap://dc:389",
        ldapBaseDn: "DC=example,DC=local",
        ldapUpnSuffix: "   ",
        ldapAccessGroupDn: "",
        ldapPersonFilter: "  ",
      }),
    );
    expect(config?.upnSuffix).toBeNull();
    expect(config?.accessGroupDn).toBeNull();
    expect(config?.personFilter).toBe("(objectCategory=person)");
  });

  it("only accepts the two bind modes", () => {
    const base = { ldapEnabled: true, ldapUrl: "ldap://dc:389", ldapBaseDn: "DC=x" };
    expect(ldapConfigFrom(settings({ ...base, ldapBindMode: "search" }))?.bindMode).toBe("search");
    expect(ldapConfigFrom(settings({ ...base, ldapBindMode: "nonsense" }))?.bindMode).toBe("upn");
  });
});

describe("email settings", () => {
  it("is not configured without a host, so mail goes to the log", () => {
    expect(smtpConfigFrom(settings())).toBeNull();
    expect(smtpConfigFrom(settings({ smtpHost: "   " }))).toBeNull();
  });

  it("decrypts the relay password", () => {
    const config = smtpConfigFrom(
      settings({ smtpHost: "smtp.example.com", smtpPasswordEnc: encryptSecret("relay-secret") }),
    );
    expect(config?.password).toBe("relay-secret");
    expect(config?.port).toBe(587);
  });
});
