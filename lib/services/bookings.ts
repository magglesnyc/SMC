import { prisma, type Tx } from "@/lib/db";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { consumeToken, issueToken, responseUrl, revokeTokensForMatch } from "@/lib/tokens";
import { dispatch, staffEmails, templateText } from "@/lib/notifications/dispatcher";
import { ChangeAcknowledgedEmail, ConfirmedEmail, FacilityOfferEmail, MusicianOfferEmail, StaffNotifyEmail } from "@/lib/emails/templates";
import { effectiveRate } from "@/lib/matching";
import { fmtDateTime, fmtMoney, decimalToNumber } from "@/lib/utils";
import { eventSummary, closeEventRequest } from "./eventRequests";
import { runMatchingForRequest } from "./matching";
import { recomputeMusicianStats } from "./musicians";
import { calendarUrlFor } from "@/lib/calendar";
import type { PartyResponse, RecipientRole } from "@/generated/prisma/enums";
import type { Relaxations } from "@/lib/matching";

export const matchInclude = {
  eventRequest: { include: { facility: true } },
  facility: true,
  musician: true,
  matchRun: true,
} as const;

export async function loadMatch(id: string, tx?: Tx) {
  return (tx ?? prisma).match.findUniqueOrThrow({ where: { id }, include: matchInclude });
}
type FullMatch = Awaited<ReturnType<typeof loadMatch>>;

function musicianName(m: FullMatch["musician"]) {
  return m.stageName ?? `${m.firstName} ${m.lastName}`;
}

function summaryFor(match: FullMatch) {
  const rate = effectiveRate({ standardRate: decimalToNumber(match.musician.standardRate) ?? 0, rateStructure: match.musician.rateStructure } as Parameters<typeof effectiveRate>[0], match.eventRequest.durationMinutes);
  return eventSummary(match.eventRequest, { musicianName: musicianName(match.musician), rate: `${fmtMoney(rate)}${match.musician.travelFeeApplies ? " + travel fee" : ""}` });
}

// ───────────── Stage 6: administrator approves a match ─────────────

export async function approveMatch(matchId: string, actor: Actor, opts: { overrideReason?: string } = {}) {
  const match = await loadMatch(matchId);
  const r = match.eventRequest;
  if (!match.eligible) throw new Error("Only eligible candidates can be approved");
  if (r.status !== "AWAITING_APPROVAL") throw new Error(`Request is ${r.status}, not awaiting approval`);
  if (r.heldAt) throw new Error("Request is on hold; release it first");
  const latestRun = await prisma.matchRun.findFirst({ where: { eventRequestId: r.id }, orderBy: { createdAt: "desc" } });
  if (latestRun && latestRun.id !== match.matchRunId) throw new Error("This candidate is from an older run; approve from the latest candidate list");
  const isOverride = match.rank !== 1;
  if (isOverride && !opts.overrideReason?.trim()) throw new Error("Selecting a candidate other than the top recommendation requires an override reason");
  const other = await prisma.match.findFirst({ where: { eventRequestId: r.id, selected: true, id: { not: matchId } } });
  if (other && ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED"].includes(other.status) && !other.exceptionStatus) {
    throw new Error("Another candidate is already selected for this event; withdraw that offer first");
  }

  await prisma.$transaction(async (tx) => {
    if (other) await tx.match.update({ where: { id: other.id }, data: { selected: false } });
    await tx.match.update({
      where: { id: matchId },
      data: { selected: true, approvedById: actor.id ?? null, approvedAt: new Date(), isOverride, overrideReason: isOverride ? opts.overrideReason!.trim() : null, status: "APPROVED", exceptionStatus: null, exceptionReason: null, musicianResponse: null, musicianRespondedAt: null, musicianResponseNote: null, facilityResponse: null, facilityRespondedAt: null, facilityResponseNote: null },
    });
    await audit(actor, { action: isOverride ? "match.override" : "match.approved", entityType: "Match", entityId: matchId, eventRequestId: r.id, after: { musicianId: match.musicianId, rank: match.rank, score: match.score, isOverride, overrideReason: opts.overrideReason } }, tx);
  });
  await prisma.alert.updateMany({ where: { eventRequestId: r.id, type: { in: ["DECLINE", "CHANGE_REQUEST", "CONFLICTING_RESPONSES", "NO_ELIGIBLE_MUSICIAN"] }, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedById: actor.id ?? null, resolutionNote: "New candidate approved" } });
  return sendOffers(matchId, actor);
}

// ───────────── Stage 7: secure offers to both parties ─────────────

