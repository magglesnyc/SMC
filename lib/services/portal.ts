import { prisma } from "@/lib/db";
import { haversineMiles } from "@/lib/geo";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/matching/types";
import { decimalToNumber } from "@/lib/utils";

/**
 * Read models for the two self-service portals. Everything here is scoped to one owner id that the
 * caller takes from the session, and each shape deliberately omits the other party's private data
 * (contact details, notes, insurance, budgets).
 */

const LIVE = ["OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED"] as const;

export const musicianName = (m: { firstName: string; lastName: string; stageName: string | null }) => m.stageName ?? `${m.firstName} ${m.lastName}`;
export const serviceLabel = (s: string) => SERVICE_TYPE_LABELS[s as ServiceType] ?? s;

const bookingInclude = {
  eventRequest: { select: { id: true, reference: true, startAt: true, durationMinutes: true, timezone: true, serviceType: true, programTags: true, expectedAttendance: true, notes: true, locationAddressLine1: true, locationCity: true, locationState: true, locationPostalCode: true } },
  facility: { select: { id: true, name: true, facilityType: true, addressLine1: true, city: true, state: true, postalCode: true, timezone: true, roomType: true, equipment: true, hasPiano: true, hasPower: true, parkingNotes: true, loadInNotes: true, primaryContactName: true, typicalGroupSize: true, audienceTags: true } },
  musician: { select: { id: true, firstName: true, lastName: true, stageName: true, city: true, state: true, genres: true, instruments: true, entertainmentTypes: true, avgRating: true, ratingCount: true, completedEvents: true } },
  feedback: { select: { id: true, kind: true, status: true, rating: true, comments: true, submittedAt: true } },
} as const;

export type PortalBooking = Awaited<ReturnType<typeof loadBookings>>[number];

async function loadBookings(where: { facilityId?: string; musicianId?: string }, which: "upcoming" | "past" | "all") {
  const now = new Date();
  return prisma.match.findMany({
    where: {
      ...where,
      selected: true,
      OR: [{ exceptionStatus: null }, { exceptionStatus: "NO_SHOW" }],
      ...(which === "upcoming" ? { status: { in: [...LIVE] }, eventRequest: { startAt: { gte: now } } } : {}),
      ...(which === "past" ? { OR: [{ status: "COMPLETED" }, { exceptionStatus: "NO_SHOW" }, { status: "CONFIRMED", eventRequest: { startAt: { lt: now } } }] } : {}),
    },
    include: bookingInclude,
    orderBy: { eventRequest: { startAt: which === "past" ? "desc" : "asc" } },
  });
}

export function bookingState(b: PortalBooking): { label: string; tone: "success" | "warning" | "info" | "neutral" | "danger" } {
  if (b.exceptionStatus === "NO_SHOW") return { label: "No-show", tone: "danger" };
  if (b.status === "COMPLETED") return { label: "Completed", tone: "neutral" };
  if (b.status === "CONFIRMED") return { label: "Confirmed", tone: "success" };
  if (b.status === "PARTIALLY_ACCEPTED") return { label: "Awaiting other party", tone: "info" };
  if (b.status === "OFFERED") return { label: "Awaiting confirmation", tone: "warning" };
  return { label: b.status, tone: "neutral" };
}

export function bookingEnd(b: PortalBooking) {
  return new Date(b.eventRequest.startAt.getTime() + b.eventRequest.durationMinutes * 60_000);
}

export const feedbackFor = (b: PortalBooking, kind: "CLIENT" | "MUSICIAN") => b.feedback.find((f) => f.kind === kind) ?? null;
export const canRate = (b: PortalBooking) => b.status === "COMPLETED" || b.exceptionStatus === "NO_SHOW";

// ───────────────────────── Facility (community) portal ─────────────────────────

export async function facilityHome(facilityId: string) {
  const [facility, upcoming, past, requests, preferences] = await Promise.all([
    prisma.facility.findUniqueOrThrow({ where: { id: facilityId } }),
    loadBookings({ facilityId }, "upcoming"),
    loadBookings({ facilityId }, "past"),
    prisma.eventRequest.findMany({ where: { facilityId, status: { not: "CLOSED" } }, orderBy: { startAt: "asc" }, select: { id: true, reference: true, startAt: true, timezone: true, serviceType: true, status: true, durationMinutes: true, matches: { where: { selected: true }, select: { id: true } } } }),
    prisma.facilityMusicianPreference.findMany({ where: { facilityId }, include: { musician: { select: { id: true, firstName: true, lastName: true, stageName: true, genres: true, avgRating: true, ratingCount: true } } } }),
  ]);
  const toRate = past.filter((b) => canRate(b) && !feedbackFor(b, "CLIENT")?.submittedAt);
  return { facility, upcoming, past, requests: requests.filter((r) => r.matches.length === 0), toRate, preferences };
}

