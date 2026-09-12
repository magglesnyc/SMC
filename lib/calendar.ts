import { randomBytes } from "node:crypto";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/matching/types";
import type { CalendarOwnerType } from "@/generated/prisma/enums";

// ───────────── Personal calendar links ─────────────
// Each musician / community gets one private calendar address (like a private Google Calendar
// URL). It is a bearer secret for read-only schedule data, is revocable, and can be rotated.

/** Stable personal calendar URL for an owner (one live link per person). */
export async function calendarUrlFor(ownerType: CalendarOwnerType, ownerId: string): Promise<string> {
  const existing = await prisma.calendarToken.findFirst({ where: { ownerType, ownerId, revokedAt: null } });
  if (existing) return `${base()}/calendar/${existing.token}`;
  const token = randomBytes(24).toString("base64url");
  await prisma.calendarToken.create({ data: { token, ownerType, ownerId } });
  return `${base()}/calendar/${token}`;
}

/** Revoke the current link and issue a new one (e.g. if it was forwarded). */
export async function rotateCalendarToken(ownerType: CalendarOwnerType, ownerId: string) {
  await prisma.calendarToken.updateMany({ where: { ownerType, ownerId, revokedAt: null }, data: { revokedAt: new Date() } });
  return calendarUrlFor(ownerType, ownerId);
}

export async function resolveCalendarToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const row = await prisma.calendarToken.findFirst({ where: { token, revokedAt: null } });
  if (!row) return null;
  prisma.calendarToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return row;
}

const base = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

// ───────────── Events ─────────────

export interface CalendarEvent {
  id: string;
  matchId: string;
  eventRequestId: string;
  reference: string;
  title: string;
  start: Date;
  end: Date;
  timezone: string; // facility zone
  facilityName: string;
  facilityId: string;
  musicianName: string;
  musicianId: string;
  location: string;
  service: string;
  status: "TENTATIVE" | "CONFIRMED" | "COMPLETED";
  exception: string | null;
}

export interface EventFilter {
  musicianId?: string;
  facilityId?: string;
  from?: Date;
  to?: Date;
  includeTentative?: boolean;
}

/** Selected bookings as calendar events. Cancelled bookings are excluded; no-shows are kept and flagged. */
export async function loadCalendarEvents(f: EventFilter): Promise<CalendarEvent[]> {
  const rows = await prisma.match.findMany({
    where: {
      selected: true,
      ...(f.musicianId ? { musicianId: f.musicianId } : {}),
      ...(f.facilityId ? { facilityId: f.facilityId } : {}),
      status: { in: f.includeTentative === false ? ["CONFIRMED", "COMPLETED"] : ["OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED", "COMPLETED"] },
      OR: [{ exceptionStatus: null }, { exceptionStatus: "NO_SHOW" }],
      eventRequest: { startAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } },
    },
    include: { eventRequest: true, facility: true, musician: true },
    orderBy: { eventRequest: { startAt: "asc" } },
  });
  return rows.map((m) => {
    const r = m.eventRequest;
    const musicianName = m.musician.stageName ?? `${m.musician.firstName} ${m.musician.lastName}`;
    return {
      id: m.id,
      matchId: m.id,
      eventRequestId: r.id,
      reference: r.reference,
      title: `${musicianName} at ${m.facility.name}`,
      start: r.startAt,
      end: new Date(r.startAt.getTime() + r.durationMinutes * 60_000),
      timezone: r.timezone,
      facilityName: m.facility.name,
      facilityId: m.facilityId,
      musicianName,
      musicianId: m.musicianId,
      location: [r.locationAddressLine1 ?? m.facility.addressLine1, r.locationCity ?? m.facility.city, r.locationState ?? m.facility.state].filter(Boolean).join(", "),
      service: SERVICE_TYPE_LABELS[r.serviceType as ServiceType] ?? r.serviceType,
      status: m.status === "COMPLETED" ? "COMPLETED" : m.status === "CONFIRMED" ? "CONFIRMED" : "TENTATIVE",
      exception: m.exceptionStatus,
    };
  });
}

// ───────────── Date helpers (all in a given IANA zone) ─────────────

export type View = "day" | "week" | "month" | "year" | "list";

export const dayKey = (d: Date, tz: string) => formatInTimeZone(d, tz, "yyyy-MM-dd");

/** Local calendar date parts of an instant in a zone. */
export function zonedParts(d: Date, tz: string) {
  const z = toZonedTime(d, tz);
  return { y: z.getFullYear(), m: z.getMonth(), d: z.getDate(), dow: z.getDay() };
}

/** Build a naive local Date (used only for grid arithmetic and labels). */
export const naive = (y: number, m: number, d: number) => new Date(y, m, d);
export const naiveKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Parse a `date` query param (yyyy-mm-dd) or fall back to today in the zone. */
export function anchorDate(param: string | undefined, tz: string): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [y, m, d] = param.split("-").map(Number);
    return naive(y, m - 1, d);
  }
  const p = zonedParts(new Date(), tz);
  return naive(p.y, p.m, p.d);
}

/** Group events by local day key in a zone. */
export function groupByDay(events: CalendarEvent[], tz: string): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e.start, tz);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return map;
}

// ───────────── iCalendar feed ─────────────

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => {
  const out: string[] = [];
  let s = line;
  while (s.length > 73) {
    out.push(s.slice(0, 73));
    s = " " + s.slice(73);
  }
  out.push(s);
  return out.join("\r\n");
};

export function toIcs(events: CalendarEvent[], calendarName: string, audience: "MUSICIAN" | "FACILITY" | "STAFF"): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Senior Music Connection//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(calendarName)}`, "X-PUBLISHED-TTL:PT1H"];
  const now = icsDate(new Date());
  for (const e of events) {
    const summary = audience === "MUSICIAN" ? `${e.service} at ${e.facilityName}` : audience === "FACILITY" ? `${e.musicianName} — ${e.service}` : e.title;
    const desc = [`Event ${e.reference}`, `Program: ${e.service}`, `Musician: ${e.musicianName}`, `Community: ${e.facilityName}`, e.status === "TENTATIVE" ? "Status: awaiting confirmation" : `Status: ${e.status.toLowerCase()}`, e.exception ? `Note: ${e.exception.toLowerCase().replace("_", " ")}` : ""].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.matchId}@seniormusicconnection`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      fold(`SUMMARY:${esc((e.status === "TENTATIVE" ? "(Tentative) " : "") + summary)}`),
      fold(`LOCATION:${esc(e.location)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      `STATUS:${e.status === "TENTATIVE" ? "TENTATIVE" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
