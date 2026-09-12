"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { actorOf, requireAdmin, requireUser, type CurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { approveMatch, cancelBooking, markCompleted, markNoShow, recordManualResponse, reissueConfirmations, requestRematch, withdrawOffer } from "@/lib/services/bookings";
import { closeEventRequest, evaluateReadiness, holdEventRequest, releaseEventRequest, updateEventRequest } from "@/lib/services/eventRequests";
import { runMatchingForRequest, saveMatchingConfig } from "@/lib/services/matching";
import { setMusicianRestriction, setMusicianStatus, updateMusicianCoordinates } from "@/lib/services/musicians";
import { createFacilityFromIntake, setFacilityPreference, updateFacility } from "@/lib/services/facilities";
import { closeFeedback } from "@/lib/services/feedback";
import { runDueJobs } from "@/lib/services/jobs";
import { coerceThresholds, validateWeights, type Weights } from "@/lib/matching";
import type { MusicianStatus } from "@/generated/prisma/enums";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string } | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};

async function guard<T>(fn: (u: CurrentUser) => Promise<T>, admin = false): Promise<ActionResult> {
  try {
    const u = admin ? await requireAdmin() : await requireUser();
    const r = await fn(u);
    return { ok: true, message: typeof r === "string" ? r : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
  revalidatePath("/admin");
}

// ───────────── Matching & approval ─────────────

export async function runMatchingAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const { result } = await runMatchingForRequest(id, actorOf(u));
    return `${result.eligibleCount} eligible of ${result.totalMusicians}`;
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function rematchAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const relaxations = {
      radiusMultiplier: num(fd, "radiusMultiplier") ?? undefined,
      ignoreFacilityPreferences: fd.get("ignoreFacilityPreferences") === "on",
      ignoreBudget: fd.get("ignoreBudget") === "on",
    };
    const { result } = await requestRematch(id, actorOf(u), relaxations);
    return `Re-match complete: ${result.eligibleCount} eligible of ${result.totalMusicians}`;
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function approveMatchAction(_p: ActionResult, fd: FormData) {
  const matchId = str(fd, "matchId");
  const eventRequestId = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    await approveMatch(matchId, actorOf(u), { overrideReason: str(fd, "overrideReason") || undefined });
    return "Approved. Secure offers sent to the musician and the facility.";
  });
  refresh(`/admin/requests/${eventRequestId}`);
  return res;
}

export async function holdRequestAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const reason = str(fd, "reason");
    if (!reason) throw new Error("A hold reason is required");
    await holdEventRequest(id, reason, actorOf(u));
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function releaseRequestAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard((u) => releaseEventRequest(id, actorOf(u)));
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function closeRequestAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const reason = str(fd, "reason");
    if (!reason) throw new Error("A reason is required");
    await closeEventRequest(id, reason, actorOf(u));
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function withdrawOfferAction(_p: ActionResult, fd: FormData) {
  const matchId = str(fd, "matchId");
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    await withdrawOffer(matchId, str(fd, "reason") || "Withdrawn by staff", actorOf(u));
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function reissueAction(_p: ActionResult, fd: FormData) {
  const matchId = str(fd, "matchId");
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    await reissueConfirmations(matchId, actorOf(u));
    return "Confirmations reissued to both parties.";
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function manualResponseAction(_p: ActionResult, fd: FormData) {
  const matchId = str(fd, "matchId");
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const role = str(fd, "role") as "MUSICIAN" | "FACILITY";
    const action = str(fd, "action") as "ACCEPT" | "DECLINE" | "REQUEST_CHANGES";
    const out = await recordManualResponse(matchId, role, action, str(fd, "note"), actorOf(u));
    if (!out.ok) throw new Error("Could not record the response (offer no longer open)");
    return out.confirmed ? "Recorded — booking is now confirmed." : "Response recorded.";
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function cancelBookingAction(_p: ActionResult, fd: FormData) {
  const matchId = str(fd, "matchId");
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const reason = str(fd, "reason");
    if (!reason) throw new Error("A cancellation reason is required");
    await cancelBooking(matchId, str(fd, "by") as "MUSICIAN" | "FACILITY" | "SMC", reason, actorOf(u));
  });
  refresh(`/admin/requests/${id}`, "/admin/bookings");
  return res;
}

export async function noShowAction(_p: ActionResult, fd: FormData) {
  const matchId = str(fd, "matchId");
  const id = str(fd, "eventRequestId");
  const res = await guard((u) => markNoShow(matchId, str(fd, "note") || "No-show recorded by staff", actorOf(u)));
  refresh(`/admin/requests/${id}`, "/admin/bookings");
  return res;
}

export async function completeAction(_p: ActionResult, fd: FormData) {
  const matchId = str(fd, "matchId");
  const id = str(fd, "eventRequestId");
  const res = await guard((u) => markCompleted(matchId, actorOf(u)));
  refresh(`/admin/requests/${id}`, "/admin/bookings");
  return res;
}

// ───────────── Event request editing ─────────────

export async function updateRequestAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const data: Parameters<typeof updateEventRequest>[1] = {};
    if (str(fd, "startAt")) data.startAt = new Date(str(fd, "startAt"));
    if (num(fd, "durationMinutes") != null) data.durationMinutes = num(fd, "durationMinutes")!;
    if (num(fd, "setupBufferMinutes") != null) data.setupBufferMinutes = num(fd, "setupBufferMinutes")!;
    if (str(fd, "serviceType")) data.serviceType = str(fd, "serviceType");
    if (fd.has("budgetCeiling")) data.budgetCeiling = num(fd, "budgetCeiling");
    if (fd.has("expectedAttendance")) data.expectedAttendance = num(fd, "expectedAttendance");
    if (fd.has("lat") && fd.has("lng") && num(fd, "lat") != null && num(fd, "lng") != null) {
      data.lat = num(fd, "lat");
      data.lng = num(fd, "lng");
    }
    if (fd.has("notes")) data.notes = str(fd, "notes") || null;
    if (str(fd, "facilityId")) data.facilityId = str(fd, "facilityId");
    if (fd.has("ownerId")) data.ownerId = str(fd, "ownerId") || null;
    if (fd.has("programTags")) data.programTags = str(fd, "programTags").split(",").map((s) => s.trim()).filter(Boolean);
    if (fd.has("hardRequirements")) {
      try {
        data.hardRequirements = JSON.parse(str(fd, "hardRequirements") || "{}");
      } catch {
        throw new Error("Hard requirements must be valid JSON");
      }
    }
    const r = await updateEventRequest(id, data, actorOf(u));
    return `Saved. Status: ${r.status.replace(/_/g, " ").toLowerCase()}${r.missingFields.length ? ` (missing: ${r.missingFields.join(", ")})` : ""}`;
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

export async function createFacilityFromIntakeAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const f = await createFacilityFromIntake(id, actorOf(u));
    return `Created facility ${f.name} and linked it.`;
  });
  refresh(`/admin/requests/${id}`, "/admin/facilities");
  return res;
}

