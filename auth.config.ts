import type { NextAuthConfig } from "next-auth";

export type AppRole = "ADMIN" | "STAFF" | "MUSICIAN" | "FACILITY";

/** Where each role lands after sign-in. Staff use the console; musicians and communities use their portals. */
export function landingFor(role: AppRole | undefined): string {
  if (role === "MUSICIAN") return "/portal/musician";
  if (role === "FACILITY") return "/portal/facility";
  return "/admin";
}

/** Shared, dependency-free Auth.js config (no Prisma) so it can be used by the proxy. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { role?: string; musicianId?: string | null; facilityId?: string | null };
        token.role = u.role;
        token.uid = user.id;
        token.musicianId = u.musicianId ?? null;
        token.facilityId = u.facilityId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = (token.role as AppRole) ?? "STAFF";
        session.user.musicianId = (token.musicianId as string | null) ?? null;
        session.user.facilityId = (token.facilityId as string | null) ?? null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