export interface BrowseFilters {
  q?: string;
  genre?: string;
  service?: string;
  interactive?: boolean;
}

/**
 * Performers a community could book: active roster members whose travel radius reaches the
 * community (straight-line estimate; the matching engine does the real travel check later).
 */
export async function facilityBrowseMusicians(facilityId: string, filters: BrowseFilters = {}) {
  const facility = await prisma.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { id: true, lat: true, lng: true, state: true, preferredGenres: true } });
  const [musicians, history, prefs] = await Promise.all([
    prisma.musician.findMany({
      where: { status: "ACTIVE", OR: [{ restrictedUntil: null }, { restrictedUntil: { lt: new Date() } }] },
      select: { id: true, firstName: true, lastName: true, stageName: true, city: true, state: true, lat: true, lng: true, genres: true, instruments: true, entertainmentTypes: true, offersInteractive: true, therapeuticQualifications: true, audienceExperience: true, standardRate: true, rateStructure: true, travelFeeApplies: true, maxTravelMiles: true, backgroundCheckStatus: true, avgRating: true, ratingCount: true, completedEvents: true },
    }),
    prisma.match.groupBy({ by: ["musicianId"], where: { facilityId, selected: true, status: "COMPLETED" }, _count: { _all: true } }),
    prisma.facilityMusicianPreference.findMany({ where: { facilityId } }),
  ]);
  const booked = new Map(history.map((h) => [h.musicianId, h._count._all]));
  const pref = new Map(prefs.map((p) => [p.musicianId, p.kind]));
  const q = filters.q?.trim().toLowerCase();

  const rows = musicians
    .map((m) => {
      const distance = facility.lat != null && facility.lng != null && m.lat != null && m.lng != null ? Math.round(haversineMiles({ lat: facility.lat, lng: facility.lng }, { lat: m.lat, lng: m.lng })) : null;
      return { ...m, standardRate: decimalToNumber(m.standardRate) ?? 0, distance, timesBooked: booked.get(m.id) ?? 0, preference: pref.get(m.id) ?? null, name: musicianName(m) };
    })
    .filter((m) => m.preference !== "BLOCKED")
    .filter((m) => (m.distance == null ? m.state === facility.state : m.distance <= m.maxTravelMiles))
    .filter((m) => !filters.genre || m.genres.includes(filters.genre))
    .filter((m) => !filters.service || m.entertainmentTypes.includes(filters.service))
    .filter((m) => !filters.interactive || m.offersInteractive)
    .filter((m) => !q || [m.name, m.city, ...m.genres, ...m.instruments].some((s) => s.toLowerCase().includes(q)));

  // Familiar faces first, then preferred, then by rating and distance.
  rows.sort((a, b) => (b.preference === "PREFERRED" ? 1 : 0) - (a.preference === "PREFERRED" ? 1 : 0) || b.timesBooked - a.timesBooked || (b.avgRating ?? 0) - (a.avgRating ?? 0) || (a.distance ?? 999) - (b.distance ?? 999));
  return { facility, rows };
}

export async function facilityMusicianProfile(facilityId: string, musicianId: string) {
  const [musician, history, pref, reviews] = await Promise.all([
    prisma.musician.findFirst({ where: { id: musicianId, status: { in: ["ACTIVE", "APPROVED"] } }, select: { id: true, firstName: true, lastName: true, stageName: true, city: true, state: true, genres: true, instruments: true, entertainmentTypes: true, offersInteractive: true, therapeuticQualifications: true, audienceExperience: true, facilityTypeExperience: true, certifications: true, standardRate: true, rateStructure: true, minBookingMinutes: true, travelFeeApplies: true, maxTravelMiles: true, backgroundCheckStatus: true, insuranceExpiresAt: true, avgRating: true, ratingCount: true, completedEvents: true, weeklyAvailability: true } }),
    prisma.match.findMany({ where: { facilityId, musicianId, selected: true, OR: [{ exceptionStatus: null }, { exceptionStatus: "NO_SHOW" }] }, include: bookingInclude, orderBy: { eventRequest: { startAt: "desc" } } }),
    prisma.facilityMusicianPreference.findUnique({ where: { facilityId_musicianId: { facilityId, musicianId } } }),
    prisma.feedback.findMany({ where: { musicianId, kind: "CLIENT", submittedAt: { not: null } }, orderBy: { submittedAt: "desc" }, take: 8, select: { id: true, rating: true, comments: true, submittedAt: true, facilityId: true, facility: { select: { name: true, city: true } } } }),
  ]);
  if (!musician) return null;
  return { musician: { ...musician, standardRate: decimalToNumber(musician.standardRate) ?? 0, name: musicianName(musician) }, history, preference: pref?.kind ?? null, reviews: reviews.map((r) => ({ ...r, mine: r.facilityId === facilityId })) };
}