export async function revalidateRequestAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "eventRequestId");
  const res = await guard(async (u) => {
    const r = await evaluateReadiness(id, actorOf(u));
    return `Status: ${r.status.replace(/_/g, " ").toLowerCase()}`;
  });
  refresh(`/admin/requests/${id}`);
  return res;
}

// ───────────── Musicians & facilities ─────────────

export async function musicianStatusAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "musicianId");
  const status = str(fd, "status") as MusicianStatus;
  const res = await guard((u) => setMusicianStatus(id, status, actorOf(u), str(fd, "note") || undefined), ["APPROVED", "SUSPENDED"].includes(status));
  refresh(`/admin/musicians/${id}`, "/admin/musicians");
  return res;
}

export async function musicianRestrictionAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "musicianId");
  const res = await guard((u) => setMusicianRestriction(id, str(fd, "restriction") || null, str(fd, "until") ? new Date(str(fd, "until")) : null, actorOf(u)), true);
  refresh(`/admin/musicians/${id}`);
  return res;
}

export async function musicianCoordsAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "musicianId");
  const res = await guard(async (u) => {
    const lat = num(fd, "lat");
    const lng = num(fd, "lng");
    if (lat == null || lng == null) throw new Error("Latitude and longitude are required");
    await updateMusicianCoordinates(id, lat, lng, actorOf(u));
  });
  refresh(`/admin/musicians/${id}`);
  return res;
}

export async function musicianNotesAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "musicianId");
  const res = await guard(async (u) => {
    const before = await prisma.musician.findUniqueOrThrow({ where: { id }, select: { privateNotes: true } });
    await prisma.musician.update({ where: { id }, data: { privateNotes: str(fd, "privateNotes") || null } });
    await audit(actorOf(u), { action: "musician.notes", entityType: "Musician", entityId: id, before, after: { privateNotes: str(fd, "privateNotes") } });
  }, true);
  refresh(`/admin/musicians/${id}`);
  return res;
}

export async function facilityPreferenceAction(_p: ActionResult, fd: FormData) {
  const facilityId = str(fd, "facilityId");
  const res = await guard(async (u) => {
    const kind = str(fd, "kind");
    await setFacilityPreference(facilityId, str(fd, "musicianId"), kind === "NONE" ? null : (kind as "PREFERRED" | "BLOCKED"), actorOf(u), str(fd, "note") || undefined);
  });
  refresh(`/admin/facilities/${facilityId}`);
  return res;
}

