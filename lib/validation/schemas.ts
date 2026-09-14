import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/matching/types";
import { CRITERIA } from "@/lib/matching/types";
import { US_STATE_CODES, US_TIMEZONE_IDS } from "./constants";

const trimmed = (max = 200) => z.string().trim().min(1, "Required").max(max);
const optionalTrimmed = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const phone = z
  .string()
  .trim()
  .min(7, "Enter a phone number")
  .max(30)
  .regex(/^[+()\d\s.-]+$/, "Enter a valid phone number");
const email = z.string().trim().toLowerCase().email("Enter a valid email");
const stateCode = z.string().trim().toUpperCase().pipe(z.enum(US_STATE_CODES as unknown as [string, ...string[]], { message: "Choose a state" }));
const usTimezone = z.enum(US_TIMEZONE_IDS as unknown as [string, ...string[]], { message: "Choose a time zone" });
const postal = z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP");
const uuid = z.string().uuid();

export const weeklyWindowSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const blackoutSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  reason: z.string().max(200).optional(),
});

// ───────────── 1. Musician application ─────────────

export const musicianApplicationSchema = z.object({
  submissionId: uuid,
  firstName: trimmed(80),
  lastName: trimmed(80),
  stageName: optionalTrimmed(120),
  email,
  phone,
  addressLine1: trimmed(200),
  city: trimmed(100),
  state: stateCode,
  postalCode: postal,
  timezone: usTimezone.default("America/New_York"),
  entertainmentTypes: z.array(z.enum(SERVICE_TYPES)).min(1, "Select at least one service"),
  genres: z.array(z.string().max(40)).max(20).default([]),
  instruments: z.array(z.string().max(40)).max(20).default([]),
  offersInteractive: z.boolean().default(false),
  therapeuticQualifications: z.array(z.string().max(60)).max(10).default([]),
  audienceExperience: z.array(z.string().max(40)).max(20).default([]),
  facilityTypeExperience: z.array(z.string().max(40)).max(20).default([]),
  certifications: z.array(z.string().max(60)).max(10).default([]),
  insuranceCarrier: optionalTrimmed(120),
  insurancePolicyNumber: optionalTrimmed(80),
  insuranceExpiresAt: z.string().date().optional().or(z.literal("").transform(() => undefined)),
  backgroundCheckStatus: z.enum(["NONE", "PENDING", "CLEARED"]).default("NONE"),
  standardRate: z.coerce.number().positive("Enter your rate").max(10000),
  rateStructure: z.enum(["PER_EVENT", "PER_HOUR"]),
  minBookingMinutes: z.coerce.number().int().min(15).max(480).default(60),
  maxTravelMiles: z.coerce.number().int().min(1).max(300),
  travelFeeApplies: z.boolean().default(false),
  weeklyAvailability: z.array(weeklyWindowSchema).min(1, "Add at least one weekly availability window"),
  blackouts: z.array(blackoutSchema).default([]),
});
export type MusicianApplicationInput = z.infer<typeof musicianApplicationSchema>;

// ───────────── 2. Facility event request ─────────────

export const hardRequirementsSchema = z.object({
  therapeuticQualifications: z.array(z.string().max(60)).default([]),
  certifications: z.array(z.string().max(60)).default([]),
  backgroundCheckRequired: z.boolean().default(true),
  insuranceRequired: z.boolean().default(true),
  audienceTags: z.array(z.string().max(40)).default([]),
  programRequirements: z.array(z.string().max(60)).default([]),
});
export type HardRequirementsInput = z.infer<typeof hardRequirementsSchema>;

