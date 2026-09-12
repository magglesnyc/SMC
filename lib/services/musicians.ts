import { prisma } from "@/lib/db";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { getGeoProvider, formatAddress } from "@/lib/geo";
import { dispatch, templateText } from "@/lib/notifications/dispatcher";
import { MusicianReceivedEmail, StaffNotifyEmail } from "@/lib/emails/templates";
import { staffEmails } from "@/lib/notifications/dispatcher";
import type { MusicianApplicationInput } from "@/lib/validation/schemas";
import { findMusicianDuplicates } from "./duplicates";
import type { MusicianStatus } from "@/generated/prisma/enums";

const MUSICIAN_ACTOR = (label: string): Actor => ({ type: "MUSICIAN", label });

export async function createMusicianFromApplication(input: MusicianApplicationInput) {
  // Idempotent: a retried submission returns the record created the first time.
  const existing = await prisma.formSubmission.findUnique({ where: { submissionId: input.submissionId } });
  if (existing) {
    const m = await prisma.musician.findUnique({ where: { id: existing.entityId } });
    if (m) return { musician: m, duplicates: [], replay: true as const };
  }

  const address = formatAddress(input);
  let geo: { lat: number; lng: number } | null = null;
  try {
    geo = await getGeoProvider().geocode(address);
  } catch (e) {
    console.warn("Geocoding failed for musician application", e);
  }
  const duplicates = await findMusicianDuplicates(input);

  const musician = await prisma.$transaction(async (tx) => {
    const m = await tx.musician.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        stageName: input.stageName ?? null,
        email: input.email,
        phone: input.phone,
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        timezone: input.timezone,
        entertainmentTypes: input.entertainmentTypes,
        genres: input.genres,
        instruments: input.instruments,
        offersInteractive: input.offersInteractive || input.entertainmentTypes.includes("INTERACTIVE_SESSION"),
        therapeuticQualifications: input.therapeuticQualifications,
        audienceExperience: input.audienceExperience,
        facilityTypeExperience: input.facilityTypeExperience,
        certifications: input.certifications,
        insuranceCarrier: input.insuranceCarrier ?? null,
        insurancePolicyNumber: input.insurancePolicyNumber ?? null,
        insuranceExpiresAt: input.insuranceExpiresAt ? new Date(`${input.insuranceExpiresAt}T00:00:00Z`) : null,
        backgroundCheckStatus: input.backgroundCheckStatus,
        standardRate: input.standardRate,
        rateStructure: input.rateStructure,
        minBookingMinutes: input.minBookingMinutes,
        maxTravelMiles: input.maxTravelMiles,
        travelFeeApplies: input.travelFeeApplies,
        weeklyAvailability: input.weeklyAvailability,
        blackouts: input.blackouts,
        status: "SUBMITTED",
        possibleDuplicate: duplicates.length > 0,
        duplicateOfId: duplicates[0]?.id ?? null,
      },
    });
    await tx.formSubmission.create({ data: { submissionId: input.submissionId, formType: "MUSICIAN_APPLICATION", entityId: m.id } });
    await audit(MUSICIAN_ACTOR(`${m.firstName} ${m.lastName}`), { action: "musician.applied", entityType: "Musician", entityId: m.id, after: { status: m.status, possibleDuplicate: m.possibleDuplicate } }, tx);
    return m;
  });

  // Notify review team + acknowledge applicant (outside the transaction; idempotent by key).
  const name = `${musician.firstName} ${musician.lastName}`;
  if (duplicates.length) {
    await raiseAlert({
      type: "DUPLICATE",
      severity: "INFO",
      title: `Possible duplicate musician: ${name}`,
      message: duplicates.map((d) => `${d.label} — ${d.reasons.join(", ")}`).join("\n"),
      musicianId: musician.id,
    });
  }
  await raiseAlert({ type: "NEW_MUSICIAN", severity: "INFO", title: `New musician application: ${name}`, message: `Review services, credentials, geography and rate, then approve.`, musicianId: musician.id });
  const t = await templateText("musician.received", {
    subject: "We received your application — Senior Music Connection",
    intro: "Thank you for applying to perform with Senior Music Connection.",
  });
  await dispatch({
    to: musician.email,
    templateKey: "musician.received",
    subject: t.subject,
    body: MusicianReceivedEmail({ name: musician.firstName, intro: t.intro }),
    idempotencyKey: `musician.received:${musician.id}`,
  });
  for (const to of staffEmails()) {
    await dispatch({
      to,
      templateKey: "staff.new_musician",
      subject: `New musician application: ${name}`,
      body: StaffNotifyEmail({ title: "New musician application", lines: [`${name} (${musician.city}, ${musician.state}) applied.`, duplicates.length ? "Flagged as a possible duplicate." : "No duplicates detected."], url: `${process.env.APP_BASE_URL}/admin/musicians/${musician.id}` }),
      idempotencyKey: `staff.new_musician:${musician.id}:${to}`,
    });
  }
  return { musician, duplicates, replay: false as const };
}

