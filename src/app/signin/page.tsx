import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

const ERRORS: Record<string, string> = {
  AccessDenied:
    "Your account cannot sign in to TimeKeeper. This happens if you have not been assigned to the application in Microsoft 365, or if your TimeKeeper account has been deactivated. Contact your administrator.",
  Configuration:
    "TimeKeeper is not configured correctly for single sign-on. An administrator should check the Entra ID settings.",
  Verification: "That sign-in link is no longer valid. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { error, callbackUrl } = await searchParams;
  const settings = await getSettings();
  const message = error ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="card">
          <div className="card-body text-center">
            <Image
              src={settings.logoPath}
              alt={settings.companyName}
              width={200}
              height={40}
              priority
              className="mx-auto mb-6"
              style={{ height: "auto", width: "170px" }}
            />
            <h1 className="page-title text-xl">TimeKeeper</h1>
            <p className="page-subtitle mb-6">Timesheets and holiday requests</p>

            {message ? (
              <div className="notice notice-error text-left mb-4">{message}</div>
            ) : null}

            <form
              action={async () => {
                "use server";
                await signIn("microsoft-entra-id", { redirectTo: callbackUrl ?? "/" });
              }}
            >
              <button type="submit" className="btn btn-primary w-full">
                Sign in with Microsoft 365
              </button>
            </form>

            <p className="hint mt-4">
              Use your work account. Access is managed in Microsoft 365.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
