import { prisma } from "@/lib/db";
import { SYSTEM_ACTOR, audit } from "@/lib/audit";
import { raiseAlert, recordFailure } from "@/lib/alerts";
import { dispatch, staffEmails, templateText } from "@/lib/notifications/dispatcher";
import { ReminderEmail, StaffNotifyEmail } from "@/lib/emails/templates";
import { eventSummary } from "./eventRequests";
import { loadMatch, markCompleted } from "./bookings";
import { sendFeedbackRequests } from "./feedback";
import { calendarUrlFor } from "@/lib/calendar";

/**
 * Date/status-driven automation (FR-12). Idempotent: every send has a stable idempotency
 * key, so this can run every few minutes from Inngest, a cron, or a manual trigger.
 */
export interface JobReport {
  ranAt: string;
  reminders: number;
  completed: number;
  feedbackSent: number;
  offerNudges: number;
  expiredOffers: number;
  errors: string[];
}

const REMINDER_OFFSETS_HOURS = [72, 24];

/**
 * Events mirrored from Monday are emailed from Monday by staff during the transition: the app never sends
 * reminders, offer nudges or feedback forms for them (it still marks them completed).
 */
const APP_OWNED = { source: "APP" } as const;

export async function runDueJobs(now = new Date()): Promise<JobReport> {
  const report: JobReport = { ranAt: now.toISOString(), reminders: 0, completed: 0, feedbackSent: 0, offerNudges: 0, expiredOffers: 0, errors: [] };
  const safe = async (label: string, fn: () => Promise<void>, refs: { matchId?: string; eventRequestId?: string } = {}) => {
    try {
      await fn();
    } catch (e) {
      report.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      await recordFailure(label, e, refs);
    }
  };

  // 1. Pre-event reminders for confirmed bookings (72h and 24h before start).
  const horizon = new Date(now.getTime() + Math.max(...REMINDER_OFFSETS_HOURS) * 3_600_000);
  const upcoming = await prisma.match.findMany({
    where: { status: "CONFIRMED", exceptionStatus: null, eventRequest: { ...APP_OWNED, startAt: { gt: now, lte: horizon } } },
    include: { eventRequest: { include: { facility: true } }, musician: true, facility: true },
  });
  for (const m of upcoming) {
    const hoursUntil = (m.eventRequest.startAt.getTime() - now.getTime()) / 3_600_000;
    for (const offset of REMINDER_OFFSETS_HOURS) {
      if (hoursUntil > offset) continue;
      const e = eventSummary(m.eventRequest, { musicianName: m.musician.stageName ?? `${m.musician.firstName} ${m.musician.lastName}` });
      await safe(`Reminder ${offset}h for ${m.eventRequest.reference}`, async () => {
        const tm = await templateText("reminder.musician", { subject: "Reminder: upcoming performance", intro: `Hi ${m.musician.firstName}, a reminder about your upcoming performance.` });
        const tf = await templateText("reminder.facility", { subject: "Reminder: upcoming musician visit", intro: `A reminder that ${e.musicianName} is scheduled to perform at your community.` });
        const [mCal, fCal] = await Promise.all([calendarUrlFor("MUSICIAN", m.musicianId), calendarUrlFor("FACILITY", m.facilityId)]);
        const a = await dispatch({ to: m.musician.email, templateKey: "reminder.musician", subject: `${tm.subject} — ${e.when}`, body: ReminderEmail({ e, intro: tm.intro, audience: "musician", loadIn: m.facility.loadInNotes, calendarUrl: mCal }), idempotencyKey: `reminder:${m.id}:MUSICIAN:${offset}`, matchId: m.id, eventRequestId: m.eventRequestId });
        const b = await dispatch({ to: m.facility.primaryContactEmail, templateKey: "reminder.facility", subject: `${tf.subject} — ${e.when}`, body: ReminderEmail({ e, intro: tf.intro, audience: "facility", calendarUrl: fCal }), idempotencyKey: `reminder:${m.id}:FACILITY:${offset}`, matchId: m.id, eventRequestId: m.eventRequestId });
        if (a.status === "SENT" || b.status === "SENT") {
          report.reminders++;
          await audit(SYSTEM_ACTOR, { action: "reminder.sent", entityType: "Match", entityId: m.id, eventRequestId: m.eventRequestId, after: { offsetHours: offset } });
        }
      }, { matchId: m.id, eventRequestId: m.eventRequestId });
    }
  }

  // 2. Mark confirmed bookings completed once the event has ended (staff can still record a no-show).
  const ended = await prisma.match.findMany({ where: { status: "CONFIRMED", exceptionStatus: null, eventRequest: { startAt: { lt: new Date(now.getTime() - 4 * 3_600_000) } } }, include: { eventRequest: true } });
  for (const m of ended) {
    const end = new Date(m.eventRequest.startAt.getTime() + m.eventRequest.durationMinutes * 60_000);
    if (end > now) continue;
    await safe(`Complete ${m.eventRequest.reference}`, async () => {
      await markCompleted(m.id);
      report.completed++;
    }, { matchId: m.id, eventRequestId: m.eventRequestId });
  }

  // 3. Send feedback forms that are due.
  const due = await prisma.feedback.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now }, match: { status: "COMPLETED" }, eventRequest: APP_OWNED }, distinct: ["matchId"], select: { matchId: true } });
  for (const f of due) {
    await safe(`Feedback send for match ${f.matchId}`, async () => {
      await sendFeedbackRequests(f.matchId);
      report.feedbackSent++;
    }, { matchId: f.matchId });
  }

  // 4. Nudge staff about offers with no response after 24h; flag expired offers.
  const stale = await prisma.match.findMany({ where: { status: { in: ["OFFERED", "PARTIALLY_ACCEPTED"] }, exceptionStatus: null, offeredAt: { lt: new Date(now.getTime() - 24 * 3_600_000) }, eventRequest: APP_OWNED }, include: { eventRequest: true, tokens: { where: { purpose: "OFFER_RESPONSE", usedAt: null, revokedAt: null } } } });
  for (const m of stale) {
    const pending = [m.musicianResponse ? null : "musician", m.facilityResponse ? null : "facility"].filter(Boolean) as string[];
    const allExpired = m.tokens.length > 0 && m.tokens.every((t) => t.expiresAt < now);
    if (allExpired) {
      await safe(`Expired offer ${m.eventRequest.reference}`, async () => {
        await raiseAlert({ type: "DECLINE", severity: "WARNING", title: `Offer expired without response: ${m.eventRequest.reference}`, message: `No response from ${pending.join(" and ")} before the link expired. Reissue confirmations or choose another candidate.`, eventRequestId: m.eventRequestId, matchId: m.id });
        report.expiredOffers++;
      });
      continue;
    }
    await safe(`Offer nudge ${m.eventRequest.reference}`, async () => {
      for (const to of staffEmails()) {
        const res = await dispatch({ to, templateKey: "staff.offer_nudge", subject: `Still waiting on ${pending.join(" and ")}: ${m.eventRequest.reference}`, body: StaffNotifyEmail({ title: "Offer awaiting response", lines: [`Offer sent ${m.offeredAt?.toISOString()}; no response yet from ${pending.join(" and ")}.`], url: `${process.env.APP_BASE_URL}/admin/requests/${m.eventRequestId}` }), idempotencyKey: `staff.offer_nudge:${m.id}:${m.offeredAt?.getTime()}:${to}`, matchId: m.id, eventRequestId: m.eventRequestId });
        if (res.status === "SENT") report.offerNudges++;
      }
    });
  }

  // 5. Retry failed sends once (the provider may have been down).
  const failed = await prisma.notificationLog.findMany({ where: { status: "FAILED", createdAt: { gt: new Date(now.getTime() - 24 * 3_600_000) } }, take: 20 });
  if (failed.length) {
    await raiseAlert({ type: "AUTOMATION_FAILURE", severity: "WARNING", title: `${failed.length} email send(s) failed in the last 24h`, message: failed.map((f) => `${f.templateKey} → ${f.recipient}: ${f.error ?? "unknown"}`).join("\n") });
  }

  return report;
}

/** Helper for the admin UI: load one booking with everything the reminder needs. */
export { loadMatch };