const TRANSITIONS: Record<MusicianStatus, MusicianStatus[]> = {
  SUBMITTED: ["REVIEW", "INACTIVE"],
  REVIEW: ["APPROVED", "INACTIVE", "SUBMITTED"],
  APPROVED: ["ACTIVE", "INACTIVE", "REVIEW"],
  ACTIVE: ["INACTIVE", "SUSPENDED"],
  INACTIVE: ["ACTIVE", "REVIEW"],
  SUSPENDED: ["ACTIVE", "INACTIVE"],
};

export async function setMusicianStatus(id: string, status: MusicianStatus, actor: Actor, note?: string) {
  const m = await prisma.musician.findUniqueOrThrow({ where: { id } });
  if (!TRANSITIONS[m.status].includes(status)) {
    throw new Error(`Cannot move musician from ${m.status} to ${status}`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.musician.update({
      where: { id },
      data: {
        status,
        ...(status === "APPROVED" ? { approvedAt: new Date(), approvedById: actor.id ?? null } : {}),
        ...(note ? { privateNotes: [m.privateNotes, `[${new Date().toISOString()}] ${note}`].filter(Boolean).join("\n") } : {}),
      },
    });
    await audit(actor, { action: "musician.status", entityType: "Musician", entityId: id, before: { status: m.status }, after: { status, note } }, tx);
    return u;
  });
  if (status === "ACTIVE" || status === "INACTIVE") {
    await prisma.alert.updateMany({ where: { musicianId: id, type: "NEW_MUSICIAN", resolvedAt: null }, data: { resolvedAt: new Date(), resolvedById: actor.id ?? null, resolutionNote: `Musician set to ${status}` } });
  }
  return updated;
}

export async function setMusicianRestriction(id: string, restriction: string | null, until: Date | null, actor: Actor) {
  const m = await prisma.musician.findUniqueOrThrow({ where: { id } });
  return prisma.$transaction(async (tx) => {
    const u = await tx.musician.update({ where: { id }, data: { adminRestriction: restriction, restrictedUntil: until } });
    await audit(actor, { action: "musician.restriction", entityType: "Musician", entityId: id, before: { adminRestriction: m.adminRestriction, restrictedUntil: m.restrictedUntil }, after: { adminRestriction: restriction, restrictedUntil: until } }, tx);
    return u;
  });
}

/** Recompute denormalised performance history from matches and feedback. */
export async function recomputeMusicianStats(musicianId: string) {
  const [completed, cancelled, noShow, ratings, responses] = await Promise.all([
    prisma.match.count({ where: { musicianId, status: "COMPLETED" } }),
    prisma.match.count({ where: { musicianId, exceptionStatus: "CANCELLED", selected: true } }),
    prisma.match.count({ where: { musicianId, exceptionStatus: "NO_SHOW" } }),
    prisma.feedback.aggregate({ where: { musicianId, kind: "CLIENT", rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.match.findMany({ where: { musicianId, offeredAt: { not: null }, musicianRespondedAt: { not: null } }, select: { offeredAt: true, musicianRespondedAt: true } }),
  ]);
  const hours = responses.map((r) => (r.musicianRespondedAt!.getTime() - r.offeredAt!.getTime()) / 3_600_000);
  const avgResponseHours = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null;
  return prisma.musician.update({
    where: { id: musicianId },
    data: {
      completedEvents: completed,
      cancellations: cancelled,
      noShows: noShow,
      avgRating: ratings._avg.rating ?? null,
      ratingCount: ratings._count.rating,
      avgResponseHours,
      responseCount: hours.length,
    },
  });
}

export async function updateMusicianCoordinates(id: string, lat: number, lng: number, actor: Actor = SYSTEM_ACTOR) {
  const m = await prisma.musician.findUniqueOrThrow({ where: { id } });
  return prisma.$transaction(async (tx) => {
    const u = await tx.musician.update({ where: { id }, data: { lat, lng } });
    await audit(actor, { action: "musician.geocoded", entityType: "Musician", entityId: id, before: { lat: m.lat, lng: m.lng }, after: { lat, lng } }, tx);
    return u;
  });
}
