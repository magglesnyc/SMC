import { prisma } from "@/lib/db";
import { audit, type Actor } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { getGeoProvider, formatAddress } from "@/lib/geo";
import { findFacilityDuplicates } from "./duplicates";
import { updateEventRequest } from "./eventRequests";
import type { PreferenceKind } from "@/generated/prisma/enums";

export interface FacilityInput {
  name: string;
  facilityType: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  timezone?: string;
  primaryContactName: string;
  primaryContactRole?: string | null;
  primaryContactEmail: string;
  primaryContactPhone?: string | null;
  audienceTags?: string[];
  preferredGenres?: string[];
  typicalGroupSize?: number | null;
  residentPopulation?: string | null;
  roomType?: string | null;
  hasPiano?: boolean;
  parkingNotes?: string | null;
  loadInNotes?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export async function createFacility(input: FacilityInput, actor: Actor) {
  let lat = input.lat ?? null;
  let lng = input.lng ?? null;
  if (lat == null || lng == null) {
    try {
      const geo = await getGeoProvider().geocode(formatAddress(input));
      if (geo) ({ lat, lng } = geo);
    } catch (e) {
      console.warn("Geocoding failed for facility", e);
    }
  }
  const dupes = await findFacilityDuplicates({ name: input.name, addressLine1: input.addressLine1, postalCode: input.postalCode, contactEmail: input.primaryContactEmail });
  const f = await prisma.$transaction(async (tx) => {
    const created = await tx.facility.create({
      data: {
        name: input.name,
        facilityType: input.facilityType,
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        timezone: input.timezone ?? "America/New_York",
        lat,
        lng,
        primaryContactName: input.primaryContactName,
        primaryContactRole: input.primaryContactRole ?? null,
        primaryContactEmail: input.primaryContactEmail,
        primaryContactPhone: input.primaryContactPhone ?? null,
        audienceTags: input.audienceTags ?? [],
        preferredGenres: input.preferredGenres ?? [],
        typicalGroupSize: input.typicalGroupSize ?? null,
        residentPopulation: input.residentPopulation ?? null,
        roomType: input.roomType ?? null,
        hasPiano: input.hasPiano ?? false,
        parkingNotes: input.parkingNotes ?? null,
        loadInNotes: input.loadInNotes ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        possibleDuplicate: dupes.length > 0,
        status: "ACTIVE",
      },
    });
    await audit(actor, { action: "facility.created", entityType: "Facility", entityId: created.id, after: { name: created.name, possibleDuplicate: created.possibleDuplicate } }, tx);
    return created;
  });
  if (dupes.length) {
    await raiseAlert({ type: "DUPLICATE", severity: "INFO", title: `Possible duplicate facility: ${f.name}`, message: dupes.map((d) => `${d.label} — ${d.reasons.join(", ")}`).join("\n") });
  }
  return f;
}

/** Create a facility from an unlinked event request's intake details and link it. */
export async function createFacilityFromIntake(eventRequestId: string, actor: Actor) {
  const r = await prisma.eventRequest.findUniqueOrThrow({ where: { id: eventRequestId } });
  const intake = (r.intakeFacility ?? {}) as Record<string, string | undefined>;
  if (!intake.facilityName) throw new Error("No intake facility details on this request");
  const f = await createFacility(
    {
      name: intake.facilityName,
      facilityType: intake.facilityType ?? "other",
      addressLine1: intake.addressLine1 ?? "",
      city: intake.city ?? "",
      state: intake.state ?? "",
      postalCode: intake.postalCode ?? "",
      timezone: r.timezone,
      primaryContactName: intake.contactName ?? "",
      primaryContactRole: intake.contactRole ?? null,
      primaryContactEmail: intake.contactEmail ?? "",
      primaryContactPhone: intake.contactPhone ?? null,
      lat: r.lat,
      lng: r.lng,
    },
    actor,
  );
  await updateEventRequest(eventRequestId, { facilityId: f.id, lat: f.lat, lng: f.lng }, actor);
  return f;
}

export async function updateFacility(id: string, data: Partial<FacilityInput> & { privateNotes?: string | null; status?: "ACTIVE" | "INACTIVE" | "PENDING_REVIEW" }, actor: Actor) {
  const before = await prisma.facility.findUniqueOrThrow({ where: { id } });
  return prisma.$transaction(async (tx) => {
    const u = await tx.facility.update({ where: { id }, data });
    await audit(actor, { action: "facility.updated", entityType: "Facility", entityId: id, before: Object.fromEntries(Object.keys(data).map((k) => [k, (before as Record<string, unknown>)[k]])), after: data }, tx);
    return u;
  });
}

export async function setFacilityPreference(facilityId: string, musicianId: string, kind: PreferenceKind | null, actor: Actor, note?: string) {
  await prisma.$transaction(async (tx) => {
    if (kind === null) {
      await tx.facilityMusicianPreference.deleteMany({ where: { facilityId, musicianId } });
    } else {
      await tx.facilityMusicianPreference.upsert({
        where: { facilityId_musicianId: { facilityId, musicianId } },
        create: { facilityId, musicianId, kind, note },
        update: { kind, note },
      });
    }
    await audit(actor, { action: "facility.preference", entityType: "Facility", entityId: facilityId, after: { musicianId, kind, note } }, tx);
  });
}
