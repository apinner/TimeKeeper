import nodemailer, { type Transporter } from "nodemailer";
import { decryptSecret } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import type { Settings } from "@prisma/client";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
}

/** Mail settings live in the database, edited in Admin → Email. */
export function smtpConfigFrom(settings: Settings): SmtpConfig | null {
  const host = settings.smtpHost?.trim();
  if (!host) return null;

  return {
    host,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    user: settings.smtpUser?.trim() || null,
    password: decryptSecret(settings.smtpPasswordEnc),
    from: settings.smtpFrom,
  };
}

export function transportFor(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
  });
}

/**
 * Sending must never break the workflow it reports on: an SMTP outage should
 * not stop a manager approving leave. Failures are logged and swallowed, and
 * with no host configured mail goes to the log instead, which is what
 * development and a first deployment want.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const settings = await getSettings();
  const config = smtpConfigFrom(settings);

  if (!config) {
    console.info(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }

  try {
    await transportFor(config).sendMail({
      from: config.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
  } catch (error) {
    console.error(`[mail] failed to send "${mail.subject}" to ${mail.to}`, error);
  }
}

export async function sendAll(mails: Mail[]): Promise<void> {
  await Promise.all(mails.map(sendMail));
}

/**
 * Base URL for links in email. Set in Admin → Email; falls back to AUTH_URL,
 * which the application needs anyway.
 */
export async function appUrl(path = ""): Promise<string> {
  const settings = await getSettings();
  const base = (settings.appUrl?.trim() || process.env.AUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}