export async function sendOffers(matchId: string, actor: Actor) {
  const match = await loadMatch(matchId);
  const r = match.eventRequest;
  const facilityEmail = r.facility?.primaryContactEmail;
  if (!facilityEmail) throw new Error("Facility has no contact email");

  const { musicianToken, facilityToken } = await prisma.$transaction(async (tx) => {
    const musicianToken = await issueToken(matchId, "MUSICIAN", "OFFER_RESPONSE", tx);
    const facilityToken = await issueToken(matchId, "FACILITY", "OFFER_RESPONSE", tx);
    await tx.match.update({ where: { id: matchId }, data: { status: "OFFERED", offeredAt: new Date() } });
    await audit(actor, { action: "match.offered", entityType: "Match", entityId: matchId, eventRequestId: r.id, after: { musicianTokenId: musicianToken.id, facilityTokenId: facilityToken.id, expiresAt: musicianToken.expiresAt } }, tx);
    return { musicianToken, facilityToken };
  });

  const e = summaryFor(match);
  const expires = fmtDateTime(musicianToken.expiresAt, r.timezone);
  const tm = await templateText("offer.musician", { subject: "Booking offer from Senior Music Connection", intro: `Hi ${match.musician.firstName}, we would like to book you for the following event.` });
  const tf = await templateText("offer.facility", { subject: "Please confirm your musician", intro: `Hi ${r.facility?.primaryContactName ?? ""}, we have matched a musician to your request and need your confirmation.` });
  await dispatch({ to: match.musician.email, templateKey: "offer.musician", subject: `${tm.subject} — ${e.when}`, body: MusicianOfferEmail({ e, intro: tm.intro, url: responseUrl(musicianToken.raw), expires }), idempotencyKey: `offer:${musicianToken.id}`, matchId, eventRequestId: r.id });
  await dispatch({ to: facilityEmail, templateKey: "offer.facility", subject: `${tf.subject} — ${e.when}`, body: FacilityOfferEmail({ e, intro: tf.intro, url: responseUrl(facilityToken.raw), expires }), idempotencyKey: `offer:${facilityToken.id}`, matchId, eventRequestId: r.id });
  return loadMatch(matchId);
}

/** Withdraw the current offer (admin picked another candidate, or event changed). Links die immediately. */
export async function withdrawOffer(matchId: string, reason: string, actor: Actor) {
  const match = await loadMatch(matchId);
  if (match.status === "CONFIRMED" || match.status === "COMPLETED") throw new Error("Use cancelBooking for a confirmed booking");
  await prisma.$transaction(async (tx) => {
    await revokeTokensForMatch(matchId, `Offer withdrawn: ${reason}`, "OFFER_RESPONSE", tx);
    await tx.match.update({ where: { id: matchId }, data: { selected: false, exceptionStatus: "REMATCH_REQUIRED", exceptionReason: reason } });
    await audit(actor, { action: "match.withdrawn", entityType: "Match", entityId: matchId, eventRequestId: match.eventRequestId, before: { status: match.status }, after: { reason } }, tx);
  });
}

/** Re-send confirmations after a change was applied to the event. Both parties respond again. */
export async function reissueConfirmations(matchId: string, actor: Actor) {
  const match = await loadMatch(matchId);
  if (!match.selected) throw new Error("Match is not the selected candidate");
  await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data: { exceptionStatus: null, exceptionReason: null, musicianResponse: null, musicianRespondedAt: null, musicianResponseNote: null, facilityResponse: null, facilityRespondedAt: null, facilityResponseNote: null, status: "APPROVED" } });
    await audit(actor, { action: "match.reissue", entityType: "Match", entityId: matchId, eventRequestId: match.eventRequestId, before: { exceptionStatus: match.exceptionStatus } }, tx);
  });
  await prisma.alert.updateMany({ where: { matchId, type: { in: ["CHANGE_REQUEST", "CONFLICTING_RESPONSES"] }, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedById: actor.id ?? null, resolutionNote: "Confirmations reissued" } });
  return sendOffers(matchId, actor);
}

