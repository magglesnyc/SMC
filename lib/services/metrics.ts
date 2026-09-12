import { prisma } from "@/lib/db";
import type { FilterCode } from "@/lib/matching";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

export async function pipelineCounts() {
  const rows = await prisma.eventRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const held = await prisma.eventRequest.count({ where: { heldAt: { not: null }, status: { not: "CLOSED" } } });
  return { byStatus: Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>, held };
}

export async function agingByStatus() {
  const open = await prisma.eventRequest.findMany({ where: { status: { not: "CLOSED" } }, select: { status: true, updatedAt: true, submittedAt: true } });
  const now = Date.now();
  const buckets: Record<string, { count: number; avgDays: number; maxDays: number }> = {};
  for (const r of open) {
    const days = (now - r.updatedAt.getTime()) / 86_400_000;
    const b = (buckets[r.status] ??= { count: 0, avgDays: 0, maxDays: 0 });
    b.count++;
    b.avgDays += days;
    b.maxDays = Math.max(b.maxDays, days);
  }
  for (const b of Object.values(buckets)) b.avgDays = b.count ? b.avgDays / b.count : 0;
  return buckets;
}

export async function pendingActions() {
  const [awaitingApproval, awaitingResponse, needsInfo, unmatchedFacility, newMusicians, openAlerts, followUps] = await Promise.all([
    prisma.eventRequest.count({ where: { status: "AWAITING_APPROVAL", heldAt: null, matches: { none: { selected: true, status: { in: ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED"] }, exceptionStatus: null } } } }),
    prisma.match.count({ where: { status: { in: ["OFFERED", "PARTIALLY_ACCEPTED"] }, exceptionStatus: null } }),
    prisma.eventRequest.count({ where: { status: "NEEDS_INFORMATION" } }),
    prisma.eventRequest.count({ where: { facilityId: null, status: { not: "CLOSED" } } }),
    prisma.musician.count({ where: { status: { in: ["SUBMITTED", "REVIEW"] } } }),
    prisma.alert.count({ where: { resolvedAt: null } }),
    prisma.feedback.count({ where: { status: "FOLLOW_UP_REQUIRED" } }),
  ]);
  return { awaitingApproval, awaitingResponse, needsInfo, unmatchedFacility, newMusicians, openAlerts, followUps };
}

export async function responseTracking(sinceDays = 90) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await prisma.match.findMany({ where: { offeredAt: { gte: since } }, select: { offeredAt: true, musicianRespondedAt: true, facilityRespondedAt: true, confirmedAt: true } });
  const musician = rows.filter((r) => r.musicianRespondedAt).map((r) => hours(r.offeredAt!, r.musicianRespondedAt!));
  const facility = rows.filter((r) => r.facilityRespondedAt).map((r) => hours(r.offeredAt!, r.facilityRespondedAt!));
  const both = rows.filter((r) => r.musicianRespondedAt && r.facilityRespondedAt).map((r) => Math.max(hours(r.offeredAt!, r.musicianRespondedAt!), hours(r.offeredAt!, r.facilityRespondedAt!)));
  const within48 = both.filter((h) => h <= 48).length;
  return {
    offers: rows.length,
    musician: { responded: musician.length, medianHours: median(musician), avgHours: musician.length ? musician.reduce((a, b) => a + b, 0) / musician.length : null },
    facility: { responded: facility.length, medianHours: median(facility), avgHours: facility.length ? facility.reduce((a, b) => a + b, 0) / facility.length : null },
    bothWithin48hPct: both.length ? Math.round((within48 / both.length) * 100) : null,
    bothMedianHours: median(both),
  };
}

export async function outcomes(sinceDays = 365) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const selected = await prisma.match.findMany({ where: { selected: true, OR: [{ status: { in: ["CONFIRMED", "COMPLETED"] } }, { exceptionStatus: { in: ["CANCELLED", "NO_SHOW"] } }], createdAt: { gte: since } }, select: { status: true, exceptionStatus: true } });
  const completed = selected.filter((m) => m.status === "COMPLETED" && !m.exceptionStatus).length;
  const cancelled = selected.filter((m) => m.exceptionStatus === "CANCELLED").length;
  const noShow = selected.filter((m) => m.exceptionStatus === "NO_SHOW").length;
  const confirmedUpcoming = selected.filter((m) => m.status === "CONFIRMED" && !m.exceptionStatus).length;
  const ratings = await prisma.feedback.groupBy({ by: ["rating"], where: { kind: "CLIENT", rating: { not: null }, submittedAt: { gte: since } }, _count: { _all: true } });
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) if (r.rating) dist[r.rating] = r._count._all;
  const total = completed + cancelled + noShow;
  return {
    completed,
    cancelled,
    noShow,
    confirmedUpcoming,
    completionRatePct: total ? Math.round((completed / total) * 100) : null,
    cancellationRatePct: total ? Math.round(((cancelled + noShow) / total) * 100) : null,
    ratingDistribution: dist,
  };
}

export async function matchQuality(sinceDays = 365) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const approved = await prisma.match.findMany({ where: { approvedAt: { gte: since } }, select: { isOverride: true, score: true, rank: true, overrideReason: true } });
  const runs = await prisma.matchRun.findMany({ where: { createdAt: { gte: since } }, select: { exclusionSummary: true, eligibleCount: true, totalMusicians: true, durationMs: true } });
  const exclusions: Partial<Record<FilterCode, number>> = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries((r.exclusionSummary ?? {}) as Record<string, number>)) exclusions[k as FilterCode] = (exclusions[k as FilterCode] ?? 0) + v;
  }
  const overrides = approved.filter((a) => a.isOverride);
  return {
    approvals: approved.length,
    overrides: overrides.length,
    overrideRatePct: approved.length ? Math.round((overrides.length / approved.length) * 100) : null,
    avgApprovedScore: approved.length ? Math.round((approved.reduce((s, a) => s + (a.score ?? 0), 0) / approved.length) * 10) / 10 : null,
    avgApprovedRank: approved.length ? Math.round((approved.reduce((s, a) => s + (a.rank ?? 0), 0) / approved.length) * 10) / 10 : null,
    runs: runs.length,
    avgEligible: runs.length ? Math.round((runs.reduce((s, r) => s + r.eligibleCount, 0) / runs.length) * 10) / 10 : null,
    exclusions,
    overrideReasons: overrides.map((o) => o.overrideReason).filter(Boolean) as string[],
  };
}

