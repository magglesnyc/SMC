/**
 * Parsers for the free-text and label conventions used on the Monday boards. Pure functions; tested in
 * tests/monday.parse.test.ts. Every parser returns null (never throws) when the text is not understood,
 * so the raw text can be kept alongside a best-effort structured value.
 */

// ───────────────────────── Time of performance ─────────────────────────

export interface TimeRange {
  /** "HH:MM" 24h, local to the facility. */
  start: string;
  durationMinutes: number;
  /** false when only a start time was found and the default duration was applied. */
  hasEnd: boolean;
}

const DEFAULT_DURATION = 60;

interface Clock {
  hour: number;
  minute: number;
  meridiem: "am" | "pm" | null;
}

function readClock(s: string): Clock | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (hour < 1 || hour > 12 && !(hour <= 23 && !m[3])) return null;
  if (minute > 59) return null;
  const meridiem = m[3] ? (m[3].startsWith("a") ? "am" : "pm") : null;
  return { hour, minute, meridiem };
}

/** Senior-living events run in the daytime: an unlabelled 1–7 o'clock is afternoon, 8–11 is morning. */
function to24(c: Clock, fallback: "am" | "pm" | null): number {
  if (c.hour > 12) return c.hour; // already 24h
  const mer = c.meridiem ?? fallback ?? (c.hour >= 8 && c.hour <= 11 ? "am" : "pm");
  if (mer === "am") return c.hour === 12 ? 0 : c.hour;
  return c.hour === 12 ? 12 : c.hour + 12;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "6:30 to 7:30 pm", "2 PM - 3 PM", "2:30-3:30", "10am-12pm", "6:30pm", "1:00 - 2:00 p.m."
 * Returns null for "TBD", "flexible", empty, or anything unrecognised.
 */
export function parseTimeRange(text: string | null | undefined): TimeRange | null {
  if (!text) return null;
  const cleaned = text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(\d)\s*(a|p)\.?m\.?/g, "$1$2m")
    .replace(/\bnoon\b/g, "12pm")
    .trim();
  if (!cleaned || /tbd|flexible|any ?time|open/.test(cleaned)) return null;
  const parts = cleaned.split(/\s*(?:-|–|—|to|until|till|through)\s*/).filter(Boolean);
  const first = parts[0] ? readClock(parts[0]) : null;
  if (!first) return null;
  const second = parts[1] ? readClock(parts[1]) : null;
  if (!second) {
    const h = to24(first, null);
    return { start: `${pad(h)}:${pad(first.minute)}`, durationMinutes: DEFAULT_DURATION, hasEnd: false };
  }
  // "6:30 to 7:30 pm": the end's meridiem applies to the start unless that would put the start after the end.
  let sh = to24(first, first.meridiem ?? second.meridiem);
  const eh = to24(second, second.meridiem ?? first.meridiem);
  let startMin = sh * 60 + first.minute;
  const endMin = eh * 60 + second.minute;
  if (startMin >= endMin && !first.meridiem && sh >= 12) {
    sh -= 12; // e.g. "11-1pm" → 11am
    startMin = sh * 60 + first.minute;
  }
  if (startMin >= endMin) return { start: `${pad(sh)}:${pad(first.minute)}`, durationMinutes: DEFAULT_DURATION, hasEnd: false };
  const duration = endMin - startMin;
  if (duration > 8 * 60) return null;
  return { start: `${pad(sh)}:${pad(first.minute)}`, durationMinutes: duration, hasEnd: true };
}

// ───────────────────────── Money ─────────────────────────

export interface Money {
  amount: number;
  structure: "PER_EVENT" | "PER_HOUR";
  /** "and up", "negotiable", a range: the number is a floor, not a quote. */
  approximate: boolean;
}

/** "$200 per hour" → 200 PER_HOUR; "$500 and up" → 500 (approximate); "150-200" → 150 (approximate); "TBD" → null. */
export function parseMoney(text: string | null | undefined): Money | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/,/g, "");
  const m = t.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const perHour = /\/\s*h|per\s*h|hourly|an hour|hr\b/.test(t);
  const approximate = /and up|\+|negotiable|range|-\s*\$?\d|to \$?\d|depends|starting|min/.test(t);
  return { amount, structure: perHour ? "PER_HOUR" : "PER_EVENT", approximate };
}

// ───────────────────────── Travel radius ─────────────────────────