/** Request a fresh candidate set. Withdraws any live offer first. */
export async function requestRematch(eventRequestId: string, actor: Actor, relaxations: Relaxations = {}) {
  const live = await prisma.match.findFirst({ where: { eventRequestId, selected: true, status: { in: ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED"] } } });
  if (live) await withdrawOffer(live.id, "Re-match requested", actor);
  const r = await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventRequestId } });
  if (r.status === "CLOSED") throw new Error("Request is closed");
  await prisma.eventRequest.update({ where: { id: eventRequestId }, data: { status: "READY_TO_MATCH" } });
  return runMatchingForRequest(eventRequestId, actor, relaxations);
}

// ───────────── Responses via secure links (idempotent) ─────────────

export type ResponseOutcome =
  | { ok: true; role: RecipientRole; response: PartyResponse; matchStatus: string; confirmed: boolean }
  | { ok: false; reason: "inactive" | "not_offered" };

export async function recordOfferResponse(rawToken: string, action: "ACCEPT" | "DECLINE" | "REQUEST_CHANGES", note?: string): Promise<ResponseOutcome> {
  const response: PartyResponse = action === "ACCEPT" ? "ACCEPTED" : action === "DECLINE" ? "DECLINED" : "CHANGE_REQUESTED";

  const result = await prisma.$transaction(async (tx) => {
    const token = await consumeToken(rawToken, "OFFER_RESPONSE", tx);
    if (!token) return { ok: false as const, reason: "inactive" as const };
    const match = await loadMatch(token.matchId, tx);
    if (!["OFFERED", "PARTIALLY_ACCEPTED"].includes(match.status) || !match.selected) {
      return { ok: false as const, reason: "not_offered" as const };
    }
    const role = token.recipientRole;
    const now = new Date();
    const data =
      role === "MUSICIAN"
        ? { musicianResponse: response, musicianRespondedAt: now, musicianResponseNote: note ?? null }
        : { facilityResponse: response, facilityRespondedAt: now, facilityResponseNote: note ?? null };
    const musicianResp = role === "MUSICIAN" ? response : match.musicianResponse;
    const facilityResp = role === "FACILITY" ? response : match.facilityResponse;

    let status = match.status;
    let exceptionStatus = match.exceptionStatus;
    let exceptionReason = match.exceptionReason;
    let confirmed = false;
    const accepted = [musicianResp, facilityResp].filter((x) => x === "ACCEPTED").length;
    const negative = [musicianResp, facilityResp].some((x) => x === "DECLINED" || x === "CHANGE_REQUESTED");

    if (accepted === 2) {
      status = "CONFIRMED";
      confirmed = true;
      exceptionStatus = null;
      exceptionReason = null;
    } else if (negative) {
      if (accepted === 1) {
        exceptionStatus = "CONFLICT";
        exceptionReason = `${role.toLowerCase()} ${response.toLowerCase().replace("_", " ")}${note ? `: ${note}` : ""}`;
      } else {
        exceptionStatus = response === "DECLINED" ? "DECLINED" : "CHANGE_REQUESTED";
        exceptionReason = `${role.toLowerCase()}${note ? `: ${note}` : ""}`;
      }
    } else if (accepted === 1) {
      status = "PARTIALLY_ACCEPTED";
    }

    await tx.match.update({ where: { id: match.id }, data: { ...data, status, exceptionStatus, exceptionReason, ...(confirmed ? { confirmedAt: now } : {}) } });
    if (confirmed) {
      await revokeTokensForMatch(match.id, "Booking confirmed", "OFFER_RESPONSE", tx);
      await closeEventRequest(match.eventRequestId, "Booking confirmed", SYSTEM_ACTOR, tx);
    } else if (negative) {
      // Pause: the other party's link must not confirm a booking that is now in question.
      await revokeTokensForMatch(match.id, `Paused after ${role.toLowerCase()} response: ${response}`, "OFFER_RESPONSE", tx);
    }
    const actor: Actor = role === "MUSICIAN" ? { type: "MUSICIAN", id: match.musicianId, label: musicianName(match.musician) } : { type: "FACILITY", id: match.facilityId, label: match.facility.name };
    await audit(actor, { action: `response.${response.toLowerCase()}`, entityType: "Match", entityId: match.id, eventRequestId: match.eventRequestId, before: { status: match.status }, after: { role, response, note, status, exceptionStatus } }, tx);
    return { ok: true as const, role, response, matchStatus: status, confirmed, matchId: match.id, exceptionStatus };
  });

  if (!result.ok) return result;
  await afterResponse(result.matchId, result.role, result.response, note);
  if (result.role === "MUSICIAN") await recomputeMusicianStats((await prisma.match.findUniqueOrThrow({ where: { id: result.matchId } })).musicianId);
  return { ok: true, role: result.role, response: result.response, matchStatus: result.matchStatus, confirmed: result.confirmed };
}

async function afterResponse(matchId: string, role: RecipientRole, response: PartyResponse, note?: string) {
  const match = await loadMatch(matchId);
  const r = match.eventRequest;
  const e = summaryFor(match);
  const adminUrl = `${process.env.APP_BASE_URL}/admin/requests/${r.id}`;
  const who = role === "MUSICIAN" ? musicianName(match.musician) : match.facility.name;

  if (match.status === "CONFIRMED") {
    const tm = await templateText("confirmed.musician", { subject: "Confirmed: your upcoming performance", intro: `Great news, ${match.musician.firstName} — both parties have accepted and the event is confirmed.` });
    const tf = await templateText("confirmed.facility", { subject: "Confirmed: your musician is booked", intro: `Great news — ${musicianName(match.musician)} has accepted and your event is confirmed.` });
    const [mCal, fCal] = await Promise.all([calendarUrlFor("MUSICIAN", match.musicianId), calendarUrlFor("FACILITY", match.facilityId)]);
    await dispatch({ to: match.musician.email, templateKey: "confirmed.musician", subject: `${tm.subject} — ${e.when}`, body: ConfirmedEmail({ e, intro: tm.intro, audience: "musician", calendarUrl: mCal }), idempotencyKey: `confirmed:${matchId}:MUSICIAN`, matchId, eventRequestId: r.id });
    await dispatch({ to: match.facility.primaryContactEmail, templateKey: "confirmed.facility", subject: `${tf.subject} — ${e.when}`, body: ConfirmedEmail({ e, intro: tf.intro, audience: "facility", calendarUrl: fCal }), idempotencyKey: `confirmed:${matchId}:FACILITY`, matchId, eventRequestId: r.id });
    // Stage 8: reminders and feedback are scheduled (delivered by the jobs runner / Inngest).
    await scheduleFeedbackRows(matchId);
    return;
  }

  if (match.exceptionStatus === "CONFLICT") {
    await raiseAlert({ type: "CONFLICTING_RESPONSES", severity: "CRITICAL", title: `Conflicting responses on ${r.reference}`, message: `${who} responded ${response.toLowerCase().replace("_", " ")} while the other party accepted.${note ? ` Note: ${note}` : ""} Confirmation is blocked until an administrator resolves this.`, eventRequestId: r.id, matchId });
  } else if (response === "DECLINED") {
    await raiseAlert({ type: "DECLINE", severity: "WARNING", title: `${who} declined ${r.reference}`, message: `${note ? `Reason: ${note}. ` : ""}Approve the next-ranked candidate or request a re-match.`, eventRequestId: r.id, matchId });
  } else if (response === "CHANGE_REQUESTED") {
    await raiseAlert({ type: "CHANGE_REQUEST", severity: "WARNING", title: `${who} requested changes on ${r.reference}`, message: `${note ?? "(no details given)"}. Confirmation is paused. Update the event and reissue confirmations to both parties.`, eventRequestId: r.id, matchId });
  }
  if (response === "DECLINED") {
    // Return the event to the candidate list: the declined candidate is no longer selected.
    await prisma.match.update({ where: { id: matchId }, data: { selected: false } });
  }
  if (response === "CHANGE_REQUESTED") {
    // Always acknowledge a change request to whoever raised it, conflict or not.
    const to = role === "MUSICIAN" ? match.musician.email : match.facility.primaryContactEmail;
    const t = await templateText("change.acknowledged", { subject: "We received your change request", intro: "Thanks for letting us know. Our team will review the change and follow up." });
    await dispatch({ to, templateKey: "change.acknowledged", subject: `${t.subject} (${r.reference})`, body: ChangeAcknowledgedEmail({ e, intro: t.intro, change: note ?? "" }), idempotencyKey: `change.ack:${matchId}:${role}:${match[role === "MUSICIAN" ? "musicianRespondedAt" : "facilityRespondedAt"]?.getTime()}`, matchId, eventRequestId: r.id });
  }
  if (response !== "ACCEPTED") {
    for (const to of staffEmails()) {
      await dispatch({ to, templateKey: "staff.response", subject: `${who} ${response.toLowerCase().replace("_", " ")} — ${r.reference}`, body: StaffNotifyEmail({ title: `Response: ${response.toLowerCase().replace("_", " ")}`, lines: [`${who} responded to the offer for ${e.when} at ${e.facilityName}.`, note ? `Note: ${note}` : ""].filter(Boolean), url: adminUrl }), idempotencyKey: `staff.response:${matchId}:${role}:${response}:${to}`, matchId, eventRequestId: r.id });
    }
  }
}

/** Admin records a response received out-of-band (phone/email), with the same state machine. */
export async function recordManualResponse(matchId: string, role: RecipientRole, action: "ACCEPT" | "DECLINE" | "REQUEST_CHANGES", note: string, actor: Actor) {
  const { raw } = await prisma.$transaction((tx) => issueToken(matchId, role, "OFFER_RESPONSE", tx));
  await audit(actor, { action: "response.manual", entityType: "Match", entityId: matchId, after: { role, action, note } });
  return recordOfferResponse(raw, action, `[recorded by ${actor.label}] ${note}`);
}

// ───────────── Exceptions: cancellation, no-show, completion ─────────────

export async function cancelBooking(matchId: string, by: "MUSICIAN" | "FACILITY" | "SMC", reason: string, actor: Actor) {
  const match = await loadMatch(matchId);
  const r = match.eventRequest;
  const future = r.startAt > new Date();
  await prisma.$transaction(async (tx) => {
    await revokeTokensForMatch(matchId, `Cancelled: ${reason}`, undefined, tx);
    await tx.match.update({ where: { id: matchId }, data: { exceptionStatus: "CANCELLED", exceptionReason: `${by}: ${reason}`, selected: false } });
    await tx.feedback.updateMany({ where: { matchId, status: "SCHEDULED" }, data: { status: "CLOSED", closedAt: new Date() } });
    if (future && by !== "FACILITY") {
      // Replacement workflow: reopen the request so staff can re-match.
      await tx.eventRequest.update({ where: { id: r.id }, data: { status: "READY_TO_MATCH", closedAt: null, closeReason: null } });
    } else if (r.status !== "CLOSED") {
      await tx.eventRequest.update({ where: { id: r.id }, data: { status: "CLOSED", closedAt: new Date(), closeReason: `Cancelled by ${by.toLowerCase()}: ${reason}` } });
    }
    await audit(actor, { action: "booking.cancelled", entityType: "Match", entityId: matchId, eventRequestId: r.id, before: { status: match.status }, after: { by, reason, replacementWorkflow: future && by !== "FACILITY" } }, tx);
  });
  await raiseAlert({ type: "CANCELLATION", severity: future ? "CRITICAL" : "WARNING", title: `${r.reference} cancelled by ${by.toLowerCase()}`, message: `${reason}${future && by !== "FACILITY" ? " — request reopened for a replacement musician." : ""}`, eventRequestId: r.id, matchId, musicianId: by === "MUSICIAN" ? match.musicianId : null });
  if (by === "MUSICIAN") await recomputeMusicianStats(match.musicianId);
}

export async function markNoShow(matchId: string, note: string, actor: Actor) {
  const match = await loadMatch(matchId);
  await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data: { exceptionStatus: "NO_SHOW", exceptionReason: note } });
    await audit(actor, { action: "booking.no_show", entityType: "Match", entityId: matchId, eventRequestId: match.eventRequestId, after: { note } }, tx);
  });
  await raiseAlert({ type: "NO_SHOW", severity: "CRITICAL", title: `No-show on ${match.eventRequest.reference}`, message: note, eventRequestId: match.eventRequestId, matchId, musicianId: match.musicianId });
  await recomputeMusicianStats(match.musicianId);
}

