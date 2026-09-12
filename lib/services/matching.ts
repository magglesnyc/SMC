import { prisma } from "@/lib/db";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { raiseAlert, recordFailure } from "@/lib/alerts";
import { estimateTravel } from "@/lib/geo";
import { dispatch, staffEmails } from "@/lib/notifications/dispatcher";
import { StaffNotifyEmail } from "@/lib/emails/templates";
import {
  coerceThresholds,
  coerceWeights,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  runMatching,
  summarizeExclusions,
  validateWeights,
  type Blackout,
  type EngineMusician,
  type EngineRequest,
  type HardRequirements,
  type Relaxations,
  type Thresholds,
  type Weights,
  type WeeklyWindow,
} from "@/lib/matching";
import { decimalToNumber } from "@/lib/utils";
import type { EventRequest, Facility, Musician } from "@/generated/prisma/client";

// ───────────── Configuration ─────────────

export async function getMatchingConfig(): Promise<{ weights: Weights; thresholds: Thresholds; updatedAt: Date | null }> {
  const row = await prisma.matchingConfig.findUnique({ where: { id: "default" } });
  if (!row) return { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, updatedAt: null };
  return { weights: coerceWeights(row.weights), thresholds: coerceThresholds(row.thresholds), updatedAt: row.updatedAt };
}

export async function saveMatchingConfig(weights: Weights, thresholds: Partial<Thresholds>, actor: Actor) {
  const v = validateWeights(weights);
  if (!v.ok) throw new Error(v.errors.join("; "));
  const merged = coerceThresholds({ ...DEFAULT_THRESHOLDS, ...thresholds });
  const before = await getMatchingConfig();
  return prisma.$transaction(async (tx) => {
    const row = await tx.matchingConfig.upsert({
      where: { id: "default" },
      create: { id: "default", weights, thresholds: merged, updatedById: actor.id ?? null },
      update: { weights, thresholds: merged, updatedById: actor.id ?? null },
    });
    await audit(actor, { action: "config.matching", entityType: "MatchingConfig", entityId: "default", before, after: { weights, thresholds: merged } }, tx);
    return row;
  });
}

// ───────────── Loading engine input from the database ─────────────

export function toEngineRequest(r: EventRequest & { facility: Facility | null }): EngineRequest {
  const hr = (r.hardRequirements ?? {}) as Partial<HardRequirements>;
  return {
    id: r.id,
    facilityId: r.facilityId ?? "",
    startAt: r.startAt,
    durationMinutes: r.durationMinutes,
    setupBufferMinutes: r.setupBufferMinutes,
    timezone: r.timezone,
    serviceType: r.serviceType,
    programTags: r.programTags,
    facilityType: r.facility?.facilityType ?? "",
    facilityAudienceTags: r.facility?.audienceTags ?? [],
    preferredGenres: r.facility?.preferredGenres ?? [],
    expectedAttendance: r.expectedAttendance,
    budgetCeiling: decimalToNumber(r.budgetCeiling),
    lat: r.lat ?? r.facility?.lat ?? null,
    lng: r.lng ?? r.facility?.lng ?? null,
    hardRequirements: {
      therapeuticQualifications: hr.therapeuticQualifications ?? [],
      certifications: hr.certifications ?? [],
      backgroundCheckRequired: hr.backgroundCheckRequired ?? true,
      insuranceRequired: hr.insuranceRequired ?? true,
      audienceTags: hr.audienceTags ?? [],
      programRequirements: hr.programRequirements ?? [],
    },
  };
}

