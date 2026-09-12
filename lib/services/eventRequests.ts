import { fromZonedTime } from "date-fns-tz";
import { prisma, type Tx } from "@/lib/db";
import { audit, SYSTEM_ACTOR, type Actor } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { getGeoProvider, formatAddress } from "@/lib/geo";
import { dispatch, staffEmails, templateText } from "@/lib/notifications/dispatcher";
import { NeedsInformationEmail, RequestReceivedEmail, StaffNotifyEmail } from "@/lib/emails/templates";
import { matchCriticalMissing, type EventRequestInput } from "@/lib/validation/schemas";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/matching/types";
import { fmtDateTime, decimalToNumber } from "@/lib/utils";
import { findFacilityDuplicates } from "./duplicates";
import { nextEventReference } from "./references";
import type { EventRequest, Facility } from "@/generated/prisma/client";

const FACILITY_ACTOR = (label: string): Actor => ({ type: "FACILITY", label });

export function eventSummary(r: EventRequest & { facility: Facility | null }, extra: { musicianName?: string; rate?: string } = {}) {
  const f = r.facility;
  const intake = (r.intakeFacility ?? {}) as Record<string, string>;
  return {
    reference: r.reference,
    facilityName: f?.name ?? intake.facilityName ?? "Facility",
    when: fmtDateTime(r.startAt, r.timezone),
    durationMinutes: r.durationMinutes,
    location: formatAddress({ addressLine1: r.locationAddressLine1 ?? f?.addressLine1, city: r.locationCity ?? f?.city, state: r.locationState ?? f?.state, postalCode: r.locationPostalCode ?? f?.postalCode }),
    service: SERVICE_TYPE_LABELS[r.serviceType as ServiceType] ?? r.serviceType,
    contactName: f?.primaryContactName ?? intake.contactName ?? "",
    contactEmail: f?.primaryContactEmail ?? intake.contactEmail,
    ...extra,
  };
}

export function facilityContactEmail(r: EventRequest & { facility: Facility | null }): string | null {
  const intake = (r.intakeFacility ?? {}) as Record<string, string>;
  return r.facility?.primaryContactEmail ?? intake.contactEmail ?? null;
}

/**
 * Stage 3: public form → Event Request, linked to an existing facility or routed to review.
 * Stage 4: immediately evaluated for Ready to Match / Needs Information.
 */