/** A completed booking this community may rate, or null. */
export async function facilityFeedbackTarget(facilityId: string, matchId: string) {
  const b = await prisma.match.findFirst({ where: { id: matchId, facilityId, selected: true }, include: bookingInclude });
  if (!b || !canRate(b)) return null;
  return b;
}

// ───────────────────────── Musician portal ─────────────────────────

export async function musicianHome(musicianId: string) {
  const [musician, upcoming, past, reviews] = await Promise.all([
    prisma.musician.findUniqueOrThrow({ where: { id: musicianId } }),
    loadBookings({ musicianId }, "upcoming"),
    loadBookings({ musicianId }, "past"),
    prisma.feedback.findMany({ where: { musicianId, kind: "CLIENT", submittedAt: { not: null } }, orderBy: { submittedAt: "desc" }, take: 5, select: { id: true, rating: true, comments: true, submittedAt: true, facility: { select: { name: true, city: true } } } }),
  ]);
  const offers = upcoming.filter((b) => (b.status === "OFFERED" || b.status === "PARTIALLY_ACCEPTED") && b.musicianResponse == null);
  const toRate = past.filter((b) => canRate(b) && !feedbackFor(b, "MUSICIAN")?.submittedAt);
  return { musician, offers, upcoming, past, toRate, reviews };
}

/** Every community on the musician's schedule, with the next date and full address. */
export async function musicianVenues(musicianId: string) {
  const all = await loadBookings({ musicianId }, "all");
  const now = new Date();
  const byFacility = new Map<string, { facility: PortalBooking["facility"]; next: PortalBooking | null; upcoming: PortalBooking[]; completed: number; myRating: number | null }>();
  for (const b of all) {
    const v = byFacility.get(b.facilityId) ?? { facility: b.facility, next: null, upcoming: [], completed: 0, myRating: null };
    if (b.eventRequest.startAt >= now && LIVE.includes(b.status as (typeof LIVE)[number])) {
      v.upcoming.push(b);
      if (!v.next || b.eventRequest.startAt < v.next.eventRequest.startAt) v.next = b;
    }
    if (b.status === "COMPLETED") v.completed++;
    const mine = feedbackFor(b, "MUSICIAN");
    if (mine?.rating && v.myRating == null) v.myRating = mine.rating;
    byFacility.set(b.facilityId, v);
  }
  return [...byFacility.values()].sort((a, b) => (a.next?.eventRequest.startAt.getTime() ?? Infinity) - (b.next?.eventRequest.startAt.getTime() ?? Infinity) || b.completed - a.completed);
}

export async function musicianReviews(musicianId: string) {
  const [received, given] = await Promise.all([
    prisma.feedback.findMany({ where: { musicianId, kind: "CLIENT", submittedAt: { not: null } }, orderBy: { submittedAt: "desc" }, include: { facility: { select: { name: true, city: true, state: true } }, eventRequest: { select: { reference: true, startAt: true, timezone: true, serviceType: true } } } }),
    prisma.feedback.findMany({ where: { musicianId, kind: "MUSICIAN", submittedAt: { not: null } }, orderBy: { submittedAt: "desc" }, include: { facility: { select: { name: true, city: true, state: true } }, eventRequest: { select: { reference: true, startAt: true, timezone: true, serviceType: true } } } }),
  ]);
  const dist = [1, 2, 3, 4, 5].map((n) => ({ stars: n, count: received.filter((r) => r.rating === n).length }));
  return { received, given, distribution: dist };
}

export async function musicianFeedbackTarget(musicianId: string, matchId: string) {
  const b = await prisma.match.findFirst({ where: { id: matchId, musicianId, selected: true }, include: bookingInclude });
  if (!b || !canRate(b)) return null;
  return b;
}

/** A booking the owner may respond to from the portal (offer still open). */
export async function respondableBooking(owner: { musicianId?: string; facilityId?: string }, matchId: string) {
  const b = await prisma.match.findFirst({ where: { id: matchId, ...owner, selected: true, exceptionStatus: null, status: { in: ["OFFERED", "PARTIALLY_ACCEPTED"] } }, include: bookingInclude });
  if (!b) return null;
  const answered = owner.musicianId ? b.musicianResponse != null : b.facilityResponse != null;
  return answered ? null : b;
}
