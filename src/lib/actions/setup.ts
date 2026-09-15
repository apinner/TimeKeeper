"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { checkPasswordStrength, hashPassword } from "@/lib/crypto";
import { needsInitialSetup } from "@/lib/auth/local";
import { ensureUserSetUp } from "@/lib/provisioning";

/**
 * Creates the first administrator. Re-checks that setup is still needed inside
 * the action, so the page being cached or a second tab being left open cannot
 * be used to create another one.
 */
export async function createFirstAdministrator(form: FormData): Promise<void> {
  if (!(await needsInitialSetup())) redirect("/signin");

  const name = String(form.get("name") ?? "").trim();
  const username = String(form.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const fail = (message: string) => redirect(`/setup?error=${encodeURIComponent(message)}`);

  if (!name || !username) fail("Enter your name and username.");
  if (password !== confirm) fail("Those passwords do not match.");

  const strength = checkPasswordStrength(password);
  if (!strength.ok) fail(strength.message ?? "Choose a stronger password.");

  const existing = await prisma.user.findUnique({ where: { upn: username } });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: "SYSADMIN",
          isActive: true,
          passwordHash: hashPassword(password),
          passwordSetAt: new Date(),
          failedSignIns: 0,
          lockedUntil: null,
        },
      })
    : await prisma.user.create({
        data: {
          upn: username,
          email: username.includes("@") ? username : `${username}@localhost`,
          name,
          role: "SYSADMIN",
          passwordHash: hashPassword(password),
          passwordSetAt: new Date(),
        },
      });

  await ensureUserSetUp(user.id);

  console.info(`[setup] first administrator created: ${username}`);
  redirect("/signin?setup=complete");
}
