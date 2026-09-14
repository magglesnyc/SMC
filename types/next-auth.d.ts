import type { DefaultSession } from "next-auth";

export type AppRole = "ADMIN" | "STAFF" | "MUSICIAN" | "FACILITY";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      musicianId?: string | null;
      facilityId?: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role?: AppRole;
    musicianId?: string | null;
    facilityId?: string | null;
  }
}
