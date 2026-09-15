import { ActionButton } from "@/components/action-button";
import { AppShell } from "@/components/app-shell";
import { sendTestEmail, updateEmailSettings } from "@/lib/actions/configuration";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/session";

export default async function EmailPage() {
  const admin = await requireAdmin();
  const settings = await getSettings();

  return (
    <AppShell user={admin} current="/admin">
      <div className="mb-5">
        <h1 className="page-title">Email</h1>
        <p className="page-subtitle">
          Used for approval requests, decisions and reminders. With no host set, messages are written
          to the application log instead of being sent — which is a safe way to see what would go
          out.
        </p>
      </div>

      <form action={updateEmailSettings} className="space-y-4">
        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Mail relay</h2>
            <span className={`pill ${settings.smtpHost ? "pill-approved" : "pill-neutral"}`}>
              {settings.smtpHost ? "Configured" : "Logging only"}
            </span>
          </div>

          <div className="card-body space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="smtpHost">
                  Host
                </label>
                <input
                  id="smtpHost"
                  name="smtpHost"
                  className="input"
                  defaultValue={settings.smtpHost ?? ""}
                  placeholder="smtp.office365.com"
                />
              </div>
              <div>
                <label className="label" htmlFor="smtpPort">
                  Port
                </label>
                <input
                  id="smtpPort"
                  name="smtpPort"
                  type="number"
                  className="input"
                  defaultValue={settings.smtpPort}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="smtpUser">
                  Username
                </label>
                <input
                  id="smtpUser"
                  name="smtpUser"
                  className="input"
                  defaultValue={settings.smtpUser ?? ""}
                  placeholder="Leave empty if the relay does not need one"
                />
              </div>
              <div>
                <label className="label" htmlFor="smtpPassword">
                  Password
                </label>
                <input
                  id="smtpPassword"
                  name="smtpPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  placeholder={settings.smtpPasswordEnc ? "•••••••• (unchanged)" : ""}
                />
                <p className="hint">
                  {settings.smtpPasswordEnc
                    ? "Stored encrypted. Leave blank to keep the current one."
                    : "Stored encrypted, and never shown again."}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="smtpSecure" defaultChecked={settings.smtpSecure} />
              Connect with TLS directly (port 465). Leave unticked for STARTTLS on 587.
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="smtpFrom">
                  From address
                </label>
                <input
                  id="smtpFrom"
                  name="smtpFrom"
                  className="input"
                  defaultValue={settings.smtpFrom}
                  placeholder="TimeKeeper <timekeeper@example.com>"
                />
              </div>
              <div>
                <label className="label" htmlFor="appUrl">
                  Link address
                </label>
                <input
                  id="appUrl"
                  name="appUrl"
                  className="input"
                  defaultValue={settings.appUrl ?? ""}
                  placeholder="https://timekeeper.example.com"
                />
                <p className="hint">
                  Used for links in email. Defaults to the address the app is configured with.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Send a test</h2>
            <span className="text-sm text-[var(--color-muted)]">
              Uses what is on screen, not what is saved
            </span>
          </div>
          <div className="card-body space-y-3">
            <div>
              <label className="label" htmlFor="testRecipient">
                Send to
              </label>
              <input
                id="testRecipient"
                name="testRecipient"
                type="email"
                className="input"
                placeholder={admin.email}
              />
            </div>
            <ActionButton action={sendTestEmail} label="Send test message" busyLabel="Sending…" />
          </div>
        </section>

        <button type="submit" className="btn btn-primary">
          Save email settings
        </button>
      </form>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
