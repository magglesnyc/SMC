import { toZonedTime } from "date-fns-tz";
import type { Blackout, ExistingBooking, WeeklyWindow } from "./types";

const MINUTE = 60_000;

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MINUTE);
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since local midnight, and local weekday, of a UTC instant in a timezone. */
export function localMinutes(instant: Date, timezone: string): { day: number; minutes: number; dateKey: string } {
  let zoned: Date;
  try {
    zoned = toZonedTime(instant, timezone);
  } catch {
    zoned = instant;
  }
  const day = zoned.getDay();
  const minutes = zoned.getHours() * 60 + zoned.getMinutes();
  const dateKey = `${zoned.getFullYear()}-${zoned.getMonth() + 1}-${zoned.getDate()}`;
  return { day, minutes, dateKey };
}

export interface WindowFit {
  fits: boolean;
  /** Minutes of spare room before the needed window inside the availability window. */
  slackBefore: number;
  /** Minutes of spare room after the needed window. */
  slackAfter: number;
  window?: WeeklyWindow;
}

/**
 * Does a recurring weekly window cover [neededStart, neededEnd]?
 * Windows are interpreted in the musician's local time; the needed range must fall on one local day.
 */
export function weeklyWindowFit(
  windows: WeeklyWindow[],
  neededStart: Date,
  neededEnd: Date,
  timezone: string,
): WindowFit {
  const s = localMinutes(neededStart, timezone);
  const e = localMinutes(neededEnd, timezone);
  // If the needed range crosses local midnight, treat the end as minutes past 24:00 on the start day.
  const endMinutes = s.dateKey === e.dateKey ? e.minutes : e.minutes + 24 * 60;

  let best: WindowFit = { fits: false, slackBefore: 0, slackAfter: 0 };
  for (const w of windows) {
    if (w.day !== s.day) continue;
    const ws = parseHHMM(w.start);
    const we = parseHHMM(w.end);
    if (ws === null || we === null || we <= ws) continue;
    if (ws <= s.minutes && we >= endMinutes) {
      const fit: WindowFit = {
        fits: true,
        slackBefore: s.minutes - ws,
        slackAfter: we - endMinutes,
        window: w,
      };
      if (!best.fits || Math.min(fit.slackBefore, fit.slackAfter) > Math.min(best.slackBefore, best.slackAfter)) {
        best = fit;
      }
    }
  }
  return best;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function blackoutConflict(blackouts: Blackout[], neededStart: Date, neededEnd: Date): Blackout | null {
  for (const b of blackouts) {
    const bs = new Date(b.start);
    const be = new Date(b.end);
    if (Number.isNaN(bs.getTime()) || Number.isNaN(be.getTime())) continue;
    if (overlaps(neededStart, neededEnd, bs, be)) return b;
  }
  return null;
}

/**
 * Conflict with an existing booking. `neededStart`/`neededEnd` already include this
 * event's travel and setup; the other booking is padded by its own travel estimate
 * (falling back to this event's) plus a gap.
 */
export function bookingConflict(
  bookings: ExistingBooking[],
  neededStart: Date,
  neededEnd: Date,
  fallbackTravelMinutes: number,
  gapMinutes: number,
): ExistingBooking | null {
  for (const b of bookings) {
    const pad = (b.travelMinutes ?? fallbackTravelMinutes) + gapMinutes;
    const bs = addMinutes(b.start, -pad);
    const be = addMinutes(b.end, pad);
    if (overlaps(neededStart, neededEnd, bs, be)) return b;
  }
  return null;
}