export async function loadEngineMusicians(req: EngineRequest, thresholds: Thresholds): Promise<EngineMusician[]> {
  const rotationSince = new Date(Date.now() - thresholds.rotationWindowDays * 86_400_000);
  const dayStart = new Date(req.startAt.getTime() - 36 * 3_600_000);
  const dayEnd = new Date(req.startAt.getTime() + 36 * 3_600_000);
  const musicians = await prisma.musician.findMany({
    include: {
      preferences: { where: { facilityId: req.facilityId } },
      matches: {
        where: {
          selected: true,
          eventRequestId: { not: req.id },
          OR: [
            { status: { in: ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED"] }, eventRequest: { startAt: { gte: dayStart, lte: dayEnd } } },
            { status: { in: ["CONFIRMED", "COMPLETED"] }, eventRequest: { startAt: { gte: rotationSince } } },
            { status: "COMPLETED", facilityId: req.facilityId },
          ],
        },
        include: { eventRequest: { select: { startAt: true, durationMinutes: true } } },
      },
    },
  });
  return musicians.map((m) => toEngineMusician(m, req, rotationSince, dayStart, dayEnd));
}

type MusicianWithRels = Musician & {
  preferences: { kind: "PREFERRED" | "BLOCKED" }[];
  matches: { id: string; status: string; facilityId: string; travelMinutes: number | null; eventRequest: { startAt: Date; durationMinutes: number } }[];
};

export function toEngineMusician(m: MusicianWithRels, req: EngineRequest, rotationSince: Date, dayStart: Date, dayEnd: Date): EngineMusician {
  const active = ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED"];
  return {
    id: m.id,
    name: m.stageName ? `${m.stageName} (${m.firstName} ${m.lastName})` : `${m.firstName} ${m.lastName}`,
    status: m.status,
    entertainmentTypes: m.entertainmentTypes,
    genres: m.genres,
    instruments: m.instruments,
    offersInteractive: m.offersInteractive,
    therapeuticQualifications: m.therapeuticQualifications,
    audienceExperience: m.audienceExperience,
    facilityTypeExperience: m.facilityTypeExperience,
    certifications: m.certifications,
    insuranceExpiresAt: m.insuranceExpiresAt,
    backgroundCheckStatus: m.backgroundCheckStatus,
    backgroundCheckDate: m.backgroundCheckDate,
    programRequirementsMet: m.programRequirementsMet,
    standardRate: decimalToNumber(m.standardRate) ?? 0,
    rateStructure: m.rateStructure,
    minBookingMinutes: m.minBookingMinutes,
    lat: m.lat,
    lng: m.lng,
    maxTravelMiles: m.maxTravelMiles,
    travelFeeApplies: m.travelFeeApplies,
    timezone: m.timezone,
    weeklyAvailability: (m.weeklyAvailability as unknown as WeeklyWindow[]) ?? [],
    blackouts: (m.blackouts as unknown as Blackout[]) ?? [],
    completedEvents: m.completedEvents,
    cancellations: m.cancellations,
    noShows: m.noShows,
    avgRating: m.avgRating,
    ratingCount: m.ratingCount,
    avgResponseHours: m.avgResponseHours,
    responseCount: m.responseCount,
    adminRestriction: m.adminRestriction,
    restrictedUntil: m.restrictedUntil,
    existingBookings: m.matches
      .filter((x) => active.includes(x.status) && x.eventRequest.startAt >= dayStart && x.eventRequest.startAt <= dayEnd)
      .map((x) => ({ matchId: x.id, start: x.eventRequest.startAt, end: new Date(x.eventRequest.startAt.getTime() + x.eventRequest.durationMinutes * 60_000), travelMinutes: x.travelMinutes })),
    eventsAtFacility: m.matches.filter((x) => x.status === "COMPLETED" && x.facilityId === req.facilityId).length,
    recentBookings: m.matches.filter((x) => ["CONFIRMED", "COMPLETED"].includes(x.status) && x.eventRequest.startAt >= rotationSince).length,
    facilityPreference: m.preferences[0]?.kind ?? null,
  };
}

// ───────────── Stage 5: generate candidates and persist ─────────────

export async function runMatchingForRequest(eventRequestId: string, actor: Actor = SYSTEM_ACTOR, relaxations: Relaxations = {}) {
  const r = await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventRequestId }, include: { facility: true } });
  if (!r.facilityId || !r.facility) throw new Error("Request must be linked to a facility before matching");
  if (r.status === "CLOSED") throw new Error("Request is closed");
  if (r.heldAt) throw new Error("Request is on hold");
  if (r.status === "NEEDS_INFORMATION") throw new Error(`Request is missing: ${r.missingFields.join(", ")}`);

  await prisma.eventRequest.update({ where: { id: eventRequestId }, data: { status: "MATCHING" } });
  try {
    const { weights, thresholds } = await getMatchingConfig();
    const req = toEngineRequest(r);
    const musicians = await loadEngineMusicians(req, thresholds);
    const travel = await estimateTravel(
      musicians.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })),
      req.lat != null && req.lng != null ? { lat: req.lat, lng: req.lng } : null,
    );
    const result = runMatching({ request: req, musicians, travel, weights, thresholds, relaxations, now: new Date() });

    const run = await prisma.$transaction(async (tx) => {
      // Earlier unselected candidates become history; the latest run is what admins act on.
      await tx.match.updateMany({ where: { eventRequestId, selected: false, status: "RECOMMENDED" }, data: { status: "RECOMMENDED" } });
      const created = await tx.matchRun.create({
        data: {
          eventRequestId,
          triggeredById: actor.type === "USER" ? (actor.id ?? null) : null,
          weightsSnapshot: weights,
          thresholdsSnapshot: thresholds,
          relaxations,
          totalMusicians: result.totalMusicians,
          eligibleCount: result.eligibleCount,
          exclusionSummary: result.exclusionSummary,
          durationMs: result.durationMs,
        },
      });
      if (result.candidates.length) {
        await tx.match.createMany({
          data: result.candidates.map((c) => ({
            matchRunId: created.id,
            eventRequestId,
            facilityId: r.facilityId!,
            musicianId: c.musicianId,
            eligible: c.eligible,
            failedFilter: c.failedFilter ? `${c.failedFilter}${c.filterDetail ? `: ${c.filterDetail}` : ""}` : null,
            score: c.eligible ? c.score : null,
            rank: c.rank ?? null,
            subScores: { sub: c.subScores, weighted: c.weighted },
            reasons: c.reasons,
            warnings: c.warnings,
            distanceMiles: c.distanceMiles ?? null,
            travelMinutes: c.travelMinutes ?? null,
            status: "RECOMMENDED",
          })),
        });
      }
      await tx.eventRequest.update({
        where: { id: eventRequestId },
        data: { status: "AWAITING_APPROVAL", recommendedAt: r.recommendedAt ?? new Date() },
      });
      await audit(actor, {
        action: "match.run",
        entityType: "MatchRun",
        entityId: created.id,
        eventRequestId,
        after: { eligible: result.eligibleCount, total: result.totalMusicians, exclusions: result.exclusionSummary, relaxations, top: result.eligible.slice(0, 3).map((c) => ({ id: c.musicianId, score: c.score })) },
      }, tx);
      return created;
    });

    if (result.eligibleCount === 0) {
      await raiseAlert({
        type: "NO_ELIGIBLE_MUSICIAN",
        severity: "CRITICAL",
        title: `No eligible musician for ${r.reference}`,
        message: `${summarizeExclusions(result.totalMusicians, result.exclusionSummary)}. Consider re-running with an expanded radius or relaxed preferences — mandatory filters are never relaxed automatically.`,
        eventRequestId,
      });
    }
    for (const to of staffEmails()) {
      await dispatch({
        to,
        templateKey: "staff.recommendations",
        subject: `Recommendations ready for ${r.reference} (${result.eligibleCount} eligible)`,
        body: StaffNotifyEmail({ title: "Recommendations ready", lines: [`${r.facility.name}: ${result.eligibleCount} eligible of ${result.totalMusicians}.`, summarizeExclusions(result.totalMusicians, result.exclusionSummary)], url: `${process.env.APP_BASE_URL}/admin/requests/${eventRequestId}` }),
        idempotencyKey: `staff.recommendations:${run.id}:${to}`,
        eventRequestId,
      });
    }
    return { run, result };
  } catch (e) {
    await prisma.eventRequest.update({ where: { id: eventRequestId }, data: { status: "READY_TO_MATCH" } });
    await recordFailure(`Matching failed for ${r.reference}`, e, { eventRequestId });
    throw e;
  }
}

/** Preview a run without persisting (used by the weights tuning page). */
export async function previewMatching(eventRequestId: string, weights: Weights, thresholds?: Partial<Thresholds>, relaxations: Relaxations = {}) {
  const r = await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventRequestId }, include: { facility: true } });
  const cfg = await getMatchingConfig();
  const th = coerceThresholds({ ...cfg.thresholds, ...(thresholds ?? {}) });
  const req = toEngineRequest(r);
  const musicians = await loadEngineMusicians(req, th);
  const travel = await estimateTravel(musicians.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })), req.lat != null && req.lng != null ? { lat: req.lat, lng: req.lng } : null);
  return runMatching({ request: req, musicians, travel, weights, thresholds: th, relaxations, now: new Date() });
}