export async function markCompleted(matchId: string, actor: Actor = SYSTEM_ACTOR) {
  const match = await loadMatch(matchId);
  if (match.status !== "CONFIRMED") throw new Error("Only confirmed bookings can be completed");
  if (match.exceptionStatus === "CANCELLED" || match.exceptionStatus === "NO_SHOW") throw new Error("Booking was cancelled or a no-show");
  await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await audit(actor, { action: "booking.completed", entityType: "Match", entityId: matchId, eventRequestId: match.eventRequestId }, tx);
  });
  await recomputeMusicianStats(match.musicianId);
  await scheduleFeedbackRows(matchId);
}

export async function scheduleFeedbackRows(matchId: string) {
  const match = await loadMatch(matchId);
  const eventEnd = new Date(match.eventRequest.startAt.getTime() + match.eventRequest.durationMinutes * 60_000);
  const scheduledAt = new Date(eventEnd.getTime() + 2 * 3_600_000);
  for (const kind of ["CLIENT", "MUSICIAN"] as const) {
    await prisma.feedback.upsert({
      where: { matchId_kind: { matchId, kind } },
      create: { kind, matchId, eventRequestId: match.eventRequestId, facilityId: match.facilityId, musicianId: match.musicianId, status: "SCHEDULED", scheduledAt },
      update: {},
    });
  }
}