/** Rough highway speed used to turn "45 minutes" into a radius. */
const MILES_PER_MINUTE = 0.75;

/** "25 miles" → 25; "1 hour" → 45; "50+ miles" → 50; "70 mile radius" → 70; "OPEN" → 150; unknown → null. */
export function parseTravelMiles(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bopen\b|anywhere|no limit/.test(t)) return 150;
  const values: number[] = [];
  for (const chunk of t.split(/[,/]|\bor\b/)) {
    const hours = chunk.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
    const minutes = chunk.match(/(\d+)\s*(?:minutes?|mins?)\b/);
    const miles = chunk.match(/(\d+)(?:\s*(?:-|to)\s*(\d+))?\s*\+?\s*(?:miles?|mi\b)/);
    if (miles) values.push(Number(miles[2] ?? miles[1]));
    else if (hours) values.push(Math.round(Number(hours[1]) * 60 * MILES_PER_MINUTE));
    else if (minutes) values.push(Math.round(Number(minutes[1]) * MILES_PER_MINUTE));
    else {
      const bare = chunk.match(/^\s*(\d+)\s*\+?\s*$/);
      if (bare) values.push(Number(bare[1]));
    }
  }
  if (!values.length) return null;
  return Math.max(...values);
}

// ───────────────────────── Attendance ─────────────────────────

/** "1-10" → 10, "30+" → 30, "50-60" → 60, "about 25" → 25. Upper bound of a range: the room must fit them. */
export function parseAttendance(text: string | null | undefined): number | null {
  if (!text) return null;
  const nums = text.match(/\d+/g)?.map(Number) ?? [];
  if (!nums.length) return null;
  return Math.max(...nums);
}

// ───────────────────────── Names, states, emails, phones ─────────────────────────

export function splitName(full: string): { firstName: string; lastName: string } {
  const clean = full.replace(/\s+/g, " ").trim();
  if (!clean) return { firstName: "", lastName: "" };
  // "Bob Claymier - Museaic" → person is before the dash
  const person = clean.split(/\s+[-–—]\s+/)[0];
  const parts = person.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const STATES: Record<string, string> = {
  ohio: "OH", oh: "OH", kentucky: "KY", ky: "KY", indiana: "IN", in: "IN", michigan: "MI", mi: "MI",
  minnesota: "MN", mn: "MN", wisconsin: "WI", wi: "WI", "west virginia": "WV", wv: "WV", pennsylvania: "PA", pa: "PA",
  florida: "FL", fl: "FL", tennessee: "TN", tn: "TN", illinois: "IL", il: "IL", arizona: "AZ", az: "AZ",
};

/** "Ohio", "OH", "oh." → "OH". Unknown values are returned upper-cased and trimmed. */
export function normaliseState(text: string | null | undefined): string {
  const t = (text ?? "").trim().replace(/\.$/, "").toLowerCase();
  if (!t) return "";
  return STATES[t] ?? (t.length === 2 ? t.toUpperCase() : text!.trim());
}

/** Monday email cells sometimes hold several addresses ("a@x; b@x - a@x"). Returns them in order, deduplicated. */
export function parseEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return Array.from(new Set(found));
}

export function firstEmail(text: string | null | undefined): string {
  return parseEmails(text)[0] ?? "";
}

export function normalisePhoneText(text: string | null | undefined): string {
  const digits = (text ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return (text ?? "").trim();
}

// ───────────────────────── Label → enum mappings ─────────────────────────

import type { FacilityStatus, MusicianStatus } from "@/generated/prisma/enums";

export function mapEntertainerStatus(label: string): MusicianStatus {
  switch (label.trim().toLowerCase()) {
    case "active":
      return "ACTIVE";
    case "not active":
      return "INACTIVE";
    case "do not use":
      return "SUSPENDED";
    case "need info":
      return "REVIEW";
    default:
      return "REVIEW"; // "Select Status" / blank: on the partner list but not vetted in Monday
  }
}

export function mapApplicationStatus(label: string): MusicianStatus {
  switch (label.trim().toLowerCase()) {
    case "approved":
      return "APPROVED";
    case "on hold":
      return "REVIEW";
    case "denied":
      return "INACTIVE";
    default:
      return "SUBMITTED";
  }
}

export function mapClientStatus(label: string): FacilityStatus {
  switch (label.trim().toLowerCase()) {
    case "inactive":
      return "INACTIVE";
    case "prospect":
      return "PENDING_REVIEW";
    default:
      return "ACTIVE";
  }
}

/** Monday audience labels → the app's facilityType / audience tags. */
export function mapAudienceTag(label: string): string | null {
  const t = label.trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("assisted")) return "assisted-living";
  if (t.startsWith("independ")) return "independent-living"; // also catches the "Independant" misspelling
  if (t.startsWith("memory")) return "memory-care";
  if (t.startsWith("nursing") || t.startsWith("skilled") || t === "rehab") return "skilled-nursing";
  if (t === "community" || t.startsWith("community")) return "senior-center";
  if (t === "family") return "family";
  if (t.startsWith("small")) return "small-group";
  if (t.startsWith("large")) return "large-group";
  if (t.startsWith("special")) return "special-needs";
  return t.replace(/[^a-z0-9]+/g, "-");
}

