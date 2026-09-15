import Image from "next/image";
import { redirect } from "next/navigation";
import { createFirstAdministrator } from "@/lib/actions/setup";
import { needsInitialSetup } from "@/lib/auth/local";
import { getSettings } from "@/lib/settings";

/**
 * Offered only while nobody can sign in at all — no local administrator exists
 * and directory sign-in is not configured. It disappears the moment the first
 * administrator is created, so the window in which it is reachable is the
 * window in which the system is unusable anyway.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await needsInitialSetup())) redirect("/signin");

  const { error } = await searchParams;
  const settings = await getSettings();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="card">
          <div className="card-body">
            <div className="text-center mb-6">
              <Image
                src={settings.logoPath}
                alt={settings.companyName}
                width={200}
                height={40}
                priority
                className="mx-auto mb-5"
                style={{ height: "auto", width: "170px" }}
              />
              <h1 className="page-title text-xl">Set up TimeKeeper</h1>
              <p className="page-subtitle">
                Create the administrator account. You will use it to connect Active Directory, after
                which everyone else signs in with their Windows password.
              </p>
            </div>

            {error ? <div className="notice notice-error text-left mb-4">{error}</div> : null}

            <form action={createFirstAdministrator} className="space-y-3 text-left">
              <div>
                <label className="label" htmlFor="name">
                  Your name
                </label>
                <input id="name" name="name" className="input" required placeholder="Alex Pinner" />
              </div>

              <div>
                <label className="label" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  className="input"
                  required
                  autoCapitalize="none"
                  placeholder="alex.pinner@yourcompany.co.uk"
                />
                <p className="hint">
                  Use the same username Active Directory knows you by. Your directory account will
                  then attach to this one rather than creating a second.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="input"
                  required
                  autoComplete="new-password"
                />
                <p className="hint">
                  At least 12 characters. This is stored by TimeKeeper, separately from your Windows
                  password, and exists so you can get in when the directory cannot be reached.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="confirm">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  className="input"
                  required
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="btn btn-primary w-full">
                Create administrator
              </button>
            </form>
          </div>
        </div>

        <p className="hint mt-4 text-center">
          This page is only available until the first administrator exists.
        </p>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
