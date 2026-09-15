import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticate, type AuthFailure } from "@/lib/ldap/directory";
import { upsertFromDirectory } from "@/lib/ldap/provisioning";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/**
 * Carries why sign-in failed through to the page, so people are told whether
 * their password was wrong, their account is disabled, or the directory is
 * unreachable — rather than one unhelpful message covering all three.
 */
class DirectorySignInError extends CredentialsSignin {
  constructor(public readonly code: AuthFailure) {
    super(code);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials sign-in requires JWT sessions. Deactivating someone still locks
  // them out immediately, because every request re-reads their row and checks
  // isActive — see requireUser in src/lib/session.ts.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  providers: [
    Credentials({
      name: "Active Directory",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = typeof credentials?.username === "string" ? credentials.username : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        const result = await authenticate(username, password);
        if (!result.ok) throw new DirectorySignInError(result.reason);

        const user = await upsertFromDirectory(result.profile);
        if (!user.isActive) throw new DirectorySignInError("disabled");

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
