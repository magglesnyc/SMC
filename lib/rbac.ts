import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { landingFor, type AppRole } from "@/auth.config";
import type { Actor } from "@/lib/audit";

export type Role = AppRole;

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  musicianId: string | null;
  facilityId: string | null;
}

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? session.user.email ?? "user",
    role: session.user.role ?? "STAFF",
    musicianId: session.user.musicianId ?? null,
    facilityId: session.user.facilityId ?? null,
  };
}

export const isStaff = (u: CurrentUser) => u.role === "ADMIN" || u.role === "STAFF";

/** Server components / actions: require any signed-in staff user (console access). */
export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!isStaff(u)) redirect(landingFor(u.role));
  return u;
}

/** Require an administrator (configuration, exports, weights, private notes). */
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/admin?denied=1");
  return u;
}

/** Portal: require a login bound to a musician record. Returns the musician id. */
export async function requireMusicianUser(): Promise<CurrentUser & { musicianId: string }> {
  const u = await currentUser();
  if (!u) redirect("/login?callbackUrl=%2Fportal%2Fmusician");
  if (u.role !== "MUSICIAN" || !u.musicianId) redirect(landingFor(u.role));
  return { ...u, musicianId: u.musicianId };
}

/** Portal: require a login bound to a facility (community) record. Returns the facility id. */
export async function requireFacilityUser(): Promise<CurrentUser & { facilityId: string }> {
  const u = await currentUser();
  if (!u) redirect("/login?callbackUrl=%2Fportal%2Ffacility");
  if (u.role !== "FACILITY" || !u.facilityId) redirect(landingFor(u.role));
  return { ...u, facilityId: u.facilityId };
}

export function actorOf(u: CurrentUser): Actor {
  if (u.role === "MUSICIAN") return { type: "MUSICIAN", id: u.musicianId ?? u.id, label: `${u.name} (musician portal)` };
  if (u.role === "FACILITY") return { type: "FACILITY", id: u.facilityId ?? u.id, label: `${u.name} (community portal)` };
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
