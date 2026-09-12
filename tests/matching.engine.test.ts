import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  runMatching,
  summarizeExclusions,
  validateWeights,
  weeklyWindowFit,
  type EngineInput,
  type EngineMusician,
  type EngineRequest,
  type TravelEstimate,
} from "@/lib/matching";

// Wednesday 2026-10-14 14:00 Phoenix (UTC-7, no DST) = 21:00Z
const START = new Date("2026-10-14T21:00:00Z");
const NOW = new Date("2026-09-15T12:00:00Z");

function musician(overrides: Partial<EngineMusician> = {}): EngineMusician {
  return {
    id: "m1",
    name: "Test Musician",
    status: "ACTIVE",
    entertainmentTypes: ["LIVE_ENTERTAINMENT", "INTERACTIVE_SESSION"],
    genres: ["jazz", "standards"],
    instruments: ["piano", "vocals"],
    offersInteractive: true,
    therapeuticQualifications: [],
    audienceExperience: ["assisted-living", "memory-care"],
    facilityTypeExperience: ["assisted-living"],
    certifications: [],
    insuranceExpiresAt: new Date("2027-06-30T00:00:00Z"),
    backgroundCheckStatus: "CLEARED",
    backgroundCheckDate: new Date("2026-01-10T00:00:00Z"),
    programRequirementsMet: [],
    standardRate: 150,
    rateStructure: "PER_EVENT",
    minBookingMinutes: 45,
    lat: 33.45,
    lng: -112.07,
    maxTravelMiles: 30,
    travelFeeApplies: false,
    timezone: "America/Phoenix",
    // Wed 09:00–20:00 local
    weeklyAvailability: [{ day: 3, start: "09:00", end: "20:00" }],
    blackouts: [],
    completedEvents: 20,
    cancellations: 1,
    noShows: 0,
    avgRating: 4.8,
    ratingCount: 18,
    avgResponseHours: 6,
    responseCount: 20,
    adminRestriction: null,
    restrictedUntil: null,
    existingBookings: [],
    eventsAtFacility: 2,
    recentBookings: 1,
    facilityPreference: null,
    ...overrides,
  };
}

function request(overrides: Partial<EngineRequest> = {}): EngineRequest {
  return {
    id: "r1",
    facilityId: "f1",
    startAt: START,
    durationMinutes: 60,
    setupBufferMinutes: 30,
    timezone: "America/Phoenix",
    serviceType: "LIVE_ENTERTAINMENT",
    programTags: ["jazz"],
    facilityType: "assisted-living",
    facilityAudienceTags: ["assisted-living"],
    preferredGenres: ["jazz"],
    expectedAttendance: 30,
    budgetCeiling: 200,
    lat: 33.5,
    lng: -112.0,
    hardRequirements: {
      therapeuticQualifications: [],
      certifications: [],
      backgroundCheckRequired: true,
      insuranceRequired: true,
      audienceTags: [],
      programRequirements: [],
    },
    ...overrides,
  };
}

const travel = (miles = 8, minutes = 18): TravelEstimate => ({ distanceMiles: miles, durationMinutes: minutes, source: "routing" });

function run(musicians: EngineMusician[], req = request(), travelMap?: EngineInput["travel"], extra: Partial<EngineInput> = {}) {
  const travelMapFinal = travelMap ?? Object.fromEntries(musicians.map((m) => [m.id, travel()]));
  return runMatching({
    request: req,
    musicians,
    travel: travelMapFinal,
    weights: DEFAULT_WEIGHTS,
    thresholds: DEFAULT_THRESHOLDS,
    now: NOW,
    ...extra,
  });
}

