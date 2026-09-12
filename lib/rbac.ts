import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Actor } from "@/lib/audit";

export type Role = "ADMIN" | "STAFF";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? session.user.email ?? "staff",
    role: session.user.role ?? "STAFF",
  };
}

/** Server components / actions: require any signed-in staff user. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Require an administrator (configuration, exports, weights, private notes). */
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/admin?denied=1");
  return u;
}

export function actorOf(u: CurrentUser): Actor {
  return { type: "USER", id: u.id, label: `${u.name} (${u.role.toLowerCase()})` };
}

export const can = {
  configureWeights: (u: CurrentUser) => u.role === "ADMIN",
  approveMusicians: (u: CurrentUser) => u.role === "ADMIN",
  export: (u: CurrentUser) => u.role === "ADMIN",
  viewPrivateNotes: (u: CurrentUser) => u.role === "ADMIN",
  viewContactDetails: () => true,
  workPipeline: () => true,
};
