import NextAuth, { CredentialsSignin, type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateLocally, noteFailedAttempt } from "@/lib/auth/local";
import { normaliseUpn } from "@/lib/ldap/attributes";
import { getLdapConfig } from "@/lib/ldap/config";
import { authenticate, type AuthFailure } from "@/lib/ldap/directory";
import { upsertFromDirectory } from "@/lib/ldap/provisioning";
import { getSettings } from "@/lib/settings";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

type FailureCode = AuthFailure | "locked" | "no-method";

/**
 * Carries why sign-in failed through to the page, so people are told whether
 * their password was wrong, their account is locked, or the directory is
 * unreachable — rather than one unhelpful message covering all three.
 */
class SignInRejected extends CredentialsSignin {
  constructor(public readonly code: FailureCode) {
    super(code);
  }
}

/**
 * Session length is configurable in Admin → Company settings, so the config is
 * built per request. A database that cannot be read falls back to 12 hours
 * rather than failing sign-in outright.
 */
async function sessionHours(): Promise<number> {
  try {
    return (await getSettings()).sessionHours;
  } catch {
    return 12;
  }
}

const config = (hours: number): NextAuthConfig => ({
  // Credentials sign-in requires JWT sessions. Deactivating someone still locks
  // them out immediately, because every request re-reads their row and checks
  // isActive — see requireUser in src/lib/session.ts.
  session: { strategy: "jwt", maxAge: hours * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  providers: [
    Credentials({
      name: "TimeKeeper",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const typed = typeof credentials?.username === "string" ? credentials.username : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!typed.trim() || !password) throw new SignInRejected("no-credentials");

        const config = await getLdapConfig();
        const upn = normaliseUpn(typed, config?.upnSuffix ?? null);

        // Administrators may hold a local password so the system can be
        // configured and repaired when the directory is unavailable. Both the
        // typed name and its suffixed form are tried, since a local account may
        // predate any directory settings.
        let lockedOut = false;

        for (const candidate of new Set([upn, typed.trim().toLowerCase()])) {
          const local = await authenticateLocally(candidate, password);

          if (local.ok) return { id: local.user.id, name: local.user.name, email: local.user.email };

          // A lock applies to the local password only. Directory sign-in has
          // its own lockout policy in Active Directory, and letting this one
          // block it would let anyone who knows an administrator's username
          // lock them out of TimeKeeper by guessing five times.
          if (local.reason === "locked") lockedOut = true;

          // A local password that did not match still falls through to the
          // directory: an administrator may use their AD password day to day.
          if (local.reason === "invalid-credentials") await noteFailedAttempt(candidate);
        }

        if (!config) throw new SignInRejected(lockedOut ? "locked" : "invalid-credentials");

        const result = await authenticate(upn, password, config);
        if (!result.ok) {
          // When the local password is locked and the directory rejected them
          // too, the lock is the more useful thing to say.
          throw new SignInRejected(lockedOut ? "locked" : result.reason);
        }

        const user = await upsertFromDirectory(result.profile);
        if (!user.isActive) throw new SignInRejected("disabled");

        return { id: user.id, name: user.name ?? user.upn, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  trustHost: true,
});

export const { handlers, auth, signIn, signOut } = NextAuth(async () => config(await sessionHours()));
