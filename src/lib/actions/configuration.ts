"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { checkPasswordStrength, encryptSecret, hashPassword } from "@/lib/crypto";
import { mayHoldLocalPassword } from "@/lib/auth/local";
import { ldapConfigFrom } from "@/lib/ldap/config";
import { authenticate, listDirectoryUsers } from "@/lib/ldap/directory";
import { syncDirectory } from "@/lib/ldap/sync";
import { smtpConfigFrom, transportFor } from "@/lib/email/mailer";
import { getSettings } from "@/lib/settings";
import { isAdmin, requireAdmin } from "@/lib/session";
import type { Settings } from "@prisma/client";

export interface ConfigResult {
  ok: boolean;
  message: string;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const flag = (form: FormData, key: string) => form.get(key) === "on";
const int = (form: FormData, key: string, fallback: number) => {
  const value = Number(form.get(key));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
};

// --- Directory ------------------------------------------------------------

/**
 * Settings from the form, with the stored password kept when the field is left
 * blank — so an administrator can change the base DN without having to retype
 * the service account password, and the password is never sent to the browser.
 */
async function directorySettingsFrom(form: FormData): Promise<Partial<Settings>> {
  const current = await getSettings();
  const typedPassword = String(form.get("ldapBindPassword") ?? "");

  return {
    ldapEnabled: flag(form, "ldapEnabled"),
    ldapUrl: text(form, "ldapUrl") || null,
    ldapBaseDn: text(form, "ldapBaseDn") || null,
    ldapUpnSuffix: text(form, "ldapUpnSuffix") || null,
    ldapAccessGroupDn: text(form, "ldapAccessGroupDn") || null,
    ldapBindDn: text(form, "ldapBindDn") || null,
    ldapBindPasswordEnc: typedPassword
      ? encryptSecret(typedPassword)
      : current.ldapBindPasswordEnc,
    ldapStartTls: flag(form, "ldapStartTls"),
    ldapTlsRejectUnauthorized: flag(form, "ldapTlsRejectUnauthorized"),
    ldapNestedGroups: flag(form, "ldapNestedGroups"),
    ldapPersonFilter: text(form, "ldapPersonFilter") || "(objectCategory=person)",
    ldapBindMode: text(form, "ldapBindMode") === "search" ? "search" : "upn",
    ldapTimeoutMs: int(form, "ldapTimeoutMs", 10_000),
  };
}

export async function updateDirectorySettings(form: FormData): Promise<void> {
  await requireAdmin();
  await prisma.settings.update({ where: { id: 1 }, data: await directorySettingsFrom(form) });
  revalidatePath("/admin/authentication");
  revalidatePath("/signin");
}

/**
 * Tries the settings currently on screen rather than the saved ones, so a
 * connection can be proved before it is committed.
 */
export async function testDirectoryConnection(form: FormData): Promise<ConfigResult> {
  await requireAdmin();

  const candidate = { ...(await getSettings()), ...(await directorySettingsFrom(form)) } as Settings;
  const config = ldapConfigFrom({ ...candidate, ldapEnabled: true });
  if (!config) return { ok: false, message: "Enter at least the server URL and base DN." };

  const username = text(form, "testUsername");
  const password = String(form.get("testPassword") ?? "");

  if (username && password) {
    const result = await authenticate(username, password, config);
    if (result.ok) {
      const { profile } = result;
      return {
        ok: true,
        message:
          `Signed in as ${profile.displayName ?? profile.upn}. ` +
          `Department: ${profile.department ?? "not set"}. ` +
          `Manager: ${profile.managerDn ? profile.managerDn.split(",")[0].replace(/^CN=/i, "") : "not set"}.`,
      };
    }
    return { ok: false, message: describeDirectoryFailure(result.reason) };
  }

  if (!config.bindDn || !config.bindPassword) {
    return {
      ok: false,
      message:
        "Enter a test username and password, or a service account, so there is something to bind with.",
    };
  }

  const people = await listDirectoryUsers(config);
  if (people === null) {
    return { ok: false, message: "Could not bind with the service account. Check the details and the connection." };
  }
  return {
    ok: true,
    message: `Connected. The service account can see ${people.length} ${
      people.length === 1 ? "person" : "people"
    }${config.accessGroupDn ? " in the access group" : ""}.`,
  };
}

function describeDirectoryFailure(reason: string): string {
  switch (reason) {
    case "invalid-credentials":
      return "Connected to the directory, but that username and password were rejected.";
    case "not-found":
      return "Connected, but that account was not found. Check the base DN and the username suffix.";
    case "not-permitted":
      return "Connected and the password was accepted, but that account is not in the access group.";
    case "disabled":
      return "Connected. That account exists but is disabled in the directory.";
    case "unavailable":
      return "Could not reach the directory. Check the URL, the port, and that the server allows connections from this container.";
    default:
      return "Sign-in was refused.";
  }
}

export async function runDirectorySyncNow(): Promise<ConfigResult> {
  await requireAdmin();
  const result = await syncDirectory();

  if (result.skipped) {
    return {
      ok: false,
      message:
        "Nothing was synced. This needs a service account, and the directory must return at least one person.",
    };
  }
  return {
    ok: true,
    message: `Synced ${result.updated} of ${result.seen} people. ${result.deactivated} deactivated.`,
  };
}

// --- Email ----------------------------------------------------------------

async function emailSettingsFrom(form: FormData): Promise<Partial<Settings>> {
  const current = await getSettings();
  const typedPassword = String(form.get("smtpPassword") ?? "");

  return {
    smtpHost: text(form, "smtpHost") || null,
    smtpPort: int(form, "smtpPort", 587),
    smtpSecure: flag(form, "smtpSecure"),
    smtpUser: text(form, "smtpUser") || null,
    smtpPasswordEnc: typedPassword ? encryptSecret(typedPassword) : current.smtpPasswordEnc,
    smtpFrom: text(form, "smtpFrom") || "TimeKeeper <timekeeper@example.com>",
    appUrl: text(form, "appUrl") || null,
  };
}

export async function updateEmailSettings(form: FormData): Promise<void> {
  await requireAdmin();
  await prisma.settings.update({ where: { id: 1 }, data: await emailSettingsFrom(form) });
  revalidatePath("/admin/email");
}

export async function sendTestEmail(form: FormData): Promise<ConfigResult> {
  const admin = await requireAdmin();
  const candidate = { ...(await getSettings()), ...(await emailSettingsFrom(form)) } as Settings;
  const config = smtpConfigFrom(candidate);

  if (!config) {
    return {
      ok: false,
      message: "No SMTP host is set, so mail is written to the application log instead of sent.",
    };
  }

  const to = text(form, "testRecipient") || admin.email;

  try {
    await transportFor(config).sendMail({
      from: config.from,
      to,
      subject: "TimeKeeper test message",
      text: "This is a test from TimeKeeper. If you are reading it, email is working.",
    });
    return { ok: true, message: `Sent to ${to}. Check that it arrives, including the junk folder.` };
  } catch (error) {
    return {
      ok: false,
      message: `The mail server rejected it: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

// --- Local administrator passwords ---------------------------------------

export async function setLocalPassword(form: FormData): Promise<ConfigResult> {
  const admin = await requireAdmin();
  const userId = text(form, "userId") || admin.id;
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (password !== confirm) return { ok: false, message: "Those passwords do not match." };

  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { ok: false, message: strength.message ?? "Choose a stronger password." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "That account no longer exists." };

  if (!mayHoldLocalPassword(target.role)) {
    return {
      ok: false,
      message:
        "Local passwords are for administrators only. Give them an admin role first, or leave them to sign in with the directory.",
    };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: hashPassword(password),
      passwordSetAt: new Date(),
      failedSignIns: 0,
      lockedUntil: null,
    },
  });

  revalidatePath("/admin/authentication");
  return { ok: true, message: `Local password set for ${target.name ?? target.upn}.` };
}

/**
 * Refuses to remove the last local password while the directory is not
 * configured, which would lock everybody out of a system nobody can sign in to.
 */
export async function removeLocalPassword(form: FormData): Promise<ConfigResult> {
  const admin = await requireAdmin();
  const userId = text(form, "userId");
  if (!userId) return { ok: false, message: "No account given." };

  const settings = await getSettings();
  const remaining = await prisma.user.count({
    where: { passwordHash: { not: null }, id: { not: userId }, isActive: true },
  });

  if (remaining === 0 && !settings.ldapEnabled) {
    return {
      ok: false,
      message:
        "This is the only local password and directory sign-in is off. Removing it would lock everyone out. Configure the directory first.",
    };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "That account no longer exists." };
  if (!isAdmin(admin)) return { ok: false, message: "Only an administrator can do that." };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: null, passwordSetAt: null, failedSignIns: 0, lockedUntil: null },
  });

  revalidatePath("/admin/authentication");
  return { ok: true, message: `Local password removed for ${target.name ?? target.upn}.` };
}

export async function unlockAccount(form: FormData): Promise<ConfigResult> {
  await requireAdmin();
  const userId = text(form, "userId");
  if (!userId) return { ok: false, message: "No account given." };

  await prisma.user.update({
    where: { id: userId },
    data: { failedSignIns: 0, lockedUntil: null },
  });

  revalidatePath("/admin/authentication");
  return { ok: true, message: "Account unlocked." };
}
