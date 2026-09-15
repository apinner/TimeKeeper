import { ActionButton } from "@/components/action-button";
import { AppShell } from "@/components/app-shell";
import { LocalPasswordForm } from "@/components/local-password-form";
import {
  runDirectorySyncNow,
  testDirectoryConnection,
  updateDirectorySettings,
} from "@/lib/actions/configuration";
import { prisma } from "@/lib/db";
import { formatDate, toPlainDate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/session";

export default async function AuthenticationPage() {
  const admin = await requireAdmin();
  const settings = await getSettings();

  const administrators = await prisma.user.findMany({
    where: { role: { in: ["HR_ADMIN", "SYSADMIN"] } },
    select: {
      id: true,
      name: true,
      upn: true,
      role: true,
      isActive: true,
      passwordHash: true,
      passwordSetAt: true,
      lockedUntil: true,
    },
    orderBy: { name: "asc" },
  });

  const hasServiceAccount = Boolean(settings.ldapBindDn && settings.ldapBindPasswordEnc);

  return (
    <AppShell user={admin} current="/admin">
      <div className="mb-5">
        <h1 className="page-title">Authentication</h1>
        <p className="page-subtitle">
          How people sign in. Staff come from Active Directory; administrators can also hold a local
          password so the system can be configured and repaired when the directory is unreachable.
        </p>
      </div>

      <form action={updateDirectorySettings} className="space-y-4">
        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Active Directory</h2>
            <span className={`pill ${settings.ldapEnabled ? "pill-approved" : "pill-neutral"}`}>
              {settings.ldapEnabled ? "Enabled" : "Not enabled"}
            </span>
          </div>

          <div className="card-body space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ldapEnabled" defaultChecked={settings.ldapEnabled} />
              Allow staff to sign in with their directory account
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ldapUrl">
                  Server URL
                </label>
                <input
                  id="ldapUrl"
                  name="ldapUrl"
                  className="input"
                  defaultValue={settings.ldapUrl ?? ""}
                  placeholder="ldap://dc01.example.local:389"
                />
                <p className="hint">
                  On ldap:// port 389 passwords cross the network in clear text. Use ldaps:// on 636,
                  or tick StartTLS below, to encrypt them.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="ldapBaseDn">
                  Base DN
                </label>
                <input
                  id="ldapBaseDn"
                  name="ldapBaseDn"
                  className="input"
                  defaultValue={settings.ldapBaseDn ?? ""}
                  placeholder="DC=example,DC=local"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ldapUpnSuffix">
                  Username suffix
                </label>
                <input
                  id="ldapUpnSuffix"
                  name="ldapUpnSuffix"
                  className="input"
                  defaultValue={settings.ldapUpnSuffix ?? ""}
                  placeholder="@example.co.uk"
                />
                <p className="hint">Lets people type just their username.</p>
              </div>
              <div>
                <label className="label" htmlFor="ldapAccessGroupDn">
                  Access group DN
                </label>
                <input
                  id="ldapAccessGroupDn"
                  name="ldapAccessGroupDn"
                  className="input"
                  defaultValue={settings.ldapAccessGroupDn ?? ""}
                  placeholder="CN=TimeKeeper-Users,OU=Groups,DC=example,DC=local"
                />
                <p className="hint">Leave empty to allow anyone in the directory.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ldapBindDn">
                  Service account DN
                </label>
                <input
                  id="ldapBindDn"
                  name="ldapBindDn"
                  className="input"
                  defaultValue={settings.ldapBindDn ?? ""}
                  placeholder="CN=svc-timekeeper,OU=Service Accounts,DC=example,DC=local"
                />
                <p className="hint">
                  Read-only. Needed for the nightly sync and to resolve a manager who has not signed
                  in yet — not for sign-in itself.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="ldapBindPassword">
                  Service account password
                </label>
                <input
                  id="ldapBindPassword"
                  name="ldapBindPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  placeholder={settings.ldapBindPasswordEnc ? "•••••••• (unchanged)" : ""}
                />
                <p className="hint">
                  {settings.ldapBindPasswordEnc
                    ? "Stored encrypted. Leave blank to keep the current one."
                    : "Stored encrypted, and never shown again."}
                </p>
              </div>
            </div>

            <details>
              <summary className="text-sm font-semibold cursor-pointer text-[var(--color-graphite-900)]">
                Advanced
              </summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="ldapStartTls"
                      defaultChecked={settings.ldapStartTls}
                    />
                    Use StartTLS
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="ldapTlsRejectUnauthorized"
                      defaultChecked={settings.ldapTlsRejectUnauthorized}
                    />
                    Verify the server certificate
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="ldapNestedGroups"
                      defaultChecked={settings.ldapNestedGroups}
                    />
                    Follow nested groups
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor="ldapBindMode">
                      Bind as
                    </label>
                    <select
                      id="ldapBindMode"
                      name="ldapBindMode"
                      className="select"
                      defaultValue={settings.ldapBindMode}
                    >
                      <option value="upn">Username (Active Directory)</option>
                      <option value="search">Look up, then bind by DN</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="ldapPersonFilter">
                      Person filter
                    </label>
                    <input
                      id="ldapPersonFilter"
                      name="ldapPersonFilter"
                      className="input"
                      defaultValue={settings.ldapPersonFilter}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="ldapTimeoutMs">
                      Timeout (ms)
                    </label>
                    <input
                      id="ldapTimeoutMs"
                      name="ldapTimeoutMs"
                      type="number"
                      min="1000"
                      className="input"
                      defaultValue={settings.ldapTimeoutMs}
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="font-semibold">Test the connection</h2>
            <span className="text-sm text-[var(--color-muted)]">
              Uses what is on screen, not what is saved
            </span>
          </div>
          <div className="card-body space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="testUsername">
                  Test username
                </label>
                <input
                  id="testUsername"
                  name="testUsername"
                  className="input"
                  autoCapitalize="none"
                  placeholder="alex.pinner"
                />
              </div>
              <div>
                <label className="label" htmlFor="testPassword">
                  Test password
                </label>
                <input
                  id="testPassword"
                  name="testPassword"
                  type="password"
                  className="input"
                  autoComplete="off"
                />
              </div>
            </div>
            <p className="hint">
              With a username and password it proves a real sign-in, including group membership.
              Left blank, it binds with the service account instead and counts who it can see.
            </p>
            <ActionButton action={testDirectoryConnection} label="Test connection" busyLabel="Testing…" />
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary">
            Save directory settings
          </button>
        </div>
      </form>

      <section className="card mt-4">
        <div className="card-header">
          <h2 className="font-semibold">Directory sync</h2>
          <span className="text-sm text-[var(--color-muted)]">
            Runs nightly at {String(settings.directorySyncHour).padStart(2, "0")}:00
          </span>
        </div>
        <div className="card-body space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            Creates accounts for everyone in the access group, refreshes their details, fills in line
            managers from the directory, and deactivates anyone who has left it.
          </p>
          {!hasServiceAccount ? (
            <div className="notice notice-warning">
              No service account is configured, so the sync cannot run. Sign-in still works.
            </div>
          ) : null}
          <form>
            <ActionButton action={runDirectorySyncNow} label="Sync now" busyLabel="Syncing…" />
          </form>
        </div>
      </section>

      <section className="card mt-4">
        <div className="card-header">
          <h2 className="font-semibold">Administrator passwords</h2>
        </div>
        <div className="card-body space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            A local password lets an administrator sign in when the directory is unavailable. After
            five failed attempts an account locks for fifteen minutes and then unlocks itself.
          </p>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Local password</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {administrators.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <div className="font-medium">{person.name ?? person.upn}</div>
                      <div className="text-xs text-[var(--color-muted)]">{person.upn}</div>
                    </td>
                    <td>
                      {person.passwordHash ? (
                        <span className="pill pill-approved">
                          Set {person.passwordSetAt ? formatDate(toPlainDate(person.passwordSetAt)) : ""}
                        </span>
                      ) : (
                        <span className="pill pill-neutral">Directory only</span>
                      )}
                    </td>
                    <td>
                      {person.lockedUntil && person.lockedUntil > new Date() ? (
                        <span className="pill pill-rejected">Locked</span>
                      ) : person.isActive ? (
                        <span className="text-sm text-[var(--color-muted)]">Active</span>
                      ) : (
                        <span className="pill pill-neutral">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <LocalPasswordForm
            administrators={administrators.map((person) => ({
              id: person.id,
              label: `${person.name ?? person.upn} (${person.upn})`,
              hasPassword: Boolean(person.passwordHash),
              isLocked: Boolean(person.lockedUntil && person.lockedUntil > new Date()),
            }))}
            currentUserId={admin.id}
          />
        </div>
      </section>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
