import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: useSecureCookies ? {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
    },
  } : undefined,
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;

      // ── Find the owner (first user ever created) ──────────────────────────
      const owner = await prisma.user.findFirst({ orderBy: { id: "asc" } });

      if (!owner) {
        // No users yet → first login, PrismaAdapter creates the user automatically.
        return true;
      }

      // ── Check if this Google account is already linked ────────────────────
      const existing = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
        },
      });

      if (existing) {
        // Refresh tokens
        await prisma.account.update({
          where: { id: existing.id },
          data: {
            access_token:  account.access_token,
            refresh_token: account.refresh_token ?? existing.refresh_token,
            expires_at:    account.expires_at,
            id_token:      account.id_token,
            scope:         account.scope ?? existing.scope,
          },
        });
      } else {
        // New Google account → link to owner as additional GSC account
        await prisma.account.create({
          data: {
            userId:            owner.id,
            type:              account.type,
            provider:          account.provider,
            providerAccountId: account.providerAccountId,
            refresh_token:     account.refresh_token,
            access_token:      account.access_token,
            expires_at:        account.expires_at,
            token_type:        account.token_type,
            scope:             account.scope,
            id_token:          account.id_token,
          },
        });
      }

      // ── Shared-workspace model ────────────────────────────────────────────
      // Data is always scoped to the OWNER, so every member sees the same aggregated
      // dashboard across all connected Google accounts. But each member keeps their
      // OWN identity (email / name / avatar) for display — carried by the jwt/session
      // callbacks below. So signing in with cruegeraxesam@gmail.com shows you as
      // cruegeraxesam while still using the shared panel.
      user.id = owner.id;
      if (user.email === owner.email) return true; // owner signs in as the owner

      // Non-owner member: an already-linked account can return true (NextAuth then
      // uses the callbackUrl, e.g. the dashboard). A brand-new account returns a
      // redirect URL to short-circuit NextAuth's user-creation, which would otherwise
      // crash on the account we just linked to the owner.
      return existing ? true : "/";
    },

    async session({ session, token }) {
      if (session?.user) {
        // owner id → data scope (shared workspace)
        if (token?.sub) session.user.id = token.sub;
        // real logged-in identity → what the UI shows
        if (token?.email) session.user.email = token.email as string;
        if (token?.name) session.user.name = token.name as string;
        if (token?.picture) session.user.image = token.picture as string;
      }
      return session;
    },

    async jwt({ token, user, profile }) {
      if (user) token.sub = user.id; // owner.id — keeps the shared data scope
      // On sign-in the raw Google profile is present — capture the member's real
      // identity so the session displays whoever actually logged in.
      if (profile) {
        const p = profile as { email?: string; name?: string; picture?: string };
        if (p.email) token.email = p.email;
        if (p.name) token.name = p.name;
        if (p.picture) token.picture = p.picture;
      }
      return token;
    },
  },
};
