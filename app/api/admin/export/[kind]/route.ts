import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/utils";

const KINDS = ["requests", "musicians", "facilities", "bookings", "matches", "feedback", "audit"] as const;
type Kind = (typeof KINDS)[number];

/** CSV exports. Administrators only (contact details and ratings are restricted by role). */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/export/[kind]">) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { kind } = await ctx.params;
  if (!KINDS.includes(kind as Kind)) return NextResponse.json({ error: "unknown export" }, { status: 404 });

  let rows: Record<string, unknown>[] = [];
  switch (kind as Kind) {
    case "requests":
      rows = (await prisma.eventRequest.findMany({ include: { facility: { select: { name: true } } }, orderBy: { startAt: "desc" } })).map((r) => ({ reference: r.reference, facility: r.facility?.name ?? "", status: r.status, startAt: r.startAt, durationMinutes: r.durationMinutes, serviceType: r.serviceType, budgetCeiling: r.budgetCeiling?.toString(), expectedAttendance: r.expectedAttendance, missingFields: r.missingFields.join("|"), submittedAt: r.submittedAt, readyAt: r.readyAt, recommendedAt: r.recommendedAt, closedAt: r.closedAt, closeReason: r.closeReason }));
      break;
    case "musicians":
      rows = (await prisma.musician.findMany({ orderBy: { lastName: "asc" } })).map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`, stageName: m.stageName, email: m.email, phone: m.phone, city: m.city, status: m.status, entertainmentTypes: m.entertainmentTypes.join("|"), genres: m.genres.join("|"), rate: m.standardRate.toString(), rateStructure: m.rateStructure, maxTravelMiles: m.maxTravelMiles, backgroundCheck: m.backgroundCheckStatus, insuranceExpiresAt: m.insuranceExpiresAt, completedEvents: m.completedEvents, cancellations: m.cancellations, noShows: m.noShows, avgRating: m.avgRating, avgResponseHours: m.avgResponseHours }));
      break;
    case "facilities":
      rows = (await prisma.facility.findMany({ orderBy: { name: "asc" } })).map((f) => ({ id: f.id, name: f.name, type: f.facilityType, city: f.city, contact: f.primaryContactName, email: f.primaryContactEmail, phone: f.primaryContactPhone, audienceTags: f.audienceTags.join("|"), preferredGenres: f.preferredGenres.join("|"), budgetMin: f.budgetMin?.toString(), budgetMax: f.budgetMax?.toString(), status: f.status }));
      break;
    case "bookings":
      rows = (await prisma.match.findMany({ where: { selected: true }, include: { eventRequest: true, musician: true, facility: true }, orderBy: { eventRequest: { startAt: "desc" } } })).map((m) => ({ reference: m.eventRequest.reference, startAt: m.eventRequest.startAt, facility: m.facility.name, musician: `${m.musician.firstName} ${m.musician.lastName}`, status: m.status, exception: m.exceptionStatus, score: m.score, rank: m.rank, override: m.isOverride, overrideReason: m.overrideReason, offeredAt: m.offeredAt, musicianResponse: m.musicianResponse, musicianRespondedAt: m.musicianRespondedAt, facilityResponse: m.facilityResponse, facilityRespondedAt: m.facilityRespondedAt, confirmedAt: m.confirmedAt, completedAt: m.completedAt }));
      break;
    case "matches":
      rows = (await prisma.match.findMany({ include: { eventRequest: { select: { reference: true } }, musician: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 5000 })).map((m) => ({ reference: m.eventRequest.reference, runId: m.matchRunId, musician: `${m.musician.firstName} ${m.musician.lastName}`, eligible: m.eligible, failedFilter: m.failedFilter, rank: m.rank, score: m.score, subScores: JSON.stringify((m.subScores as { sub?: unknown }).sub ?? {}), reasons: (m.reasons as string[]).join(" | "), warnings: (m.warnings as string[]).join(" | "), selected: m.selected, override: m.isOverride, createdAt: m.createdAt }));
      break;
    case "feedback":
      rows = (await prisma.feedback.findMany({ include: { eventRequest: { select: { reference: true } }, musician: { select: { firstName: true, lastName: true } }, facility: { select: { name: true } } }, orderBy: { createdAt: "desc" } })).map((f) => ({ reference: f.eventRequest.reference, kind: f.kind, facility: f.facility.name, musician: `${f.musician.firstName} ${f.musician.lastName}`, status: f.status, rating: f.rating, secondaryRatings: JSON.stringify(f.secondaryRatings), issues: f.issues.join("|"), comments: f.comments, followUpRequired: f.followUpRequired, sentAt: f.sentAt, submittedAt: f.submittedAt }));
      break;
    case "audit":
      rows = (await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20000 })).map((a) => ({ createdAt: a.createdAt, actorType: a.actorType, actor: a.actorLabel, action: a.action, entityType: a.entityType, entityId: a.entityId, eventRequestId: a.eventRequestId, before: a.before, after: a.after }));
      break;
  }
  await audit({ type: "USER", id: session.user.id, label: `${session.user.name} (admin)` }, { action: "export.csv", entityType: "Export", entityId: kind, after: { rows: rows.length } });
  const csv = toCsv(rows);
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="smc-${kind}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
