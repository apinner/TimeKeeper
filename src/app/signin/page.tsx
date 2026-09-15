import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { ldapConfig } from "@/lib/ldap/config";

/**
 * People get told what actually went wrong. "Your password was rejected" and
 * "the directory is unreachable" call for completely different actions, and
 * collapsing them into one message wastes everybody's morning.
 */
const MESSAGES: Record<string, string> = {
  "no-credentials": "Enter your username and password.",
  "invalid-credentials": "That username or password was not accepted. Note that this is your Windows password.",
  "not-found": "That account was not found in the directory. Check the username, or contact IT.",
  disabled: "That account is disabled. Contact IT if you think this is wrong.",
  "not-permitted": "Your account does not have access to TimeKeeper. Ask IT to add you to the access group.",
  unavailable: "TimeKeeper cannot reach the directory at the moment, so nobody can sign in. This is not a problem with your password — please try again shortly, and tell IT if it persists.",
  CredentialsSignin: "That username or password was not accepted.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { code, error, callbackUrl } = await searchParams;
  const settings = await getSettings();
  const configured = ldapConfig() !== null;

  const key = code ?? error;
  const message = key ? (MESSAGES[key] ?? MESSAGES.CredentialsSignin) : null;

  async function attemptSignIn(formData: FormData) {
    "use server";
    const target = (formData.get("callbackUrl") as string) || "/";
    try {
      await signIn("credentials", {
        username: String(formData.get("username") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: target,
      });
    } catch (thrown) {
      // next/navigation signals a successful redirect by throwing, so that one
      // has to be let through.
      if (thrown instanceof AuthError) {
        const reason =
          (thrown as AuthError & { code?: string }).code ?? thrown.type ?? "CredentialsSignin";
        redirect(`/signin?code=${encodeURIComponent(reason)}`);
      }
      throw thrown;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
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
              <h1 className="page-title text-xl">TimeKeeper</h1>
              <p className="page-subtitle">Timesheets and holiday requests</p>
            </div>

            {!configured ? (
              <div className="notice notice-error text-left">
                TimeKeeper is not configured to reach your directory. An administrator needs to set
                LDAP_URL and LDAP_BASE_DN — see docs/SETUP.md.
              </div>
            ) : (
              <>
                {message ? (
                  <div className="notice notice-error text-left mb-4">{message}</div>
                ) : null}

                <form action={attemptSignIn} className="space-y-3 text-left">
                  <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />

                  <div>
                    <label className="label" htmlFor="username">
                      Username
                    </label>
                    <input
                      id="username"
                      name="username"
                      className="input"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoFocus
                      required
                      placeholder="firstname.lastname"
                    />
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
                      autoComplete="current-password"
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary w-full">
                    Sign in
                  </button>
                </form>

                <p className="hint mt-4 text-center">
                  Use your normal Windows username and password.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
