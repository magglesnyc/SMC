import { prisma, type Tx } from "@/lib/db";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { consumeToken, feedbackUrl, issueToken, peekToken } from "@/lib/tokens";
import { dispatch, staffEmails, templateText } from "@/lib/notifications/dispatcher";
import { FeedbackRequestEmail, StaffNotifyEmail } from "@/lib/emails/templates";
import { LOW_RATING_THRESHOLD } from "@/lib/validation/constants";
import type { ClientFeedbackInput, MusicianFeedbackInput } from "@/lib/validation/schemas";
import { eventSummary } from "./eventRequests";
import { loadMatch, matchInclude } from "./bookings";
import { recomputeMusicianStats } from "./musicians";

/** Stage 10: send both feedback forms with the event reference pre-attached (a token). */
export async function sendFeedbackRequests(matchId: string, actor: Actor = SYSTEM_ACTOR) {
  const match = await loadMatch(matchId);
  const r = match.eventRequest;
  const e = eventSummary(r, { musicianName: match.musician.stageName ?? `${match.musician.firstName} ${match.musician.lastName}` });
  const rows = await prisma.feedback.findMany({ where: { matchId, status: "SCHEDULED" } });
  for (const row of rows) {
    const role = row.kind === "CLIENT" ? "FACILITY" : "MUSICIAN";
    const { raw, id } = await prisma.$transaction((tx) => issueToken(matchId, role, "FEEDBACK", tx));
    const to = row.kind === "CLIENT" ? match.facility.primaryContactEmail : match.musician.email;
    const t = await templateText(`feedback.${row.kind.toLowerCase()}`, {
      subject: row.kind === "CLIENT" ? "How was the performance?" : "How was the venue?",
      intro: row.kind === "CLIENT" ? "Thank you for hosting. Two minutes of feedback helps us keep matching you with the right musicians." : "Thanks for performing. Your feedback about the venue helps us prepare the next musician.",
    });
    const res = await dispatch({ to, templateKey: `feedback.${row.kind.toLowerCase()}`, subject: `${t.subject} (${r.reference})`, body: FeedbackRequestEmail({ e, intro: t.intro, url: feedbackUrl(row.kind === "CLIENT" ? "facility" : "musician", raw), audience: row.kind === "CLIENT" ? "facility" : "musician" }), idempotencyKey: `feedback.request:${id}`, matchId, eventRequestId: r.id });
    if (res.status !== "FAILED") {
      await prisma.feedback.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date() } });
      await audit(actor, { action: "feedback.sent", entityType: "Feedback", entityId: row.id, eventRequestId: r.id, after: { kind: row.kind, to } });
    }
  }
}

/** Resolve a feedback link to the event it belongs to, without consuming it. */
export async function feedbackContext(raw: string, kind: "CLIENT" | "MUSICIAN") {
  const { state, token } = await peekToken(raw);
  if (!token || token.purpose !== "FEEDBACK") return { state: "unknown" as const, match: null };
  const expectedRole = kind === "CLIENT" ? "FACILITY" : "MUSICIAN";
  if (token.recipientRole !== expectedRole) return { state: "unknown" as const, match: null };
  return { state, match: token.match };
}

type FeedbackInput = Omit<ClientFeedbackInput, "ref"> | Omit<MusicianFeedbackInput, "ref">;
type FullMatch = Awaited<ReturnType<typeof loadMatch>>;

/** Shared write path for both the emailed link and the signed-in portals. */
async function recordFeedback(kind: "CLIENT" | "MUSICIAN", match: FullMatch, input: FeedbackInput, tx: Tx, via: "link" | "portal") {
  const followUp = input.followUpRequested || input.rating <= LOW_RATING_THRESHOLD || input.issues.length > 0;
  const data = { status: followUp ? ("FOLLOW_UP_REQUIRED" as const) : ("SUBMITTED" as const), rating: input.rating, secondaryRatings: input.secondaryRatings, comments: input.comments ?? null, issues: input.issues, followUpRequired: followUp, submittedAt: new Date() };
  const row = await tx.feedback.upsert({
    where: { matchId_kind: { matchId: match.id, kind } },
    create: { kind, matchId: match.id, eventRequestId: match.eventRequestId, facilityId: match.facilityId, musicianId: match.musicianId, ...data },
    update: data,
  });
  const actor: Actor = kind === "CLIENT" ? { type: "FACILITY", id: match.facilityId, label: match.facility.name } : { type: "MUSICIAN", id: match.musicianId, label: `${match.musician.firstName} ${match.musician.lastName}` };
  await audit(actor, { action: "feedback.submitted", entityType: "Feedback", entityId: row.id, eventRequestId: match.eventRequestId, after: { kind, rating: input.rating, issues: input.issues, followUp, via } }, tx);
  return { row, match, followUp };
}