const FACILITY_TYPES = new Set(["assisted-living", "independent-living", "memory-care", "skilled-nursing", "senior-center", "adult-day"]);

export function mapFacilityType(labels: string[]): string {
  for (const l of labels) {
    const tag = mapAudienceTag(l);
    if (tag && FACILITY_TYPES.has(tag)) return tag;
  }
  return "assisted-living";
}

export function mapServiceType(label: string): "LIVE_ENTERTAINMENT" | "INTERACTIVE_SESSION" | "MUSIC_THERAPY" | "SPECIALTY" {
  const t = label.trim().toLowerCase();
  if (t.startsWith("interactive")) return "INTERACTIVE_SESSION";
  if (t.includes("therap")) return "MUSIC_THERAPY";
  if (t === "other") return "SPECIALTY";
  return "LIVE_ENTERTAINMENT";
}

export function mapParticipation(labels: string[]): string[] {
  const out = new Set<string>();
  for (const l of labels) {
    const t = l.toLowerCase();
    if (t.includes("therap")) out.add("MUSIC_THERAPY");
    else if (t === "other") out.add("SPECIALTY");
    else out.add("LIVE_ENTERTAINMENT");
  }
  if (!out.size) out.add("LIVE_ENTERTAINMENT");
  return [...out];
}

export function mapPreferredContact(label: string): string | null {
  const t = label.trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("text")) return "text";
  if (t.startsWith("email")) return "email";
  if (t.startsWith("phone")) return "phone";
  return t;
}

// ───────────────────────── Genres & instruments from free text ─────────────────────────

const GENRE_KEYWORDS: [RegExp, string][] = [
  [/\bcountry\b/, "country"], [/\bjazz\b/, "jazz"], [/\bbig[- ]band\b|\bswing\b/, "big-band"], [/\bclassical\b/, "classical"],
  [/\bfolk\b/, "folk"], [/\bgospel\b/, "gospel"], [/\bhymn/, "hymns"], [/\boldies\b|\b(50|60|70)'?s\b/, "oldies"],
  [/\brock\b/, "rock-n-roll"], [/\bmotown\b|\bsoul\b/, "motown"], [/\bbroadway\b|\bshow ?tunes?\b|\bmusicals?\b/, "broadway"],
  [/\blatin\b/, "latin"], [/\bbluegrass\b/, "bluegrass"], [/\bblues\b/, "blues"], [/\bpatriotic\b/, "patriotic"],
  [/\bstandards?\b|\bsinatra\b|\bcrooner/, "standards"], [/\bpop\b/, "pop"], [/\bamericana\b/, "americana"],
  [/\birish\b|\bceltic\b/, "irish"], [/\bholiday\b|\bchristmas\b/, "holiday"], [/\bsing[- ]?along/, "sing-along"],
  [/\belvis\b/, "elvis"], [/\bpolka\b/, "polka"], [/\bdisco\b/, "disco"], [/\bbeatles\b/, "beatles"],
  [/\bworship\b|\bchristian\b|\breligious\b/, "gospel"], [/\bclassic rock\b/, "classic-rock"],
];

export function extractGenres(text: string | null | undefined): string[] {
  const t = (text ?? "").toLowerCase();
  const out = new Set<string>();
  for (const [re, tag] of GENRE_KEYWORDS) if (re.test(t)) out.add(tag);
  return [...out];
}

export function splitInstruments(text: string | null | undefined): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[,;/&]|\band\b|\n/)
    .map((s) => s.replace(/\(.*?\)/g, "").trim())
    .filter((s) => s && s.length < 30);
}

export function splitLabels(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
