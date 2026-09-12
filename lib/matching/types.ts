/**
 * Matching engine types. This module is pure TypeScript: no database, HTTP, or React.
 * The caller (a service) loads records, precomputes travel estimates, and hands the
 * engine plain data. The engine returns ranked, scored, reasoned candidates.
 */

export const SERVICE_TYPES = [
  "LIVE_ENTERTAINMENT",
  "INTERACTIVE_SESSION",
  "MUSIC_THERAPY",
  "SPECIALTY",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  LIVE_ENTERTAINMENT: "Live entertainment",
  INTERACTIVE_SESSION: "Interactive / participatory session",
  MUSIC_THERAPY: "Music therapy",
  SPECIALTY: "Specialty program",
};

/** Recurring weekly window in the musician's local time. day: 0 = Sunday … 6 = Saturday. */
export interface WeeklyWindow {
  day: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

/** Blackout range, ISO-8601 instants (UTC). */
export interface Blackout {
  start: string;
  end: string;
  reason?: string;
}

export interface ExistingBooking {
  matchId: string;
  start: Date; // UTC, performance start
  end: Date; // UTC, performance end
  travelMinutes?: number | null;
}

export interface EngineMusician {
  id: string;
  name: string;
  status: string; // MusicianStatus
  entertainmentTypes: string[];
  genres: string[];
  instruments: string[];
  offersInteractive: boolean;
  therapeuticQualifications: string[];
  audienceExperience: string[];
  facilityTypeExperience: string[];
  certifications: string[];
  insuranceExpiresAt: Date | null;
  backgroundCheckStatus: string; // BackgroundCheckStatus
  backgroundCheckDate: Date | null;
  programRequirementsMet: string[];
  standardRate: number;
  rateStructure: "PER_EVENT" | "PER_HOUR";
  minBookingMinutes: number;
  lat: number | null;
  lng: number | null;
  maxTravelMiles: number;
  travelFeeApplies: boolean;
  timezone: string;
  weeklyAvailability: WeeklyWindow[];
  blackouts: Blackout[];
  completedEvents: number;
  cancellations: number;
  noShows: number;
  avgRating: number | null;
  ratingCount: number;
  avgResponseHours: number | null;
  responseCount: number;
  adminRestriction: string | null;
  restrictedUntil: Date | null;
  /** Confirmed (or offered/approved) bookings that could conflict with this event. */
  existingBookings: ExistingBooking[];
  /** Prior completed events at this specific facility. */
  eventsAtFacility: number;
  /** Bookings inside the rotation window (e.g. last 90 days). */
  recentBookings: number;
  /** The facility's stated preference for this musician. */
  facilityPreference: "PREFERRED" | "BLOCKED" | null;
}

export interface HardRequirements {
  therapeuticQualifications: string[];
  certifications: string[];
  backgroundCheckRequired: boolean;
  insuranceRequired: boolean;
  audienceTags: string[];
  programRequirements: string[];
}

export interface EngineRequest {
  id: string;
  facilityId: string;
  startAt: Date; // UTC
  durationMinutes: number;
  setupBufferMinutes: number;
  timezone: string;
  serviceType: string;
  programTags: string[];
  facilityType: string;
  facilityAudienceTags: string[];
  preferredGenres: string[];
  expectedAttendance: number | null;
  budgetCeiling: number | null;
  lat: number | null;
  lng: number | null;
  hardRequirements: HardRequirements;
}

export interface TravelEstimate {
  distanceMiles: number;
  durationMinutes: number;
  source: "routing" | "straight-line";
}

export const CRITERIA = [
  "availability",
  "service",
  "distance",
  "audience",
  "budget",
  "quality",
  "rotation",
] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<Criterion, string> = {
  availability: "Availability fit",
  service: "Service / program fit",
  distance: "Distance and travel",
  audience: "Audience and facility fit",
  budget: "Budget / rate fit",
  quality: "Quality and reliability",
  rotation: "Relationship and rotation",
};

/** Percent weights; must sum to 100. */
export type Weights = Record<Criterion, number>;

// Type aliases (not interfaces) so these can be stored as Prisma Json values.
export type Thresholds = {
  /** Slack on each side of the needed window that earns full availability marks. */
  comfortableBufferMinutes: number;
  /** Travel minutes at or under which distance scores 100. */
  nearMinutes: number;
  /** Travel minutes at or over which distance scores 0. */
  farMinutes: number;
  /** Travel minutes above which a warning is attached. */
  longTravelWarningMinutes: number;
  /** Fraction of budget under which rate scores 100. */
  budgetComfortRatio: number;
  /** Fraction over budget at which rate scores 0 (1.25 = 25% over). */
  budgetHardOverRatio: number;
  /** Average rating under which a warning is attached. */
  lowRatingWarning: number;
  /** Days used by the caller to count recentBookings. */
  rotationWindowDays: number;
  /** Recent bookings at which rotation penalty is maximal. */
  rotationSaturationCount: number;
  /** Days before the event within which an expiring insurance policy triggers a warning. */
  insuranceExpiryWarningDays: number;
  /** Minutes of padding between two bookings beyond travel time. */
  bookingGapMinutes: number;
};

/** Admin-explicit relaxations for a re-run. Never applied automatically. */
export type Relaxations = {
  /** Multiply each musician's travel radius (e.g. 1.5). Logged as an explicit admin choice. */
  radiusMultiplier?: number;
  /** Ignore facility preferred-musician boosts (blocked musicians are still excluded). */
  ignoreFacilityPreferences?: boolean;
  /** Ignore the budget ceiling when scoring (still warns). */
  ignoreBudget?: boolean;
};

export interface EngineInput {
  request: EngineRequest;
  musicians: EngineMusician[];
  /** Precomputed travel estimate per musician id (from routing API or fallback). */
  travel: Record<string, TravelEstimate | undefined>;
  weights: Weights;
  thresholds: Thresholds;
  relaxations?: Relaxations;
  now: Date;
}

export const FILTER_CODES = [
  "NOT_ACTIVE",
  "ADMIN_RESTRICTION",
  "BLOCKED_BY_FACILITY",
  "NO_LOCATION",
  "UNAVAILABLE",
  "SERVICE_MISMATCH",
  "OUT_OF_RADIUS",
  "MISSING_CREDENTIAL",
  "BOOKING_CONFLICT",
] as const;
export type FilterCode = (typeof FILTER_CODES)[number];

export const FILTER_LABELS: Record<FilterCode, string> = {
  NOT_ACTIVE: "Not approved and active",
  ADMIN_RESTRICTION: "Administrative restriction",
  BLOCKED_BY_FACILITY: "Blocked by facility",
  NO_LOCATION: "No geocoded location",
  UNAVAILABLE: "Unavailable for date/time",
  SERVICE_MISMATCH: "Does not offer requested service",
  OUT_OF_RADIUS: "Outside travel radius",
  MISSING_CREDENTIAL: "Missing required credential",
  BOOKING_CONFLICT: "Conflicting booking",
};

export interface Candidate {
  musicianId: string;
  musicianName: string;
  eligible: boolean;
  failedFilter?: FilterCode;
  filterDetail?: string;
  score: number;
  rank?: number;
  subScores: Record<Criterion, number>;
  weighted: Record<Criterion, number>;
  reasons: string[];
  warnings: string[];
  distanceMiles?: number;
  travelMinutes?: number;
}

export interface EngineResult {
  candidates: Candidate[]; // eligible ranked first, then excluded
  eligible: Candidate[];
  excluded: Candidate[];
  exclusionSummary: Partial<Record<FilterCode, number>>;
  totalMusicians: number;
  eligibleCount: number;
  weights: Weights;
  thresholds: Thresholds;
  relaxations: Relaxations;
  durationMs: number;
}