/** Target metrics from the spec, instrumented from day one. */
export async function targetMetrics() {
  const requests = await prisma.eventRequest.findMany({ where: { readyAt: { not: null }, recommendedAt: { not: null } }, select: { readyAt: true, recommendedAt: true } });
  const readyToRec = requests.map((r) => (r.recommendedAt!.getTime() - r.readyAt!.getTime()) / 60_000);
  const closedIds = await prisma.match.findMany({ where: { status: "COMPLETED" }, select: { eventRequestId: true } });
  const touches: number[] = [];
  for (const { eventRequestId } of closedIds.slice(0, 200)) {
    touches.push(await prisma.auditLog.count({ where: { eventRequestId, actorType: "USER" } }));
  }
  const traceability = await prisma.eventRequest.findMany({ where: { status: "CLOSED", closeReason: "Booking confirmed" }, select: { id: true, _count: { select: { matches: true, feedback: true } } } });
  const audited = await prisma.auditLog.groupBy({ by: ["eventRequestId"], where: { eventRequestId: { in: traceability.map((t) => t.id) } }, _count: { _all: true } });
  const auditedIds = new Set(audited.map((a) => a.eventRequestId));
  const complete = traceability.filter((t) => t._count.matches > 0 && auditedIds.has(t.id)).length;
  const responses = await responseTracking(365);
  return {
    medianMinutesReadyToRecommendation: median(readyToRec),
    medianAdminTouchesPerCompletedEvent: median(touches),
    consistency: { matchRunsWithReasons: await prisma.match.count({ where: { eligible: true } }), totalEligibleCandidates: await prisma.match.count({ where: { eligible: true, NOT: { reasons: { equals: [] } } } }) },
    responsesWithin48hPct: responses.bothWithin48hPct,
    traceability: { confirmedEvents: traceability.length, withCompleteTrail: complete },
  };
}
