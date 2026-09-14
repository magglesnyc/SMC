import "dotenv/config";
import { hash } from "bcryptjs";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { prisma } from "../lib/db";
import { DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, runMatching, type EngineMusician } from "../lib/matching";
import { estimateTravel } from "../lib/geo";
import { toEngineMusician, toEngineRequest, runMatchingForRequest } from "../lib/services/matching";
import { evaluateReadiness } from "../lib/services/eventRequests";
import { approveMatch, recordManualResponse, scheduleFeedbackRows } from "../lib/services/bookings";
import { recomputeMusicianStats } from "../lib/services/musicians";
import { SYSTEM_ACTOR } from "../lib/audit";
import type { Facility } from "../generated/prisma/client";

// ───────────── Deterministic PRNG so the seed is reproducible ─────────────
let seed = 20260911;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const sample = <T,>(arr: readonly T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const FIRST = ["Maria", "James", "Linda", "Robert", "Patricia", "David", "Barbara", "Michael", "Elizabeth", "William", "Jennifer", "Richard", "Susan", "Joseph", "Karen", "Thomas", "Nancy", "Charles", "Lisa", "Daniel", "Sandra", "Paul", "Donna", "Mark", "Carol", "Steven", "Ruth", "Kenneth", "Sharon", "Andrew", "Michelle", "Joshua", "Laura", "Kevin", "Sarah", "Brian", "Kimberly", "George", "Deborah", "Edward"];
const LAST = ["Alvarez", "Baker", "Chen", "Delgado", "Evans", "Foster", "Garcia", "Hughes", "Ibarra", "Jensen", "Kowalski", "Lopez", "Martin", "Nguyen", "Ortiz", "Patel", "Quinn", "Reyes", "Sullivan", "Torres", "Underwood", "Vance", "Walker", "Xu", "Young", "Zimmerman", "Bennett", "Castillo", "Dunn", "Ellis", "Flores", "Grant", "Hayes", "Ingram", "Jordan", "Kim", "Lambert", "Morales", "Navarro", "Owens"];
const STAGE = ["The Desert Swingers", "Piano Man Phoenix", "Sonoran Strings", "Golden Oldies Duo", "Camelback Jazz Trio", "Mesa Harmonies", "Saguaro Serenade", "Silver Notes", "Two for the Road", "Cactus Country Band"];

type City = { lat: number; lng: number; postal: string; state: string; tz: string; metro: string };
const CITIES: Record<string, City> = {
  // Phoenix, AZ
  Phoenix: { lat: 33.4484, lng: -112.074, postal: "85004", state: "AZ", tz: "America/Phoenix", metro: "phoenix" },
  Scottsdale: { lat: 33.4942, lng: -111.9261, postal: "85251", state: "AZ", tz: "America/Phoenix", metro: "phoenix" },
  Tempe: { lat: 33.4255, lng: -111.94, postal: "85281", state: "AZ", tz: "America/Phoenix", metro: "phoenix" },
  Mesa: { lat: 33.4152, lng: -111.8315, postal: "85201", state: "AZ", tz: "America/Phoenix", metro: "phoenix" },
  Chandler: { lat: 33.3062, lng: -111.8413, postal: "85224", state: "AZ", tz: "America/Phoenix", metro: "phoenix" },
  Glendale: { lat: 33.5387, lng: -112.186, postal: "85301", state: "AZ", tz: "America/Phoenix", metro: "phoenix" },
  "Sun City": { lat: 33.5975, lng: -112.2718, postal: "85351", state: "AZ", tz: "America/Phoenix", metro: "phoenix" },
  // Columbus, OH
  Columbus: { lat: 39.9612, lng: -82.9988, postal: "43215", state: "OH", tz: "America/New_York", metro: "columbus" },
  Dublin: { lat: 40.0992, lng: -83.1141, postal: "43017", state: "OH", tz: "America/New_York", metro: "columbus" },
  Westerville: { lat: 40.1262, lng: -82.929, postal: "43081", state: "OH", tz: "America/New_York", metro: "columbus" },
  Grove_City: { lat: 39.8815, lng: -83.0929, postal: "43123", state: "OH", tz: "America/New_York", metro: "columbus" },
  Upper_Arlington: { lat: 40.0073, lng: -83.0624, postal: "43221", state: "OH", tz: "America/New_York", metro: "columbus" },
  // Tampa Bay, FL
  Tampa: { lat: 27.9506, lng: -82.4572, postal: "33602", state: "FL", tz: "America/New_York", metro: "tampa" },
  "St. Petersburg": { lat: 27.7676, lng: -82.6403, postal: "33701", state: "FL", tz: "America/New_York", metro: "tampa" },
  Clearwater: { lat: 27.9659, lng: -82.8001, postal: "33755", state: "FL", tz: "America/New_York", metro: "tampa" },
  Brandon: { lat: 27.9378, lng: -82.2859, postal: "33511", state: "FL", tz: "America/New_York", metro: "tampa" },
  // Minneapolis–St. Paul, MN
  Minneapolis: { lat: 44.9778, lng: -93.265, postal: "55401", state: "MN", tz: "America/Chicago", metro: "twincities" },
  "St. Paul": { lat: 44.9537, lng: -93.09, postal: "55101", state: "MN", tz: "America/Chicago", metro: "twincities" },
  Bloomington: { lat: 44.8408, lng: -93.2983, postal: "55420", state: "MN", tz: "America/Chicago", metro: "twincities" },
  Edina: { lat: 44.8897, lng: -93.3499, postal: "55424", state: "MN", tz: "America/Chicago", metro: "twincities" },
  // Portland, OR
  Portland: { lat: 45.5152, lng: -122.6784, postal: "97204", state: "OR", tz: "America/Los_Angeles", metro: "portland" },
  Beaverton: { lat: 45.487, lng: -122.8037, postal: "97005", state: "OR", tz: "America/Los_Angeles", metro: "portland" },
  Gresham: { lat: 45.5001, lng: -122.4302, postal: "97030", state: "OR", tz: "America/Los_Angeles", metro: "portland" },
  "Lake Oswego": { lat: 45.4207, lng: -122.6706, postal: "97034", state: "OR", tz: "America/Los_Angeles", metro: "portland" },
};
const cityName = (k: string) => k.replace(/_/g, " ");
const jitter = (v: number) => v + (rnd() - 0.5) * 0.06;

const GENRES = ["standards", "jazz", "big-band", "classical", "country", "folk", "gospel", "hymns", "oldies", "rock-n-roll", "motown", "broadway", "latin", "bluegrass", "blues", "patriotic"];
const INSTRUMENTS = ["vocals", "piano", "keyboard", "guitar", "ukulele", "violin", "cello", "harp", "flute", "saxophone", "trumpet", "accordion", "banjo", "harmonica"];
const AUD = ["independent-living", "assisted-living", "memory-care", "skilled-nursing", "limited-mobility", "hearing-support", "small-group", "large-group", "bedside"];
const FTYPES = ["independent-living", "assisted-living", "memory-care", "skilled-nursing", "adult-day", "senior-center"];

function localDate(daysFromNow: number, hour: number, tz = "America/New_York", minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  const ymd = formatInTimeZone(d, tz, "yyyy-MM-dd");
  return fromZonedTime(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`, tz);
}

/** Next date (>= daysFromNow) that falls on one of the given local weekdays in the given zone. */
function nextWeekday(daysFromNow: number, weekdays: number[], hour: number, tz: string): Date {
  for (let i = 0; i < 14; i++) {
    const d = localDate(daysFromNow + i, hour, tz);
    if (weekdays.includes(Number(formatInTimeZone(d, tz, "i")) % 7)) return d;
  }
  return localDate(daysFromNow, hour, tz);
}

async function main() {
  console.log("Resetting data…");
  await prisma.$transaction([
    prisma.notificationLog.deleteMany(),
    prisma.responseToken.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.match.deleteMany(),
    prisma.matchRun.deleteMany(),
    prisma.eventRequest.deleteMany(),
    prisma.facilityMusicianPreference.deleteMany(),
    prisma.facility.deleteMany(),
    prisma.musician.deleteMany(),
    prisma.formSubmission.deleteMany(),
    prisma.notificationTemplate.deleteMany(),
    prisma.matchingConfig.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  // The audit log is append-only by design (DB trigger); it is preserved across reseeds.

  // Demo logins (see /demo). Change these before any real deployment.
  const admin = await prisma.user.create({ data: { email: "admin@smc.test", name: "Alex Admin", passwordHash: await hash("demo-admin", 10), role: "ADMIN" } });
  await prisma.user.create({ data: { email: "scheduler@smc.test", name: "Sam Scheduler", passwordHash: await hash("demo-scheduler", 10), role: "STAFF" } });
  await prisma.user.create({ data: { email: "staff@smc.test", name: "Jordan Staff", passwordHash: await hash("demo-staff", 10), role: "STAFF" } });
  await prisma.matchingConfig.create({ data: { id: "default", weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, updatedById: admin.id } });
  const adminActor = { type: "USER" as const, id: admin.id, label: "Alex Admin (admin) [seed]" };

  // ───────────── Musicians (42) ─────────────
  console.log("Creating musicians…");
  const cities = Object.keys(CITIES);
  const musicians = [];
  const N = 60;
  for (let i = 0; i < N; i++) {
    const city = cities[i % cities.length];
    const loc = CITIES[city];
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const types = new Set<string>(["LIVE_ENTERTAINMENT"]);
    if (rnd() < 0.55) types.add("INTERACTIVE_SESSION");
    const therapy = rnd() < 0.2;
    if (therapy) types.add("MUSIC_THERAPY");
    if (rnd() < 0.25) types.add("SPECIALTY");
    const status = i < N - 8 ? "ACTIVE" : i < N - 6 ? "APPROVED" : i < N - 4 ? "SUBMITTED" : i < N - 2 ? "REVIEW" : i === N - 2 ? "INACTIVE" : "SUSPENDED";
    const weekdays = rnd() < 0.7;
    const weekends = rnd() < 0.5;
    const windows = [];
    for (let d = 1; d <= 5; d++) if (weekdays || rnd() < 0.5) windows.push({ day: d, start: pick(["09:00", "10:00", "12:00"]), end: pick(["16:00", "18:00", "20:00"]) });
    if (weekends) windows.push({ day: 6, start: "10:00", end: "17:00" }, { day: 0, start: "12:00", end: "17:00" });
    if (!windows.length) windows.push({ day: 3, start: "10:00", end: "16:00" });
    const m = await prisma.musician.create({
      data: {
        firstName: first,
        lastName: last,
        stageName: rnd() < 0.25 ? pick(STAGE) : null,
        email: `${first}.${last}${i}@example.com`.toLowerCase(),
        phone: `555-01${String(i).padStart(2, "0")}-${String(1000 + i).padStart(4, "0")}`,
        addressLine1: `${between(100, 9999)} ${pick(["N", "S", "E", "W"])} ${pick(["Central", "Camelback", "Indian School", "Thomas", "McDowell", "Bell", "Baseline", "Southern"])} ${pick(["Ave", "Rd", "St"])}`,
        city: cityName(city),
        state: loc.state,
        postalCode: loc.postal,
        lat: jitter(loc.lat),
        lng: jitter(loc.lng),
        timezone: loc.tz,
        entertainmentTypes: [...types],
        genres: sample(GENRES, between(2, 5)),
        instruments: sample(INSTRUMENTS, between(1, 3)),
        offersInteractive: types.has("INTERACTIVE_SESSION"),
        therapeuticQualifications: therapy ? [pick(["MT-BC", "Certified Music Practitioner", "Music & Memory Certified"])] : rnd() < 0.15 ? ["Dementia Care Specialist"] : [],
        audienceExperience: sample(AUD, between(2, 5)),
        facilityTypeExperience: sample(FTYPES, between(1, 4)),
        certifications: rnd() < 0.6 ? ["CPR/First Aid"] : [],
        insuranceCarrier: rnd() < 0.9 ? pick(["State Farm", "Hiscox", "Next Insurance", "Thimble"]) : null,
        insurancePolicyNumber: `POL-${between(100000, 999999)}`,
        insuranceExpiresAt: rnd() < 0.9 ? localDate(between(40, 400), 0) : localDate(between(-30, 20), 0),
        backgroundCheckStatus: rnd() < 0.85 ? "CLEARED" : rnd() < 0.5 ? "PENDING" : "NONE",
        backgroundCheckDate: localDate(-between(30, 700), 0),
        standardRate: between(20, 60) * 5,
        rateStructure: rnd() < 0.8 ? "PER_EVENT" : "PER_HOUR",
        minBookingMinutes: pick([30, 45, 60]),
        maxTravelMiles: pick([15, 20, 25, 30, 40, 50]),
        travelFeeApplies: rnd() < 0.3,
        weeklyAvailability: windows,
        blackouts: rnd() < 0.3 ? [{ start: localDate(between(3, 40), 0).toISOString(), end: localDate(between(41, 50), 0).toISOString(), reason: pick(["Vacation", "Family", "Tour"]) }] : [],
        status,
        adminRestriction: i === N - 1 ? "Suspended pending review of a facility complaint" : null,
        approvedAt: ["ACTIVE", "APPROVED"].includes(status) ? localDate(-between(60, 500), 0) : null,
        approvedById: ["ACTIVE", "APPROVED"].includes(status) ? admin.id : null,
      },
    });
    musicians.push(m);
  }

  // ───────────── Facilities (14) ─────────────
  console.log("Creating facilities…");
  const FAC_NAMES = ["Desert Bloom Senior Living", "Camelback Gardens", "Sunrise Terrace", "Palo Verde Memory Care", "Scioto Ridge Assisted Living", "Buckeye Commons", "Olentangy Village", "Bayshore Skilled Nursing", "Gulf Breeze Community Center", "Suncoast Adult Day Program", "Lakeview Pines", "Mississippi Heritage House", "Rose City Residences", "Willamette Care Center", "Cascade Terrace", "Chandler Adult Day Program"];
  const facilities: Facility[] = [];
  const FAC_CITIES = ["Phoenix", "Scottsdale", "Tempe", "Mesa", "Columbus", "Dublin", "Westerville", "Tampa", "St. Petersburg", "Clearwater", "Minneapolis", "St. Paul", "Portland", "Beaverton", "Gresham", "Chandler"];
  for (let i = 0; i < FAC_NAMES.length; i++) {
    const city = FAC_CITIES[i];
    const loc = CITIES[city];
    const ftype = i === 3 ? "memory-care" : i === 7 ? "skilled-nursing" : i === 8 ? "senior-center" : i === 9 || i === 15 ? "adult-day" : pick(["assisted-living", "independent-living"]);
    const f = await prisma.facility.create({
      data: {
        name: FAC_NAMES[i],
        facilityType: ftype,
        addressLine1: `${between(100, 9999)} ${pick(["E", "W", "N"])} ${pick(["Shea", "Broadway", "Guadalupe", "Elliot", "Warner", "Union Hills", "Greenway"])} ${pick(["Blvd", "Rd", "Dr"])}`,
        city: cityName(city),
        state: loc.state,
        postalCode: loc.postal,
        lat: jitter(loc.lat),
        lng: jitter(loc.lng),
        timezone: loc.tz,
        primaryContactName: `${pick(FIRST)} ${pick(LAST)}`,
        primaryContactRole: pick(["Activity Director", "Life Enrichment Coordinator", "Program Manager"]),
        primaryContactEmail: `activities${i}@example.org`,
        primaryContactPhone: `555-02${String(i).padStart(2, "0")}-${String(2000 + i).padStart(4, "0")}`,
        residentPopulation: pick(["~60 residents", "~120 residents", "~40 residents", "~200 residents"]),
        typicalGroupSize: pick([15, 25, 35, 50]),
        audienceTags: Array.from(new Set([ftype === "memory-care" ? "memory-care" : ftype === "skilled-nursing" ? "skilled-nursing" : ftype === "independent-living" ? "independent-living" : "assisted-living", ...sample(["limited-mobility", "hearing-support", "small-group", "large-group"], between(1, 2))])),
        roomType: pick(["Main lounge", "Dining room", "Activity room", "Courtyard (shaded)"]),
        equipment: sample(["PA system", "microphone", "projector", "chairs"], between(1, 3)),
        hasPower: true,
        hasPiano: rnd() < 0.5,
        parkingNotes: pick(["Visitor lot at the front entrance", "Street parking; loading zone by the side door", "Staff lot behind the building"]),
        loadInNotes: pick(["Check in at reception; the activity room is down the main hall", "Use the east entrance; ramp available", "Call the activity director on arrival"]),
        preferredGenres: sample(GENRES, between(1, 3)),
        budgetMin: pick([100, 125, 150]),
        budgetMax: pick([175, 200, 250, 300]),
      },
    });
    facilities.push(f);
  }
  // Preferences: a few preferred / blocked musicians
  const active = musicians.filter((m) => m.status === "ACTIVE");
  await prisma.facilityMusicianPreference.createMany({
    data: [
      { facilityId: facilities[0].id, musicianId: active[0].id, kind: "PREFERRED", note: "Residents ask for them by name" },
      { facilityId: facilities[1].id, musicianId: active[3].id, kind: "PREFERRED" },
      { facilityId: facilities[4].id, musicianId: active[5].id, kind: "BLOCKED", note: "Volume complaints; do not rebook" },
      { facilityId: facilities[2].id, musicianId: active[8].id, kind: "PREFERRED" },
    ],
  });

  // ───────────── Historical requests (18, completed) ─────────────
  console.log("Creating historical events…");
  let refN = 1;
  const ref = () => `EV-${new Date().getUTCFullYear()}-${String(refN++).padStart(4, "0")}`;
  const historical: { requestId: string; musicianId: string; rank: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const f = facilities[i % facilities.length];
    const daysAgo = between(10, 240);
    const startAt = nextWeekday(-daysAgo, [1, 2, 3, 4, 5], pick([10, 13, 14, 15]), f.timezone);
    const serviceType = rnd() < 0.7 ? "LIVE_ENTERTAINMENT" : rnd() < 0.6 ? "INTERACTIVE_SESSION" : "SPECIALTY";
    const r = await prisma.eventRequest.create({
      data: {
        reference: ref(),
        facilityId: f.id,
        startAt,
        durationMinutes: pick([45, 60, 60, 90]),
        setupBufferMinutes: 30,
        timezone: f.timezone,
        serviceType,
        programTags: sample(f.preferredGenres, 1),
        audienceDescription: "Residents gathered in the main lounge.",
        expectedAttendance: f.typicalGroupSize,
        budgetCeiling: f.budgetMax,
        lat: f.lat,
        lng: f.lng,
        locationAddressLine1: f.addressLine1,
        locationCity: f.city,
        locationState: f.state,
        locationPostalCode: f.postalCode,
        hardRequirements: { therapeuticQualifications: [], certifications: [], backgroundCheckRequired: true, insuranceRequired: true, audienceTags: f.facilityType === "memory-care" ? ["memory-care"] : [], programRequirements: [] },
        status: "CLOSED",
        closeReason: "Booking confirmed",
        submittedAt: new Date(startAt.getTime() - 21 * 86_400_000),
        readyAt: new Date(startAt.getTime() - 21 * 86_400_000 + 3_600_000),
        recommendedAt: new Date(startAt.getTime() - 21 * 86_400_000 + 2 * 3_600_000),
        closedAt: new Date(startAt.getTime() - 14 * 86_400_000),
      },
      include: { facility: true },
    });
    // Run the pure engine as of the historical date and persist the run.
    const req = toEngineRequest(r);
    const engineMusicians: EngineMusician[] = musicians.map((m) => toEngineMusician({ ...m, preferences: [], matches: [] }, req, new Date(0), new Date(0), new Date(0)));
    const travel = await estimateTravel(engineMusicians.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })), { lat: req.lat!, lng: req.lng! });
    const result = runMatching({ request: req, musicians: engineMusicians, travel, weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, now: new Date(startAt.getTime() - 20 * 86_400_000) });
    if (!result.eligible.length) {
      await prisma.eventRequest.delete({ where: { id: r.id } });
      refN--;
      continue;
    }
    // Simulate the historical human decision: usually the top candidate, sometimes 2nd/3rd with a reason.
    const chosenRank = rnd() < 0.7 ? 1 : Math.min(result.eligible.length, rnd() < 0.6 ? 2 : 3);
    const chosen = result.eligible[chosenRank - 1];
    const offeredAt = new Date(startAt.getTime() - 20 * 86_400_000);
    const run = await prisma.matchRun.create({ data: { eventRequestId: r.id, triggeredById: admin.id, weightsSnapshot: DEFAULT_WEIGHTS, thresholdsSnapshot: DEFAULT_THRESHOLDS, totalMusicians: result.totalMusicians, eligibleCount: result.eligibleCount, exclusionSummary: result.exclusionSummary, durationMs: result.durationMs, createdAt: r.recommendedAt! } });
    await prisma.match.createMany({
      data: result.candidates.map((c) => {
        const isChosen = c.musicianId === chosen.musicianId;
        const cancelled = isChosen && i === 5;
        const noShow = isChosen && i === 11;
        return {
          matchRunId: run.id,
          eventRequestId: r.id,
          facilityId: f.id,
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
          selected: isChosen,
          approvedById: isChosen ? admin.id : null,
          approvedAt: isChosen ? offeredAt : null,
          isOverride: isChosen && chosenRank !== 1,
          overrideReason: isChosen && chosenRank !== 1 ? pick(["Facility asked for a piano act", "Top candidate had a tentative conflict", "Rotation: give a newer musician a chance", "Facility preferred a familiar face"]) : null,
          musicianResponse: isChosen ? "ACCEPTED" : null,
          musicianRespondedAt: isChosen ? new Date(offeredAt.getTime() + between(1, 40) * 3_600_000) : null,
          facilityResponse: isChosen ? "ACCEPTED" : null,
          facilityRespondedAt: isChosen ? new Date(offeredAt.getTime() + between(2, 60) * 3_600_000) : null,
          status: isChosen ? (cancelled ? "CONFIRMED" : "COMPLETED") : "RECOMMENDED",
          exceptionStatus: cancelled ? "CANCELLED" : noShow ? "NO_SHOW" : null,
          exceptionReason: cancelled ? "MUSICIAN: illness, 36h notice" : noShow ? "Did not arrive; facility called at start time" : null,
          offeredAt: isChosen ? offeredAt : null,
          confirmedAt: isChosen ? new Date(offeredAt.getTime() + 60 * 3_600_000) : null,
          completedAt: isChosen && !cancelled ? new Date(startAt.getTime() + 2 * 3_600_000) : null,
          createdAt: r.recommendedAt!,
        };
      }),
    });
    const sel = await prisma.match.findFirstOrThrow({ where: { eventRequestId: r.id, selected: true } });
    historical.push({ requestId: r.id, musicianId: chosen.musicianId, rank: chosenRank });
    if (sel.status === "COMPLETED") {
      const rating = i === 11 ? 1 : rnd() < 0.15 ? between(2, 3) : between(4, 5);
      const followUp = rating <= 3;
      const sentAt = new Date(startAt.getTime() + 3 * 3_600_000);
      await prisma.feedback.createMany({
        data: [
          {
            kind: "CLIENT" as const,
            matchId: sel.id,
            eventRequestId: r.id,
            facilityId: f.id,
            musicianId: chosen.musicianId,
            rating,
            secondaryRatings: { engagement: Math.min(5, rating + 1), punctuality: rating, professionalism: Math.min(5, rating + 1) },
            comments: rating >= 4 ? pick(["Residents loved it and sang along.", "Wonderful energy, please send them again.", "Great song choices for our group."]) : pick(["Volume was too loud for the room.", "Arrived late and setup ran into the program time."]),
            issues: rating >= 4 ? [] : [pick(["volume", "late-arrival", "song-selection"])],
            followUpRequired: followUp,
            status: (i % 4 === 0 ? "SENT" : followUp ? "FOLLOW_UP_REQUIRED" : "SUBMITTED") as "SENT" | "FOLLOW_UP_REQUIRED" | "SUBMITTED",
            sentAt,
            submittedAt: i % 4 === 0 ? null : new Date(startAt.getTime() + between(4, 72) * 3_600_000),
          },
          {
            kind: "MUSICIAN" as const,
            matchId: sel.id,
            eventRequestId: r.id,
            facilityId: f.id,
            musicianId: chosen.musicianId,
            rating: between(3, 5),
            secondaryRatings: { venueSetup: between(3, 5), staffSupport: between(3, 5), audienceEngagement: between(3, 5) },
            comments: pick(["Easy load-in, great staff.", "Room was ready; audience engaged.", "Parking was tricky but staff helped."]),
            issues: [],
            followUpRequired: false,
            status: (i % 3 === 0 ? "SENT" : "SUBMITTED") as "SENT" | "SUBMITTED",
            sentAt,
            submittedAt: i % 3 === 0 ? null : new Date(startAt.getTime() + between(4, 72) * 3_600_000),
          },
        ],
      });
    }
  }
  // Fix up ratings: the "SENT" client rows should not carry a rating yet.
  await prisma.feedback.updateMany({ where: { status: "SENT" }, data: { rating: null, comments: null, issues: [], followUpRequired: false } });

  console.log("Recomputing musician stats…");
  for (const m of musicians) await recomputeMusicianStats(m.id);

  // ───────────── Live pipeline ─────────────
  console.log("Creating live pipeline requests…");
  const mk = async (f: (typeof facilities)[number] | null, daysAhead: number, opts: Partial<{ serviceType: string; budget: number | null; attendance: number | null; hard: object; intake: object; hour: number; duration: number }> = {}) => {
    const tz = f?.timezone ?? "America/Phoenix";
    const startAt = nextWeekday(daysAhead, [1, 2, 3, 4, 5], opts.hour ?? 14, tz);
    return prisma.eventRequest.create({
      data: {
        reference: ref(),
        facilityId: f?.id ?? null,
        intakeFacility: (opts.intake as object | undefined) ?? undefined,
        startAt,
        durationMinutes: opts.duration ?? 60,
        setupBufferMinutes: 30,
        timezone: tz,
        serviceType: opts.serviceType ?? "LIVE_ENTERTAINMENT",
        programTags: f ? sample(f.preferredGenres, 1) : ["standards"],
        audienceDescription: "Residents in the main lounge, most seated; a few enjoy singing along.",
        expectedAttendance: opts.attendance === undefined ? (f?.typicalGroupSize ?? 25) : opts.attendance,
        budgetCeiling: opts.budget === undefined ? (f?.budgetMax ?? 200) : opts.budget,
        lat: f?.lat ?? null,
        lng: f?.lng ?? null,
        locationAddressLine1: f?.addressLine1 ?? "500 W Example Rd",
        locationCity: f?.city ?? "Phoenix",
        locationState: f?.state ?? "AZ",
        locationPostalCode: f?.postalCode ?? "85004",
        hardRequirements: opts.hard ?? { therapeuticQualifications: [], certifications: [], backgroundCheckRequired: true, insuranceRequired: true, audienceTags: [], programRequirements: [] },
        status: "SUBMITTED",
      },
    });
  };

  // Unlinked facility → review queue
  const rUnlinked = await mk(null, 21, { intake: { facilityName: "Verde Valley Villas", facilityType: "assisted-living", contactName: "Dana Whitfield", contactRole: "Activities", contactEmail: "dana@example.org", contactPhone: "480-555-9000", addressLine1: "12 E Verde Ln", city: "Phoenix", state: "AZ", postalCode: "85004" } });
  await evaluateReadiness(rUnlinked.id, SYSTEM_ACTOR);
  // Needs information (no budget)
  const rNeeds = await mk(facilities[6], 18, { budget: null });
  await evaluateReadiness(rNeeds.id, SYSTEM_ACTOR);
  // Ready to match, not yet run
  const rReady = await mk(facilities[7], 25, { hard: { therapeuticQualifications: [], certifications: [], backgroundCheckRequired: true, insuranceRequired: true, audienceTags: ["skilled-nursing"], programRequirements: [] } });
  await evaluateReadiness(rReady.id, SYSTEM_ACTOR);
  // Awaiting approval (two runs)
  const rAwait1 = await mk(facilities[0], 12, { serviceType: "INTERACTIVE_SESSION" });
  await evaluateReadiness(rAwait1.id, SYSTEM_ACTOR);
  await runMatchingForRequest(rAwait1.id, adminActor);
  const rAwait2 = await mk(facilities[3], 15, { hard: { therapeuticQualifications: [], certifications: [], backgroundCheckRequired: true, insuranceRequired: true, audienceTags: ["memory-care"], programRequirements: [] } });
  await evaluateReadiness(rAwait2.id, SYSTEM_ACTOR);
  await runMatchingForRequest(rAwait2.id, adminActor);
  // Music therapy request → likely few/no eligible → exercises the exception path
  const rTherapy = await mk(facilities[9], 20, { serviceType: "MUSIC_THERAPY", hard: { therapeuticQualifications: ["MT-BC"], certifications: [], backgroundCheckRequired: true, insuranceRequired: true, audienceTags: [], programRequirements: [] } });
  await evaluateReadiness(rTherapy.id, SYSTEM_ACTOR);
  await runMatchingForRequest(rTherapy.id, adminActor);
  // Offered (approved top candidate, awaiting responses)
  const rOffered = await mk(facilities[1], 9);
  await evaluateReadiness(rOffered.id, SYSTEM_ACTOR);
  const off = await runMatchingForRequest(rOffered.id, adminActor);
  if (off.result.eligible[0]) {
    const top = await prisma.match.findFirstOrThrow({ where: { matchRunId: off.run.id, rank: 1 } });
    await approveMatch(top.id, adminActor);
  }
  // Partially accepted (musician accepted, facility pending)
  const rPartial = await mk(facilities[2], 10, { hour: 13 });
  await evaluateReadiness(rPartial.id, SYSTEM_ACTOR);
  const part = await runMatchingForRequest(rPartial.id, adminActor);
  if (part.result.eligible[0]) {
    const top = await prisma.match.findFirstOrThrow({ where: { matchRunId: part.run.id, rank: 1 } });
    await approveMatch(top.id, adminActor);
    await recordManualResponse(top.id, "MUSICIAN", "ACCEPT", "Accepted by phone", adminActor);
  }
  // Confirmed upcoming (both accepted) in 4 days → reminders due
  const rConfirmed = await mk(facilities[4], 4, { hour: 15 });
  await evaluateReadiness(rConfirmed.id, SYSTEM_ACTOR);
  const conf = await runMatchingForRequest(rConfirmed.id, adminActor);
  if (conf.result.eligible[0]) {
    const top = await prisma.match.findFirstOrThrow({ where: { matchRunId: conf.run.id, rank: 1 } });
    await approveMatch(top.id, adminActor);
    await recordManualResponse(top.id, "MUSICIAN", "ACCEPT", "Accepted by email", adminActor);
    await recordManualResponse(top.id, "FACILITY", "ACCEPT", "Confirmed by phone", adminActor);
  }
  // Declined by musician → exception path (2nd-ranked override on approval, then decline)
  const rDeclined = await mk(facilities[5], 14);
  await evaluateReadiness(rDeclined.id, SYSTEM_ACTOR);
  const dec = await runMatchingForRequest(rDeclined.id, adminActor);
  if (dec.result.eligible[1]) {
    const second = await prisma.match.findFirstOrThrow({ where: { matchRunId: dec.run.id, rank: 2 } });
    await approveMatch(second.id, adminActor, { overrideReason: "Facility asked for a guitarist this time" });
    await recordManualResponse(second.id, "MUSICIAN", "DECLINE", "Family commitment that afternoon", adminActor);
  }
  // Recently completed (2 days ago), feedback scheduled
  const rDone = await mk(facilities[8], -2, { hour: 13 });
  await prisma.eventRequest.update({ where: { id: rDone.id }, data: { status: "CLOSED", closeReason: "Booking confirmed", readyAt: localDate(-20, 9), recommendedAt: localDate(-20, 10) } });
  // (the rDone request uses facilities[8]'s zone via mk())
  {
    const rr = await prisma.eventRequest.findUniqueOrThrow({ where: { id: rDone.id }, include: { facility: true } });
    const req = toEngineRequest(rr);
    const engineMusicians = musicians.map((m) => toEngineMusician({ ...m, preferences: [], matches: [] }, req, new Date(0), new Date(0), new Date(0)));
    const travel = await estimateTravel(engineMusicians.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })), { lat: req.lat!, lng: req.lng! });
    const result = runMatching({ request: req, musicians: engineMusicians, travel, weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, now: localDate(-20, 9) });
    const chosen = result.eligible[0];
    if (chosen) {
      const run = await prisma.matchRun.create({ data: { eventRequestId: rr.id, triggeredById: admin.id, weightsSnapshot: DEFAULT_WEIGHTS, thresholdsSnapshot: DEFAULT_THRESHOLDS, totalMusicians: result.totalMusicians, eligibleCount: result.eligibleCount, exclusionSummary: result.exclusionSummary, durationMs: result.durationMs } });
      await prisma.match.createMany({ data: result.candidates.map((c) => ({ matchRunId: run.id, eventRequestId: rr.id, facilityId: rr.facilityId!, musicianId: c.musicianId, eligible: c.eligible, failedFilter: c.failedFilter ?? null, score: c.eligible ? c.score : null, rank: c.rank ?? null, subScores: { sub: c.subScores, weighted: c.weighted }, reasons: c.reasons, warnings: c.warnings, distanceMiles: c.distanceMiles ?? null, travelMinutes: c.travelMinutes ?? null, selected: c.musicianId === chosen.musicianId, approvedById: c.musicianId === chosen.musicianId ? admin.id : null, approvedAt: c.musicianId === chosen.musicianId ? localDate(-19, 9) : null, musicianResponse: c.musicianId === chosen.musicianId ? "ACCEPTED" : null, musicianRespondedAt: c.musicianId === chosen.musicianId ? localDate(-19, 15) : null, facilityResponse: c.musicianId === chosen.musicianId ? "ACCEPTED" : null, facilityRespondedAt: c.musicianId === chosen.musicianId ? localDate(-18, 9) : null, status: c.musicianId === chosen.musicianId ? "COMPLETED" : "RECOMMENDED", offeredAt: c.musicianId === chosen.musicianId ? localDate(-19, 9) : null, confirmedAt: c.musicianId === chosen.musicianId ? localDate(-18, 9) : null, completedAt: c.musicianId === chosen.musicianId ? localDate(-2, 16) : null })) });
      const sel = await prisma.match.findFirstOrThrow({ where: { eventRequestId: rr.id, selected: true } });
      await scheduleFeedbackRows(sel.id);
      await recomputeMusicianStats(chosen.musicianId);
    }
  }

  // Portal logins (see /demo). Bound to a busy assisted-living community and a busy musician so the
  // portals open with real content: upcoming bookings, an offer to answer, and performances to rate.
  console.log("Creating portal demo logins…");
  const upcomingLive = { selected: true, exceptionStatus: null, eventRequest: { startAt: { gte: new Date() } } };
  const portalFacility =
    (await prisma.facility.findFirst({ where: { facilityType: "assisted-living", matches: { some: { ...upcomingLive, status: { in: ["OFFERED", "PARTIALLY_ACCEPTED"] }, facilityResponse: null } } }, select: { id: true, primaryContactName: true } })) ??
    (await prisma.facility.findFirst({ where: { facilityType: "assisted-living", matches: { some: { ...upcomingLive, status: "CONFIRMED" } } }, select: { id: true, primaryContactName: true } })) ??
    (await prisma.facility.findFirstOrThrow({ select: { id: true, primaryContactName: true } }));
  const portalMusician =
    (await prisma.musician.findFirst({ where: { status: "ACTIVE", completedEvents: { gt: 0 }, matches: { some: { ...upcomingLive, status: { in: ["OFFERED", "PARTIALLY_ACCEPTED"] }, musicianResponse: null } } }, orderBy: { completedEvents: "desc" }, select: { id: true, firstName: true, lastName: true } })) ??
    (await prisma.musician.findFirst({ where: { status: "ACTIVE", matches: { some: { ...upcomingLive, status: "CONFIRMED" } } }, orderBy: { completedEvents: "desc" }, select: { id: true, firstName: true, lastName: true } })) ??
    (await prisma.musician.findFirstOrThrow({ select: { id: true, firstName: true, lastName: true } }));
  await prisma.user.create({ data: { email: "director@community.test", name: portalFacility.primaryContactName, passwordHash: await hash("demo-community", 10), role: "FACILITY", facilityId: portalFacility.id } });
  await prisma.user.create({ data: { email: "performer@community.test", name: `${portalMusician.firstName} ${portalMusician.lastName}`, passwordHash: await hash("demo-musician", 10), role: "MUSICIAN", musicianId: portalMusician.id } });
  // Leave each portal persona one recent performance still to rate (feedback email sent, not yet answered).
  for (const [kind, where] of [["CLIENT", { facilityId: portalFacility.id }], ["MUSICIAN", { musicianId: portalMusician.id }]] as const) {
    const latest = await prisma.feedback.findFirst({ where: { ...where, kind, match: { status: "COMPLETED" } }, orderBy: { eventRequest: { startAt: "desc" } } });
    if (latest) await prisma.feedback.update({ where: { id: latest.id }, data: { status: "SENT", rating: null, secondaryRatings: {}, comments: null, issues: [], followUpRequired: false, submittedAt: null } });
  }
  await recomputeMusicianStats(portalMusician.id);

  const counts = {
    users: await prisma.user.count(),
    musicians: await prisma.musician.count(),
    facilities: await prisma.facility.count(),
    requests: await prisma.eventRequest.count(),
    matchRuns: await prisma.matchRun.count(),
    matches: await prisma.match.count(),
    feedback: await prisma.feedback.count(),
    alerts: await prisma.alert.count(),
    notifications: await prisma.notificationLog.count(),
  };
  console.log("Seed complete:", counts);
  console.log(`Historical bookings for backtest: ${historical.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