describe("weights", () => {
  it("accepts the default weights", () => {
    expect(validateWeights(DEFAULT_WEIGHTS).ok).toBe(true);
  });
  it("rejects weights that do not sum to 100", () => {
    const v = validateWeights({ ...DEFAULT_WEIGHTS, budget: 20 });
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/sum to 110/);
  });
  it("engine throws on invalid weights", () => {
    expect(() => run([musician()], request(), undefined, { weights: { ...DEFAULT_WEIGHTS, quality: 0 } })).toThrow(/Invalid weights/);
  });
});

describe("weeklyWindowFit", () => {
  it("fits a window on the right local day", () => {
    const fit = weeklyWindowFit([{ day: 3, start: "09:00", end: "20:00" }], new Date("2026-10-14T20:12:00Z"), new Date("2026-10-14T22:18:00Z"), "America/Phoenix");
    expect(fit.fits).toBe(true);
    expect(fit.slackBefore).toBe(252); // 13:12 - 09:00
    expect(fit.slackAfter).toBe(282); // 20:00 - 15:18
  });
  it("rejects a window on a different day", () => {
    const fit = weeklyWindowFit([{ day: 4, start: "09:00", end: "20:00" }], START, new Date("2026-10-14T22:00:00Z"), "America/Phoenix");
    expect(fit.fits).toBe(false);
  });
});

describe("mandatory filters", () => {
  it("excludes non-active musicians", () => {
    const r = run([musician({ status: "SUBMITTED" })]);
    expect(r.eligibleCount).toBe(0);
    expect(r.excluded[0].failedFilter).toBe("NOT_ACTIVE");
  });
  it("excludes musicians with an active admin restriction", () => {
    const r = run([musician({ adminRestriction: "Pending review of complaint" })]);
    expect(r.excluded[0].failedFilter).toBe("ADMIN_RESTRICTION");
  });
  it("ignores an expired admin restriction", () => {
    const r = run([musician({ adminRestriction: "old", restrictedUntil: new Date("2026-01-01T00:00:00Z") })]);
    expect(r.eligibleCount).toBe(1);
  });
  it("excludes musicians blocked by the facility", () => {
    const r = run([musician({ facilityPreference: "BLOCKED" })]);
    expect(r.excluded[0].failedFilter).toBe("BLOCKED_BY_FACILITY");
  });
  it("excludes when unavailable including travel and setup", () => {
    // Window ends 14:30 local; event 14:00–15:00 plus 18 min travel → needs until 15:18.
    const r = run([musician({ weeklyAvailability: [{ day: 3, start: "09:00", end: "14:30" }] })]);
    expect(r.excluded[0].failedFilter).toBe("UNAVAILABLE");
  });
  it("excludes when the start-side buffer (travel + setup) is not covered", () => {
    // Needs from 13:12 local (14:00 - 30 setup - 18 travel); window starts 13:30.
    const r = run([musician({ weeklyAvailability: [{ day: 3, start: "13:30", end: "20:00" }] })]);
    expect(r.excluded[0].failedFilter).toBe("UNAVAILABLE");
  });
  it("excludes on blackout", () => {
    const r = run([musician({ blackouts: [{ start: "2026-10-14T00:00:00Z", end: "2026-10-15T00:00:00Z", reason: "Vacation" }] })]);
    expect(r.excluded[0].failedFilter).toBe("UNAVAILABLE");
    expect(r.excluded[0].filterDetail).toMatch(/Vacation/);
  });
  it("excludes service mismatch", () => {
    const r = run([musician({ entertainmentTypes: ["MUSIC_THERAPY"] })]);
    expect(r.excluded[0].failedFilter).toBe("SERVICE_MISMATCH");
  });
  it("requires a therapeutic qualification for music therapy", () => {
    const r = run([musician({ entertainmentTypes: ["MUSIC_THERAPY"], therapeuticQualifications: [] })], request({ serviceType: "MUSIC_THERAPY" }));
    expect(r.excluded[0].failedFilter).toBe("SERVICE_MISMATCH");
    const ok = run([musician({ entertainmentTypes: ["MUSIC_THERAPY"], therapeuticQualifications: ["MT-BC"] })], request({ serviceType: "MUSIC_THERAPY" }));
    expect(ok.eligibleCount).toBe(1);
  });
  it("excludes outside radius, and admits with an explicit radius relaxation", () => {
    const m = musician({ maxTravelMiles: 10 });
    const t = { [m.id]: travel(14, 25) };
    expect(run([m], request(), t).excluded[0].failedFilter).toBe("OUT_OF_RADIUS");
    const relaxed = run([m], request(), t, { relaxations: { radiusMultiplier: 1.5 } });
    expect(relaxed.eligibleCount).toBe(1);
  });
  it("excludes missing credentials", () => {
    expect(run([musician({ backgroundCheckStatus: "PENDING" })]).excluded[0].failedFilter).toBe("MISSING_CREDENTIAL");
    expect(run([musician({ insuranceExpiresAt: new Date("2026-10-01T00:00:00Z") })]).excluded[0].failedFilter).toBe("MISSING_CREDENTIAL");
    const req = request({ hardRequirements: { ...request().hardRequirements, audienceTags: ["memory-care"] } });
    expect(run([musician({ audienceExperience: ["assisted-living"] })], req).excluded[0].failedFilter).toBe("MISSING_CREDENTIAL");
    expect(run([musician()], req).eligibleCount).toBe(1);
  });
  it("excludes conflicting bookings with travel padding", () => {
    // Existing booking 12:00–13:00 local (19:00–20:00Z), 18 min travel + 30 gap → blocked until 20:48Z; event needs 20:12Z.
    const r = run([musician({ existingBookings: [{ matchId: "x", start: new Date("2026-10-14T19:00:00Z"), end: new Date("2026-10-14T20:00:00Z"), travelMinutes: 18 }] })]);
    expect(r.excluded[0].failedFilter).toBe("BOOKING_CONFLICT");
    // Booking that ends 10:00 local is fine.
    const ok = run([musician({ existingBookings: [{ matchId: "x", start: new Date("2026-10-14T16:00:00Z"), end: new Date("2026-10-14T17:00:00Z"), travelMinutes: 18 }] })]);
    expect(ok.eligibleCount).toBe(1);
  });
  it("excludes when not geocoded", () => {
    expect(run([musician({ lat: null, lng: null })]).excluded[0].failedFilter).toBe("NO_LOCATION");
  });
  it("summarises exclusions in plain English", () => {
    const r = run([
      musician({ id: "a", status: "INACTIVE" }),
      musician({ id: "b", maxTravelMiles: 1 }),
      musician({ id: "c", maxTravelMiles: 1 }),
      musician({ id: "d" }),
    ]);
    expect(summarizeExclusions(r.totalMusicians, r.exclusionSummary)).toBe("3 of 4 excluded: 2 outside travel radius, 1 not approved and active");
  });
});

