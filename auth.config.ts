import type { NextAuthConfig } from "next-auth";

/** Shared, dependency-free Auth.js config (no Prisma) so it can be used by the proxy. */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = (token.role as "ADMIN" | "STAFF") ?? "STAFF";
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
