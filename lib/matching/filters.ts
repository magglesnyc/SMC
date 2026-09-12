import { addMinutes, blackoutConflict, bookingConflict, weeklyWindowFit } from "./availability";
import type {
  EngineMusician,
  EngineRequest,
  FilterCode,
  Relaxations,
  Thresholds,
  TravelEstimate,
} from "./types";

export interface FilterResult {
  passed: boolean;
  code?: FilterCode;
  detail?: string;
  /** Data computed while filtering that scoring reuses. */
  computed: {
    neededStart: Date;
    neededEnd: Date;
    eventEnd: Date;
    slackBefore: number;
    slackAfter: number;
    travel?: TravelEstimate;
  };
}

function missing(required: string[], have: string[]): string[] {
  const set = new Set(have.map((s) => s.toLowerCase()));
  return required.filter((r) => !set.has(r.toLowerCase()));
}

/**
 * Mandatory filters (spec 5.1), applied in order. The first failing filter is recorded.
 * Nothing in here is ever relaxed automatically; `relaxations.radiusMultiplier` is an
 * explicit admin choice and is logged with the run.
 */
export function applyMandatoryFilters(
  m: EngineMusician,
  req: EngineRequest,
  travel: TravelEstimate | undefined,
  thresholds: Thresholds,
  relaxations: Relaxations,
  now: Date,
): FilterResult {
  const eventEnd = addMinutes(req.startAt, req.durationMinutes);
  const travelMinutes = travel?.durationMinutes ?? 0;
  const neededStart = addMinutes(req.startAt, -(travelMinutes + req.setupBufferMinutes));
  const neededEnd = addMinutes(eventEnd, travelMinutes);
  const computed: FilterResult["computed"] = {
    neededStart,
    neededEnd,
    eventEnd,
    slackBefore: 0,
    slackAfter: 0,
    travel,
  };
  const fail = (code: FilterCode, detail: string): FilterResult => ({ passed: false, code, detail, computed });

  // 1. Status must be Approved/Active (Active is the operational state; Approved is accepted as "approved but not yet activated").
  if (m.status !== "ACTIVE" && m.status !== "APPROVED") {
    return fail("NOT_ACTIVE", `Status is ${m.status}`);
  }

  // 6b. Active administrative restriction (checked early so the admin sees it first).
  if (m.adminRestriction && (!m.restrictedUntil || m.restrictedUntil > now)) {
    return fail("ADMIN_RESTRICTION", m.adminRestriction);
  }

  // Facility-level block is treated as a restriction for this facility.
  if (m.facilityPreference === "BLOCKED") {
    return fail("BLOCKED_BY_FACILITY", "Facility has blocked this musician");
  }

  // 4 (precondition). Both sides must be geocoded to evaluate radius and travel.
  if (m.lat == null || m.lng == null || req.lat == null || req.lng == null || !travel) {
    return fail("NO_LOCATION", m.lat == null || m.lng == null ? "Musician address not geocoded" : "Event location not geocoded");
  }

  // 2. Availability for the date and time, inclusive of travel and setup buffer.
  const fit = weeklyWindowFit(m.weeklyAvailability, neededStart, neededEnd, m.timezone);
  if (!fit.fits) {
    return fail(
      "UNAVAILABLE",
      `No weekly availability covering the needed window (incl. ${travelMinutes} min travel + ${req.setupBufferMinutes} min setup)`,
    );
  }
  computed.slackBefore = fit.slackBefore;
  computed.slackAfter = fit.slackAfter;
  const blackout = blackoutConflict(m.blackouts, neededStart, neededEnd);
  if (blackout) {
    return fail("UNAVAILABLE", `Blackout${blackout.reason ? `: ${blackout.reason}` : ""}`);
  }

  // 3. Service / entertainment type / therapeutic qualification.
  if (!m.entertainmentTypes.includes(req.serviceType)) {
    return fail("SERVICE_MISMATCH", `Does not offer ${req.serviceType.toLowerCase().replace(/_/g, " ")}`);
  }
  if (req.serviceType === "INTERACTIVE_SESSION" && !m.offersInteractive) {
    return fail("SERVICE_MISMATCH", "Does not offer interactive sessions");
  }
  if (req.serviceType === "MUSIC_THERAPY" && m.therapeuticQualifications.length === 0) {
    return fail("SERVICE_MISMATCH", "No therapeutic qualification on file");
  }
  const missingQuals = missing(req.hardRequirements.therapeuticQualifications, m.therapeuticQualifications);
  if (missingQuals.length) {
    return fail("SERVICE_MISMATCH", `Missing therapeutic qualification: ${missingQuals.join(", ")}`);
  }
  if (req.durationMinutes < m.minBookingMinutes) {
    return fail("SERVICE_MISMATCH", `Minimum booking is ${m.minBookingMinutes} min; event is ${req.durationMinutes} min`);
  }

  // 4. Travel radius.
  const radius = m.maxTravelMiles * (relaxations.radiusMultiplier ?? 1);
  if (travel.distanceMiles > radius) {
    return fail(
      "OUT_OF_RADIUS",
      `${travel.distanceMiles.toFixed(0)} mi exceeds ${radius.toFixed(0)} mi radius${relaxations.radiusMultiplier ? " (expanded)" : ""}`,
    );
  }

  // 5. Credentials, insurance, background check, program requirements.
  const hr = req.hardRequirements;
  if (hr.insuranceRequired && (!m.insuranceExpiresAt || m.insuranceExpiresAt < eventEnd)) {
    return fail("MISSING_CREDENTIAL", m.insuranceExpiresAt ? "Insurance expires before the event" : "No insurance on file");
  }
  if (hr.backgroundCheckRequired && m.backgroundCheckStatus !== "CLEARED") {
    return fail("MISSING_CREDENTIAL", `Background check ${m.backgroundCheckStatus.toLowerCase()}`);
  }
  const missingCerts = missing(hr.certifications, m.certifications);
  if (missingCerts.length) return fail("MISSING_CREDENTIAL", `Missing certification: ${missingCerts.join(", ")}`);
  const missingProg = missing(hr.programRequirements, m.programRequirementsMet);
  if (missingProg.length) return fail("MISSING_CREDENTIAL", `Missing program requirement: ${missingProg.join(", ")}`);
  const missingAud = missing(hr.audienceTags, m.audienceExperience);
  if (missingAud.length) return fail("MISSING_CREDENTIAL", `Missing required experience: ${missingAud.join(", ")}`);

  // 6a. Conflicting confirmed booking.
  const conflict = bookingConflict(m.existingBookings, neededStart, neededEnd, travelMinutes, thresholds.bookingGapMinutes);
  if (conflict) {
    return fail("BOOKING_CONFLICT", `Conflicts with booking at ${conflict.start.toISOString()}`);
  }

  return { passed: true, computed };
}