export async function createEventRequestFromForm(input: EventRequestInput) {
  const existing = await prisma.formSubmission.findUnique({ where: { submissionId: input.submissionId } });
  if (existing) {
    const r = await prisma.eventRequest.findUnique({ where: { id: existing.entityId }, include: { facility: true } });
    if (r) return { request: r, replay: true as const };
  }

  // Link to a facility: explicit id, or a confident duplicate match; otherwise route to review.
  let facility: Facility | null = null;
  if (input.facilityId) facility = await prisma.facility.findUnique({ where: { id: input.facilityId } });
  if (!facility) {
    const dupes = await findFacilityDuplicates({ name: input.facilityName, addressLine1: input.addressLine1, postalCode: input.postalCode, contactEmail: input.contactEmail });
    if (dupes[0] && dupes[0].confidence >= 0.8) facility = await prisma.facility.findUnique({ where: { id: dupes[0].id } });
  }

  const startAt = fromZonedTime(`${input.date}T${input.startTime}:00`, input.timezone);
  let lat = facility?.lat ?? null;
  let lng = facility?.lng ?? null;
  if (lat == null || lng == null) {
    try {
      const geo = await getGeoProvider().geocode(formatAddress(input));
      if (geo) ({ lat, lng } = geo);
    } catch (e) {
      console.warn("Geocoding failed for event request", e);
    }
  }

  const request = await prisma.$transaction(async (tx) => {
    const reference = await nextEventReference(tx);
    const r = await tx.eventRequest.create({
      data: {
        reference,
        facilityId: facility?.id ?? null,
        intakeFacility: facility
          ? undefined
          : {
              facilityName: input.facilityName,
              facilityType: input.facilityType,
              contactName: input.contactName,
              contactRole: input.contactRole,
              contactEmail: input.contactEmail,
              contactPhone: input.contactPhone,
              addressLine1: input.addressLine1,
              city: input.city,
              state: input.state,
              postalCode: input.postalCode,
            },
        startAt,
        durationMinutes: input.durationMinutes,
        setupBufferMinutes: input.setupBufferMinutes,
        timezone: input.timezone,
        serviceType: input.serviceType,
        programTags: Array.from(new Set([...input.programTags, ...input.preferredGenres])),
        audienceDescription: input.audienceDescription ?? null,
        expectedAttendance: input.expectedAttendance ?? null,
        budgetCeiling: input.budgetCeiling ?? null,
        locationAddressLine1: input.addressLine1,
        locationCity: input.city,
        locationState: input.state,
        locationPostalCode: input.postalCode,
        lat,
        lng,
        hardRequirements: { ...input.hardRequirements, audienceTags: Array.from(new Set([...input.hardRequirements.audienceTags, ...input.audienceTags])) },
        notes: input.notes ?? null,
        status: "SUBMITTED",
      },
      include: { facility: true },
    });
    await tx.formSubmission.create({ data: { submissionId: input.submissionId, formType: "EVENT_REQUEST", entityId: r.id } });
    await audit(FACILITY_ACTOR(input.contactName), { action: "request.submitted", entityType: "EventRequest", entityId: r.id, eventRequestId: r.id, after: { reference: r.reference, facilityId: r.facilityId } }, tx);
    return r;
  });

  if (!facility) {
    await raiseAlert({ type: "UNMATCHED_FACILITY", title: `New facility needs review: ${input.facilityName}`, message: `Event ${request.reference} came from a facility not in the system. Create or link the facility record to continue.`, eventRequestId: request.id });
  }
  const t = await templateText("request.received", { subject: "We received your event request", intro: "Thank you for your event request. Here is what we have on file:" });
  await dispatch({ to: input.contactEmail, templateKey: "request.received", subject: `${t.subject} (${request.reference})`, body: RequestReceivedEmail({ e: eventSummary(request), intro: t.intro }), idempotencyKey: `request.received:${request.id}`, eventRequestId: request.id });
  for (const to of staffEmails()) {
    await dispatch({ to, templateKey: "staff.new_request", subject: `New event request ${request.reference}`, body: StaffNotifyEmail({ title: "New event request", lines: [`${input.facilityName} requested ${SERVICE_TYPE_LABELS[input.serviceType]} on ${fmtDateTime(startAt, input.timezone)}.`], url: `${process.env.APP_BASE_URL}/admin/requests/${request.id}` }), idempotencyKey: `staff.new_request:${request.id}:${to}`, eventRequestId: request.id });
  }

  const advanced = await evaluateReadiness(request.id, SYSTEM_ACTOR);
  return { request: advanced, replay: false as const };
}

/**
 * Stage 4: validate match-critical fields. Ready to Match when complete; otherwise Needs
 * Information with a follow-up to the facility. Safe to call repeatedly.
 */
export async function evaluateReadiness(id: string, actor: Actor) {
  const r = await prisma.eventRequest.findUniqueOrThrow({ where: { id }, include: { facility: true } });
  if (["MATCHING", "AWAITING_APPROVAL", "CLOSED"].includes(r.status)) return r;
  if (r.heldAt) return r;
  const missing = matchCriticalMissing({
    facilityId: r.facilityId,
    startAt: r.startAt,
    durationMinutes: r.durationMinutes,
    serviceType: r.serviceType,
    lat: r.lat,
    lng: r.lng,
    budgetCeiling: r.budgetCeiling,
    expectedAttendance: r.expectedAttendance,
  });
  const nextStatus = missing.length ? "NEEDS_INFORMATION" : "READY_TO_MATCH";
  if (nextStatus === r.status && JSON.stringify(missing) === JSON.stringify(r.missingFields)) return r;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.eventRequest.update({
      where: { id },
      data: { status: nextStatus, missingFields: missing, readyAt: nextStatus === "READY_TO_MATCH" ? (r.readyAt ?? new Date()) : r.readyAt },
      include: { facility: true },
    });
    await audit(actor, { action: "request.status", entityType: "EventRequest", entityId: id, eventRequestId: id, before: { status: r.status, missingFields: r.missingFields }, after: { status: nextStatus, missingFields: missing } }, tx);
    return u;
  });

  if (nextStatus === "NEEDS_INFORMATION") {
    const facilityMissing = missing.filter((m) => !["linked facility", "geocoded event location"].includes(m));
    await raiseAlert({ type: "NEEDS_INFORMATION", title: `${r.reference} needs information`, message: `Missing: ${missing.join(", ")}`, eventRequestId: id });
    const to = facilityContactEmail(updated);
    if (to && facilityMissing.length) {
      const t = await templateText("request.needs_information", { subject: "A few details needed for your event request", intro: "Thanks again for your request. Before we can match a musician, we need a little more information." });
      await dispatch({ to, templateKey: "request.needs_information", subject: `${t.subject} (${r.reference})`, body: NeedsInformationEmail({ e: eventSummary(updated), intro: t.intro, missing: facilityMissing }), idempotencyKey: `request.needs_information:${id}:${facilityMissing.join("|")}`, eventRequestId: id });
    }
  } else {
    await prisma.alert.updateMany({ where: { eventRequestId: id, type: "NEEDS_INFORMATION", resolvedAt: null }, data: { resolvedAt: new Date(), resolutionNote: "Request became Ready to Match" } });
  }
  return updated;
}