async function afterFeedback(kind: "CLIENT" | "MUSICIAN", input: FeedbackInput, result: Awaited<ReturnType<typeof recordFeedback>>) {
  const { row, match, followUp } = result;
  if (kind === "CLIENT") await recomputeMusicianStats(match.musicianId);
  if (followUp) {
    const low = input.rating <= LOW_RATING_THRESHOLD;
    const who = kind === "CLIENT" ? match.facility.name : `${match.musician.firstName} ${match.musician.lastName}`;
    await raiseAlert({ type: low ? "LOW_RATING" : "FEEDBACK_ISSUE", severity: low ? "CRITICAL" : "WARNING", title: `${low ? "Low rating" : "Feedback issue"} on ${match.eventRequest.reference}`, message: `${who} rated ${input.rating}/5${input.issues.length ? ` — issues: ${input.issues.join(", ")}` : ""}${input.comments ? `\n"${input.comments}"` : ""}`, eventRequestId: match.eventRequestId, matchId: match.id, musicianId: kind === "CLIENT" ? match.musicianId : null });
    for (const to of staffEmails()) {
      await dispatch({ to, templateKey: "staff.feedback_alert", subject: `${low ? "Low rating" : "Feedback needs follow-up"}: ${match.eventRequest.reference}`, body: StaffNotifyEmail({ title: low ? "Low rating received" : "Feedback needs follow-up", lines: [`${who} rated the event ${input.rating}/5.`, input.issues.length ? `Issues: ${input.issues.join(", ")}` : "", input.comments ?? ""].filter(Boolean), url: `${process.env.APP_BASE_URL}/admin/feedback` }), idempotencyKey: `staff.feedback_alert:${row.id}:${to}`, matchId: match.id, eventRequestId: match.eventRequestId });
    }
  }
  return { ok: true as const, feedbackId: row.id };
}

/** Feedback arriving through the emailed single-use link. */
export async function submitFeedback(kind: "CLIENT" | "MUSICIAN", input: ClientFeedbackInput | MusicianFeedbackInput) {
  const result = await prisma.$transaction(async (tx) => {
    const token = await consumeToken(input.ref, "FEEDBACK", tx);
    if (!token) return null;
    const expectedRole = kind === "CLIENT" ? "FACILITY" : "MUSICIAN";
    if (token.recipientRole !== expectedRole) return null;
    const match = await loadMatch(token.matchId, tx);
    return recordFeedback(kind, match, input, tx, "link");
  });
  if (!result) return { ok: false as const, reason: "inactive" as const };
  return afterFeedback(kind, input, result);
}

/**
 * Feedback arriving from a signed-in portal. The owner id comes from the session; the match must
 * belong to that owner and be over. Any live emailed link is retired so the same event cannot be
 * rated twice through two doors.
 */
export async function submitPortalFeedback(kind: "CLIENT" | "MUSICIAN", ownerId: string, matchId: string, input: FeedbackInput) {
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: matchInclude });
    if (!match) return "not_found" as const;
    const owns = kind === "CLIENT" ? match.facilityId === ownerId : match.musicianId === ownerId;
    if (!owns) return "not_found" as const;
    if (match.status !== "COMPLETED" && match.exceptionStatus !== "NO_SHOW") return "not_completed" as const;
    const existing = await tx.feedback.findUnique({ where: { matchId_kind: { matchId, kind } } });
    if (existing?.submittedAt) return "already" as const;
    await tx.responseToken.updateMany({ where: { matchId, purpose: "FEEDBACK", recipientRole: kind === "CLIENT" ? "FACILITY" : "MUSICIAN", usedAt: null, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "Submitted from the portal" } });
    return recordFeedback(kind, match, input, tx, "portal");
  });
  if (typeof result === "string") return { ok: false as const, reason: result };
  return afterFeedback(kind, input, result);
}

export async function closeFeedback(id: string, notes: string, actor: Actor) {
  const before = await prisma.feedback.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    await tx.feedback.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), followUpNotes: notes } });
    await audit(actor, { action: "feedback.closed", entityType: "Feedback", entityId: id, eventRequestId: before.eventRequestId, before: { status: before.status }, after: { notes } }, tx);
  });
  await prisma.alert.updateMany({ where: { matchId: before.matchId, type: { in: ["LOW_RATING", "FEEDBACK_ISSUE"] }, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedById: actor.id ?? null, resolutionNote: notes } });
}
