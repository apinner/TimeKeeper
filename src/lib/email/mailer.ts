import nodemailer, { type Transporter } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
      : undefined,
  });
  return transporter;
}

/**
 * Sending must never break the workflow it reports on: an SMTP outage should
 * not stop a manager approving leave. Failures are logged and swallowed, and
 * with no SMTP_HOST configured mail goes to the log instead, which is what
 * development and a first deployment want.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const transport = getTransporter();
  const from = process.env.SMTP_FROM ?? "TimeKeeper <timekeeper@example.com>";

  if (!transport) {
    console.info(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }

  try {
    await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
  } catch (error) {
    console.error(`[mail] failed to send "${mail.subject}" to ${mail.to}`, error);
  }
}

export async function sendAll(mails: Mail[]): Promise<void> {
  await Promise.all(mails.map(sendMail));
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}
