import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/db";
import { bootstrapRoleFor, ensureUserSetUp } from "@/lib/provisioning";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      upn: string;
      isActive: boolean;
    } & DefaultSession["user"];
  }
}

const TENANT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? "common";

/** Claims from the Entra ID token. Graph is deliberately not called. */
interface EntraProfile {
  oid?: string;
  sub?: string;
  tid?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
}

interface ProvisionedProfile {
  id: string;
  name: string | null;
  email: string;
  image: null;
  upn: string;
  entraObjectId: string | null;
}

/**
 * The Prisma adapter's own createUser writes only the Auth.js fields, but our
 * User table also carries the UPN and Entra object id that identity is keyed
 * on. Wrapping it keeps just-in-time provisioning to a single write.
 */
function timekeeperAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createUser: async (data) => {
      const profile = data as unknown as ProvisionedProfile;
      const upn = profile.upn ?? profile.email;
      const user = await prisma.user.create({
        data: {
          upn,
          email: profile.email,
          name: profile.name,
          entraObjectId: profile.entraObjectId,
          emailVerified: new Date(),
          role: bootstrapRoleFor(upn) ?? "EMPLOYEE",
        },
      });
      return user as unknown as AdapterUser;
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: timekeeperAdapter(),
  session: { strategy: "database", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      // No Graph scopes: provisioning reads the token only, so the app needs no
      // application permissions and no admin consent beyond sign-in.
      authorization: { params: { scope: "openid profile email" } },
      profile(profile: EntraProfile): ProvisionedProfile {
        const upn = profile.preferred_username ?? profile.upn ?? profile.email ?? "";
        return {
          id: profile.oid ?? profile.sub ?? upn,
          name: profile.name ?? null,
          email: profile.email ?? upn,
          image: null,
          upn,
          entraObjectId: profile.oid ?? null,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Two gates before anyone gets in: the token must come from our own tenant,
     * and the person must not have been deactivated here.
     */
    async signIn({ profile, user }) {
      const claims = profile as EntraProfile | undefined;
      if (TENANT_ID !== "common" && claims?.tid && claims.tid !== TENANT_ID) return false;

      const upn = claims?.preferred_username ?? claims?.upn ?? user?.email ?? undefined;
      if (!upn) return false;

      const existing = await prisma.user.findUnique({ where: { upn } });
      if (existing && !existing.isActive) return false;

      return true;
    },
    async session({ session, user }) {
      const record = user as unknown as {
        id: string;
        role: Role;
        upn: string;
        isActive: boolean;
      };
      session.user.id = record.id;
      session.user.role = record.role;
      session.user.upn = record.upn;
      session.user.isActive = record.isActive;
      return session;
    },
  },
  events: {
    // New starters get a working pattern and a pro-rated entitlement on their
    // first sign-in, so the system is usable before HR touches anything.
    async createUser({ user }) {
      if (user.id) await ensureUserSetUp(user.id);
    },
  },
  trustHost: true,
});