describe("scoring", () => {
  it("scores 0–100 with sub-scores, reasons, and rank", () => {
    const r = run([musician()]);
    const c = r.eligible[0];
    expect(c.rank).toBe(1);
    expect(c.score).toBeGreaterThan(0);
    expect(c.score).toBeLessThanOrEqual(100);
    expect(Object.keys(c.subScores)).toHaveLength(7);
    expect(c.reasons.some((x) => /under budget/.test(x))).toBe(true);
    expect(c.reasons.some((x) => /4\.8 avg rating over 18/.test(x))).toBe(true);
    expect(c.reasons.some((x) => /miles/.test(x))).toBe(true);
    const weightedSum = Object.values(c.weighted).reduce((a, b) => a + b, 0);
    expect(Math.abs(weightedSum - c.score)).toBeLessThan(0.11);
  });
  it("ranks the closer, cheaper, better-rated musician first", () => {
    const a = musician({ id: "a", name: "A", standardRate: 120, avgRating: 4.9 });
    const b = musician({ id: "b", name: "B", standardRate: 190, avgRating: 3.9 });
    const r = run([a, b], request(), { a: travel(5, 12), b: travel(25, 40) });
    expect(r.eligible.map((c) => c.musicianId)).toEqual(["a", "b"]);
  });
  it("warns on over-budget rates and degrades the budget score", () => {
    const r = run([musician({ standardRate: 216 })]);
    const c = r.eligible[0];
    expect(c.warnings).toContain("Rate is 8% over budget");
    expect(c.subScores.budget).toBeLessThan(70);
  });
  it("gives full budget marks under the comfort ratio and 0 past the hard-over ratio", () => {
    expect(run([musician({ standardRate: 100 })]).eligible[0].subScores.budget).toBe(100);
    expect(run([musician({ standardRate: 260 })]).eligible[0].subScores.budget).toBe(0);
  });
  it("uses hourly rates times duration", () => {
    const r = run([musician({ standardRate: 100, rateStructure: "PER_HOUR" })], request({ durationMinutes: 90 }));
    expect(r.eligible[0].reasons.some((x) => x.startsWith("Rate $150"))).toBe(true);
  });
  it("warns on long travel", () => {
    const r = run([musician()], request(), { m1: travel(28, 52) });
    expect(r.eligible[0].warnings).toContain("Travel time 52 minutes");
  });
  it("rewards facility preference and rotation", () => {
    const pref = run([musician({ facilityPreference: "PREFERRED", recentBookings: 0 })]).eligible[0].subScores.rotation;
    const busy = run([musician({ facilityPreference: null, recentBookings: 6 })]).eligible[0].subScores.rotation;
    expect(pref).toBe(100);
    expect(busy).toBe(20);
    const ignored = run([musician({ facilityPreference: "PREFERRED", recentBookings: 0 })], request(), undefined, { relaxations: { ignoreFacilityPreferences: true } });
    expect(ignored.eligible[0].subScores.rotation).toBe(60);
  });
  it("scores tight availability lower than comfortable availability", () => {
    const comfy = run([musician()]).eligible[0];
    // Window 13:00–15:30 local → needed 13:12–15:18 → slack 12 min
    const tight = run([musician({ weeklyAvailability: [{ day: 3, start: "13:00", end: "15:30" }] })]).eligible[0];
    expect(tight.subScores.availability).toBeLessThan(comfy.subScores.availability);
    expect(tight.warnings.some((w) => /Tight availability/.test(w))).toBe(true);
  });
  it("treats no history as neutral", () => {
    const r = run([musician({ completedEvents: 0, cancellations: 0, noShows: 0, avgRating: null, ratingCount: 0 })]);
    expect(r.eligible[0].subScores.quality).toBe(55);
    expect(r.eligible[0].reasons).toContain("No performance history yet");
  });
  it("is deterministic", () => {
    const a = run([musician(), musician({ id: "m2", name: "Other" })]);
    const b = run([musician(), musician({ id: "m2", name: "Other" })]);
    expect(a.eligible.map((c) => [c.musicianId, c.score])).toEqual(b.eligible.map((c) => [c.musicianId, c.score]));
  });
  it("re-weighting changes the ranking predictably", () => {
    const near = musician({ id: "near", name: "Near", standardRate: 190, avgRating: 3.8 });
    const far = musician({ id: "far", name: "Far", standardRate: 100, avgRating: 5 });
    const t = { near: travel(3, 8), far: travel(28, 70) };
    const distanceHeavy = run([near, far], request(), t, { weights: { availability: 10, service: 10, distance: 60, audience: 5, budget: 5, quality: 5, rotation: 5 } });
    const qualityHeavy = run([near, far], request(), t, { weights: { availability: 10, service: 10, distance: 5, audience: 5, budget: 30, quality: 35, rotation: 5 } });
    expect(distanceHeavy.eligible[0].musicianId).toBe("near");
    expect(qualityHeavy.eligible[0].musicianId).toBe("far");
  });
});