export interface EventRequestUpdate {
  facilityId?: string | null;
  startAt?: Date;
  durationMinutes?: number;
  setupBufferMinutes?: number;
  serviceType?: string;
  programTags?: string[];
  audienceDescription?: string | null;
  expectedAttendance?: number | null;
  budgetCeiling?: number | null;
  lat?: number | null;
  lng?: number | null;
  hardRequirements?: unknown;
  notes?: string | null;
  ownerId?: string | null;
}

export async function updateEventRequest(id: string, data: EventRequestUpdate, actor: Actor) {
  const before = await prisma.eventRequest.findUniqueOrThrow({ where: { id } });
  // Linking a facility copies its coordinates unless the request has its own.
  let coords: { lat?: number | null; lng?: number | null } = {};
  if (data.facilityId && data.facilityId !== before.facilityId && (before.lat == null || before.lng == null) && data.lat == null) {
    const f = await prisma.facility.findUnique({ where: { id: data.facilityId } });
    if (f) coords = { lat: f.lat, lng: f.lng };
  }
  await prisma.$transaction(async (tx) => {
    await tx.eventRequest.update({
      where: { id },
      data: {
        ...data,
        ...coords,
        hardRequirements: data.hardRequirements === undefined ? undefined : (data.hardRequirements as object),
        intakeFacility: data.facilityId ? undefined : undefined,
      },
    });
    await audit(actor, { action: "request.updated", entityType: "EventRequest", entityId: id, eventRequestId: id, before: pick(before, Object.keys(data)), after: { ...data, ...coords } }, tx);
  });
  if (data.facilityId) {
    await prisma.alert.updateMany({ where: { eventRequestId: id, type: "UNMATCHED_FACILITY", resolvedAt: null }, data: { resolvedAt: new Date(), resolvedById: actor.id ?? null, resolutionNote: "Facility linked" } });
  }
  return evaluateReadiness(id, actor);
}

export async function holdEventRequest(id: string, reason: string, actor: Actor) {
  const r = await prisma.eventRequest.findUniqueOrThrow({ where: { id } });
  return prisma.$transaction(async (tx) => {
    const u = await tx.eventRequest.update({ where: { id }, data: { heldAt: new Date(), holdReason: reason } });
    await audit(actor, { action: "request.hold", entityType: "EventRequest", entityId: id, eventRequestId: id, before: { heldAt: r.heldAt }, after: { holdReason: reason } }, tx);
    return u;
  });
}

export async function releaseEventRequest(id: string, actor: Actor) {
  const r = await prisma.eventRequest.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    await tx.eventRequest.update({ where: { id }, data: { heldAt: null, holdReason: null } });
    await audit(actor, { action: "request.release", entityType: "EventRequest", entityId: id, eventRequestId: id, before: { holdReason: r.holdReason }, after: { heldAt: null } }, tx);
  });
  return evaluateReadiness(id, actor);
}

export async function closeEventRequest(id: string, reason: string, actor: Actor, tx?: Tx) {
  const db = tx ?? prisma;
  const r = await db.eventRequest.findUniqueOrThrow({ where: { id } });
  const u = await db.eventRequest.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closeReason: reason } });
  await audit(actor, { action: "request.closed", entityType: "EventRequest", entityId: id, eventRequestId: id, before: { status: r.status }, after: { status: "CLOSED", reason } }, tx);
  return u;
}

function pick<T extends object>(obj: T, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = (obj as Record<string, unknown>)[k];
  return out as Partial<T>;
}

export { decimalToNumber };