export async function updateFacilityAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "facilityId");
  const res = await guard(async (u) => {
    const data: Parameters<typeof updateFacility>[1] = {};
    for (const k of ["name", "facilityType", "addressLine1", "city", "state", "postalCode", "timezone", "primaryContactName", "primaryContactRole", "primaryContactEmail", "primaryContactPhone", "roomType", "parkingNotes", "loadInNotes", "residentPopulation"] as const) {
      if (fd.has(k)) (data as Record<string, unknown>)[k] = str(fd, k) || null;
    }
    if (fd.has("audienceTags")) data.audienceTags = str(fd, "audienceTags").split(",").map((s) => s.trim()).filter(Boolean);
    if (fd.has("preferredGenres")) data.preferredGenres = str(fd, "preferredGenres").split(",").map((s) => s.trim()).filter(Boolean);
    if (fd.has("hasPiano")) data.hasPiano = fd.get("hasPiano") === "on";
    if (fd.has("typicalGroupSize")) data.typicalGroupSize = num(fd, "typicalGroupSize");
    if (fd.has("budgetMin")) data.budgetMin = num(fd, "budgetMin");
    if (fd.has("budgetMax")) data.budgetMax = num(fd, "budgetMax");
    if (fd.has("lat") && fd.has("lng") && num(fd, "lat") != null) {
      data.lat = num(fd, "lat");
      data.lng = num(fd, "lng");
    }
    if (u.role === "ADMIN" && fd.has("privateNotes")) data.privateNotes = str(fd, "privateNotes") || null;
    if (fd.has("status")) data.status = str(fd, "status") as "ACTIVE" | "INACTIVE" | "PENDING_REVIEW";
    await updateFacility(id, data, actorOf(u));
  });
  refresh(`/admin/facilities/${id}`, "/admin/facilities");
  return res;
}

// ───────────── Alerts, feedback, config, jobs ─────────────

export async function resolveAlertAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "alertId");
  const res = await guard(async (u) => {
    await prisma.alert.update({ where: { id }, data: { resolvedAt: new Date(), resolvedById: u.id, resolutionNote: str(fd, "note") || null } });
    await audit(actorOf(u), { action: "alert.resolved", entityType: "Alert", entityId: id, after: { note: str(fd, "note") } });
  });
  refresh("/admin/alerts");
  return res;
}

export async function closeFeedbackAction(_p: ActionResult, fd: FormData) {
  const id = str(fd, "feedbackId");
  const res = await guard((u) => closeFeedback(id, str(fd, "notes") || "Closed", actorOf(u)));
  refresh("/admin/feedback");
  return res;
}

export async function saveWeightsAction(_p: ActionResult, fd: FormData) {
  const res = await guard(async (u) => {
    const weights = Object.fromEntries(["availability", "service", "distance", "audience", "budget", "quality", "rotation"].map((k) => [k, Number(fd.get(`w_${k}`))])) as Weights;
    const v = validateWeights(weights);
    if (!v.ok) throw new Error(v.errors.join("; "));
    const thresholds: Record<string, number> = {};
    for (const [k, val] of fd.entries()) if (k.startsWith("t_") && String(val) !== "") thresholds[k.slice(2)] = Number(val);
    await saveMatchingConfig(weights, coerceThresholds(thresholds), actorOf(u));
    return "Saved matching configuration.";
  }, true);
  refresh("/admin/settings");
  return res;
}

export async function saveTemplateAction(_p: ActionResult, fd: FormData) {
  const res = await guard(async (u) => {
    const key = str(fd, "key");
    if (!key) throw new Error("Template key required");
    const before = await prisma.notificationTemplate.findUnique({ where: { key } });
    const subject = str(fd, "subject");
    const intro = str(fd, "intro");
    if (!subject && !intro) {
      await prisma.notificationTemplate.deleteMany({ where: { key } });
    } else {
      const defaults = before ?? { subject: "", intro: "" };
      await prisma.notificationTemplate.upsert({ where: { key }, create: { key, subject: subject || defaults.subject, intro: intro || defaults.intro }, update: { subject: subject || defaults.subject, intro: intro || defaults.intro } });
    }
    await audit(actorOf(u), { action: "config.template", entityType: "NotificationTemplate", entityId: key, before, after: { subject: str(fd, "subject"), intro: str(fd, "intro") } });
  }, true);
  refresh("/admin/settings");
  return res;
}

export async function runJobsAction(_p: ActionResult, _fd: FormData) {
  const res = await guard(async () => {
    const r = await runDueJobs();
    return `Ran jobs: ${r.reminders} reminders, ${r.completed} completed, ${r.feedbackSent} feedback sends, ${r.offerNudges} nudges, ${r.expiredOffers} expired offers${r.errors.length ? `, ${r.errors.length} errors` : ""}.`;
  });
  refresh("/admin/bookings", "/admin/feedback", "/admin/alerts");
  return res;
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}
