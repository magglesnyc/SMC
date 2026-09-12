import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatInTimeZone } from "date-fns-tz";

/** Staff-facing default zone for timestamps that have no facility context. */
export const DEFAULT_TZ = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? "America/New_York";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDateTime(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return formatInTimeZone(date, tz, "EEE, MMM d, yyyy 'at' h:mm a zzz");
  } catch {
    return date.toISOString();
  }
}

export function fmtDate(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return formatInTimeZone(date, tz, "EEE, MMM d, yyyy");
  } catch {
    return date.toISOString();
  }
}

export function fmtTime(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return formatInTimeZone(date, tz, "h:mm a zzz");
  } catch {
    return date.toISOString();
  }
}

export function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 3_600_000;
}

export function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export function decimalToNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v.toString());
  return Number.isNaN(n) ? null : n;
}

export function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(","));
  return lines.join("\r\n");
}