export const eventRequestSchema = z.object({
  submissionId: uuid,
  // Facility identification — either an existing facility id or intake details
  facilityId: z.string().optional(),
  facilityName: trimmed(200),
  facilityType: trimmed(60),
  contactName: trimmed(120),
  contactRole: optionalTrimmed(80),
  contactEmail: email,
  contactPhone: phone.optional().or(z.literal("").transform(() => undefined)),
  addressLine1: trimmed(200),
  city: trimmed(100),
  state: stateCode,
  postalCode: postal,
  // Event
  date: z.string().date("Choose a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  setupBufferMinutes: z.coerce.number().int().min(0).max(180).default(30),
  timezone: usTimezone,
  serviceType: z.enum(SERVICE_TYPES),
  programTags: z.array(z.string().max(40)).default([]),
  preferredGenres: z.array(z.string().max(40)).default([]),
  audienceDescription: optionalTrimmed(1000),
  audienceTags: z.array(z.string().max(40)).default([]),
  expectedAttendance: z.coerce.number().int().min(1).max(2000).optional().or(z.literal("").transform(() => undefined)),
  budgetCeiling: z.coerce.number().positive().max(100000).optional().or(z.literal("").transform(() => undefined)),
  hardRequirements: hardRequirementsSchema.default({
    therapeuticQualifications: [],
    certifications: [],
    backgroundCheckRequired: true,
    insuranceRequired: true,
    audienceTags: [],
    programRequirements: [],
  }),
  notes: optionalTrimmed(2000),
});
export type EventRequestInput = z.infer<typeof eventRequestSchema>;

/**
 * Match-critical fields (FR-05). A request cannot become Ready to Match while any are missing.
 * Returns human-readable field names.
 */
export function matchCriticalMissing(r: {
  facilityId: string | null;
  startAt: Date | null;
  durationMinutes: number | null;
  serviceType: string | null;
  lat: number | null;
  lng: number | null;
  budgetCeiling: unknown;
  expectedAttendance: number | null;
}): string[] {
  const missing: string[] = [];
  if (!r.facilityId) missing.push("linked facility");
  if (!r.startAt || Number.isNaN(r.startAt.getTime())) missing.push("date and time");
  else if (r.startAt.getTime() < Date.now()) missing.push("date in the future");
  if (!r.durationMinutes || r.durationMinutes < 15) missing.push("duration");
  if (!r.serviceType) missing.push("service type");
  if (r.lat == null || r.lng == null) missing.push("geocoded event location");
  if (r.budgetCeiling == null) missing.push("budget ceiling");
  if (r.expectedAttendance == null) missing.push("expected attendance");
  return missing;
}

// ───────────── 3 & 4. Feedback ─────────────

const rating = z.coerce.number().int().min(1).max(5);

export const clientFeedbackSchema = z.object({
  ref: z.string().min(10),
  rating,
  secondaryRatings: z
    .object({
      engagement: rating.optional(),
      punctuality: rating.optional(),
      professionalism: rating.optional(),
    })
    .default({}),
  comments: optionalTrimmed(3000),
  issues: z.array(z.string().max(40)).default([]),
  wouldBookAgain: z.boolean().default(true),
  followUpRequested: z.boolean().default(false),
});
export type ClientFeedbackInput = z.infer<typeof clientFeedbackSchema>;

export const musicianFeedbackSchema = z.object({
  ref: z.string().min(10),
  rating, // overall experience at the venue
  secondaryRatings: z
    .object({
      venueSetup: rating.optional(),
      staffSupport: rating.optional(),
      audienceEngagement: rating.optional(),
    })
    .default({}),
  comments: optionalTrimmed(3000),
  issues: z.array(z.string().max(40)).default([]),
  wouldReturn: z.boolean().default(true),
  followUpRequested: z.boolean().default(false),
});
export type MusicianFeedbackInput = z.infer<typeof musicianFeedbackSchema>;

// Portal variants: the signed-in session identifies the author, so the event is named by match id.
export const portalClientFeedbackSchema = clientFeedbackSchema.omit({ ref: true }).extend({ matchId: z.string().min(10).max(64) });
export const portalMusicianFeedbackSchema = musicianFeedbackSchema.omit({ ref: true }).extend({ matchId: z.string().min(10).max(64) });

// ───────────── Admin: weights ─────────────

export const weightsSchema = z.object(
  Object.fromEntries(CRITERIA.map((c) => [c, z.coerce.number().min(0).max(100)])) as Record<(typeof CRITERIA)[number], z.ZodNumber>,
);

// ───────────── Secure response ─────────────

export const offerResponseSchema = z.object({
  token: z.string().min(20).max(200),
  action: z.enum(["ACCEPT", "DECLINE", "REQUEST_CHANGES"]),
  note: z.string().trim().max(2000).optional(),
});
