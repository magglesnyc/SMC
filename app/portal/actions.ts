"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { actorOf, requireFacilityUser, requireMusicianUser } from "@/lib/rbac";
import { recordManualResponse } from "@/lib/services/bookings";
import { setFacilityPreference } from "@/lib/services/facilities";
import { respondableBooking } from "@/lib/services/portal";

export type PortalActionResult = { ok: true; message?: string } | { ok: false; error: string } | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const asAction = (v: string) => (v === "ACCEPT" || v === "DECLINE" || v === "REQUEST_CHANGES" ? v : null);

export async function portalSignOut() {
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}

/** Community confirms, declines or asks to change an offer from its portal (same path staff use for phone responses). */
export async function facilityRespond(_prev: PortalActionResult, fd: FormData): Promise<PortalActionResult> {
  try {
    const u = await requireFacilityUser();
    const matchId = str(fd, "matchId");
    const action = asAction(str(fd, "action"));
    if (!action) return { ok: false, error: "Choose a response." };
    const b = await respondableBooking({ facilityId: u.facilityId }, matchId);
    if (!b) return { ok: false, error: "This offer is no longer open." };
    await recordManualResponse(matchId, "FACILITY", action, str(fd, "note") || "via community portal", actorOf(u));
    revalidatePath("/portal/facility");
    return { ok: true, message: action === "ACCEPT" ? "Confirmed. Thank you!" : action === "DECLINE" ? "Declined. Our team will look for another performer." : "Change request sent to our team." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Musician accepts, declines or asks to change an offer from their portal. */
export async function musicianRespond(_prev: PortalActionResult, fd: FormData): Promise<PortalActionResult> {
  try {
    const u = await requireMusicianUser();
    const matchId = str(fd, "matchId");
    const action = asAction(str(fd, "action"));
    if (!action) return { ok: false, error: "Choose a response." };
    const b = await respondableBooking({ musicianId: u.musicianId }, matchId);
    if (!b) return { ok: false, error: "This offer is no longer open." };
    await recordManualResponse(matchId, "MUSICIAN", action, str(fd, "note") || "via musician portal", actorOf(u));
    revalidatePath("/portal/musician");
    return { ok: true, message: action === "ACCEPT" ? "Accepted. It is on your calendar once the community confirms." : action === "DECLINE" ? "Declined. Thanks for letting us know quickly." : "Change request sent to our team." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Community marks a performer as preferred (or removes the mark). Blocking stays a staff action. */
export async function facilityTogglePreferred(_prev: PortalActionResult, fd: FormData): Promise<PortalActionResult> {
  try {
    const u = await requireFacilityUser();
    const musicianId = str(fd, "musicianId");
    const on = str(fd, "preferred") === "1";
    await setFacilityPreference(u.facilityId, musicianId, on ? "PREFERRED" : null, actorOf(u), on ? "Marked preferred from the community portal" : undefined);
    revalidatePath("/portal/facility");
    revalidatePath("/portal/facility/performers");
    revalidatePath(`/portal/facility/performers/${musicianId}`);
    return { ok: true, message: on ? "Added to your preferred performers." : "Removed from your preferred performers." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
