import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { groupByDay, naive, naiveKey, type CalendarEvent, type View } from "@/lib/calendar";

export type Audience = "MUSICIAN" | "FACILITY" | "STAFF";

export interface CalendarViewProps {
  events: CalendarEvent[];
  tz: string;
  view: View;
  anchor: Date; // naive local date
  basePath: string; // e.g. /calendar/<token> or /admin/calendar
  extraQuery?: Record<string, string | undefined>;
  audience: Audience;
  eventHref?: (e: CalendarEvent) => string | undefined;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function label(e: CalendarEvent, audience: Audience) {
  return audience === "MUSICIAN" ? e.facilityName : audience === "FACILITY" ? e.musicianName : e.title;
}

function href(base: string, view: View, d: Date, extra?: Record<string, string | undefined>) {
  const q = new URLSearchParams({ view, date: naiveKey(d) });
  for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
  return `${base}?${q.toString()}`;
}

function shift(view: View, d: Date, n: number): Date {
  if (view === "day") return naive(d.getFullYear(), d.getMonth(), d.getDate() + n);
  if (view === "week" || view === "list") return naive(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n);
  if (view === "year") return naive(d.getFullYear() + n, d.getMonth(), 1);
  return naive(d.getFullYear(), d.getMonth() + n, 1);
}

export function rangeFor(view: View, d: Date): { start: Date; end: Date } {
  if (view === "day") return { start: naive(d.getFullYear(), d.getMonth(), d.getDate()), end: naive(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
  if (view === "week") {
    const s = naive(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    return { start: s, end: naive(s.getFullYear(), s.getMonth(), s.getDate() + 7) };
  }
  if (view === "year") return { start: naive(d.getFullYear(), 0, 1), end: naive(d.getFullYear() + 1, 0, 1) };
  if (view === "list") return { start: naive(d.getFullYear(), d.getMonth(), d.getDate()), end: naive(d.getFullYear(), d.getMonth() + 3, d.getDate()) };
  const first = naive(d.getFullYear(), d.getMonth(), 1);
  const gridStart = naive(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return { start: gridStart, end: naive(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42) };
}

function title(view: View, d: Date) {
  if (view === "day") return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (view === "week") {
    const { start, end } = rangeFor("week", d);
    const e = naive(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    return `${MONTHS[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (view === "year") return String(d.getFullYear());
  if (view === "list") return "Upcoming";
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function EventChip({ e, tz, audience, href, compact }: { e: CalendarEvent; tz: string; audience: Audience; href?: string; compact?: boolean }) {
  const time = formatInTimeZone(e.start, tz, "h:mm a");
  const cls = cn(
    "block truncate rounded-md px-2 py-1 text-xs leading-tight",
    e.status === "TENTATIVE" && "border border-dashed border-gold-500 bg-gold-100/50 text-gold-700",
    e.status === "CONFIRMED" && "bg-brand-700 text-ivory",
    e.status === "COMPLETED" && "bg-brand-100 text-brand-800",
    e.exception === "NO_SHOW" && "line-through opacity-70",
  );
  const body = (
    <>
      <span className="font-semibold">{time}</span> {label(e, audience)}
      {!compact ? <span className="block text-[11px] opacity-80">{e.service}{e.status === "TENTATIVE" ? " · awaiting confirmation" : ""}</span> : null}
    </>
  );
  return href ? <Link href={href} className={cls} title={`${e.title} · ${e.service}`}>{body}</Link> : <div className={cls} title={`${e.title} · ${e.service}`}>{body}</div>;
}

export function CalendarView(p: CalendarViewProps) {
  const { view, anchor, basePath, extraQuery, tz, audience } = p;
  const byDay = groupByDay(p.events, tz);
  const todayKey = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
  const nav = (v: View, d: Date) => href(basePath, v, d, extraQuery);

  return (
    <div className="surface rounded-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-300/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <Link href={nav(view, shift(view, anchor, -1))} className="rounded-full border border-gold-500/60 px-3 py-1 text-sm font-semibold text-brand-800 hover:bg-gold-100" aria-label="Previous">‹</Link>
          <Link href={nav(view, shift(view, anchor, 1))} className="rounded-full border border-gold-500/60 px-3 py-1 text-sm font-semibold text-brand-800 hover:bg-gold-100" aria-label="Next">›</Link>
          <Link href={`${basePath}?${new URLSearchParams({ view, ...(Object.fromEntries(Object.entries(extraQuery ?? {}).filter(([, v]) => v)) as Record<string, string>) })}`} className="rounded-full border border-gold-500/60 px-3 py-1 text-sm font-semibold text-brand-800 hover:bg-gold-100">Today</Link>
          <h2 className="font-display ml-2 text-2xl font-semibold text-ink">{title(view, anchor)}</h2>
        </div>
        <div className="flex rounded-full border border-gold-300 bg-paper p-0.5 text-sm">
          {(["day", "week", "month", "year", "list"] as View[]).map((v) => (
            <Link key={v} href={nav(v, anchor)} className={cn("rounded-full px-3 py-1 font-semibold capitalize", v === view ? "bg-brand-700 text-ivory" : "text-brand-800 hover:bg-gold-100")}>{v}</Link>
          ))}
        </div>
      </div>

      <div className="p-4">
        {view === "month" ? <MonthGrid {...p} byDay={byDay} todayKey={todayKey} nav={nav} /> : null}
        {view === "week" ? <WeekGrid {...p} byDay={byDay} todayKey={todayKey} nav={nav} /> : null}
        {view === "day" ? <DayList {...p} byDay={byDay} /> : null}
        {view === "year" ? <YearGrid {...p} byDay={byDay} nav={nav} /> : null}
        {view === "list" ? <UpcomingList {...p} byDay={byDay} /> : null}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-gold-300/30 px-5 py-3 text-xs text-ink/60">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-brand-700 align-middle" />Confirmed</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded border border-dashed border-gold-500 bg-gold-100 align-middle" />Awaiting confirmation</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-brand-100 align-middle" />Completed</span>
        <span className="ml-auto">Times shown in {tz.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")}</span>
      </div>
    </div>
  );
}

type Inner = CalendarViewProps & { byDay: Map<string, CalendarEvent[]>; todayKey?: string; nav?: (v: View, d: Date) => string };

function MonthGrid({ anchor, byDay, todayKey, nav, tz, audience, eventHref }: Inner) {
  const { start } = rangeFor("month", anchor);
  const days = Array.from({ length: 42 }, (_, i) => naive(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-gold-700">{DOW.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gold-300/40 bg-gold-300/40">
        {days.map((d) => {
          const k = naiveKey(d);
          const evs = byDay.get(k) ?? [];
          const inMonth = d.getMonth() === anchor.getMonth();
          return (
            <div key={k} className={cn("min-h-[92px] bg-paper p-1.5", !inMonth && "bg-ivory/60 text-ink/40", k === todayKey && "bg-gold-100/60")}>
              <Link href={nav!("day", d)} className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold hover:bg-gold-100", k === todayKey && "bg-brand-700 text-ivory")}>{d.getDate()}</Link>
              <div className="space-y-1">
                {evs.slice(0, 3).map((e) => <EventChip key={e.id} e={e} tz={tz} audience={audience} href={eventHref?.(e)} compact />)}
                {evs.length > 3 ? <Link href={nav!("day", d)} className="block text-[11px] font-semibold text-brand-700">+{evs.length - 3} more</Link> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ anchor, byDay, todayKey, nav, tz, audience, eventHref }: Inner) {
  const { start } = rangeFor("week", anchor);
  const days = Array.from({ length: 7 }, (_, i) => naive(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-gold-300/40 bg-gold-300/40 sm:grid-cols-7">
      {days.map((d) => {
        const k = naiveKey(d);
        const evs = byDay.get(k) ?? [];
        return (
          <div key={k} className={cn("min-h-[220px] bg-paper p-2", k === todayKey && "bg-gold-100/60")}>
            <Link href={nav!("day", d)} className="block text-center text-[11px] font-bold uppercase tracking-wide text-gold-700 hover:underline">{DOW[d.getDay()]}<span className={cn("ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-sm text-ink", k === todayKey && "bg-brand-700 text-ivory")}>{d.getDate()}</span></Link>
            <div className="mt-2 space-y-1.5">{evs.map((e) => <EventChip key={e.id} e={e} tz={tz} audience={audience} href={eventHref?.(e)} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ e, tz, audience, href }: { e: CalendarEvent; tz: string; audience: Audience; href?: string }) {
  const inner = (
    <div className={cn("flex gap-4 rounded-xl border p-3", e.status === "TENTATIVE" ? "border-dashed border-gold-500 bg-gold-100/40" : e.status === "COMPLETED" ? "border-brand-100 bg-brand-50/50" : "border-brand-200 bg-paper")}>
      <div className="w-24 shrink-0 text-sm font-semibold text-brand-800">{formatInTimeZone(e.start, tz, "h:mm a")}<div className="text-xs font-normal text-ink/60">to {formatInTimeZone(e.end, tz, "h:mm a")}</div></div>
      <div className="min-w-0">
        <div className="font-semibold text-ink">{label(e, audience)}</div>
        <div className="text-sm text-ink/70">{e.service} · {e.location}</div>
        <div className="mt-0.5 text-xs text-ink/50">{e.reference}{e.status === "TENTATIVE" ? " · awaiting confirmation" : e.status === "COMPLETED" ? " · completed" : ""}{e.exception === "NO_SHOW" ? " · no-show recorded" : ""}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

function DayList({ anchor, byDay, tz, audience, eventHref }: Inner) {
  const evs = byDay.get(naiveKey(anchor)) ?? [];
  if (!evs.length) return <p className="py-10 text-center text-sm text-ink/60">Nothing scheduled this day.</p>;
  return <div className="space-y-2">{evs.map((e) => <EventRow key={e.id} e={e} tz={tz} audience={audience} href={eventHref?.(e)} />)}</div>;
}

function UpcomingList({ byDay, tz, audience, eventHref }: Inner) {
  const keys = [...byDay.keys()].sort();
  if (!keys.length) return <p className="py-10 text-center text-sm text-ink/60">Nothing scheduled in the next three months.</p>;
  return (
    <div className="space-y-5">
      {keys.map((k) => {
        const [y, m, d] = k.split("-").map(Number);
        const nd = naive(y, m - 1, d);
        return (
          <div key={k}>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gold-700">{DOW[nd.getDay()]}, {MONTHS[nd.getMonth()]} {nd.getDate()}, {nd.getFullYear()}</div>
            <div className="space-y-2">{byDay.get(k)!.map((e) => <EventRow key={e.id} e={e} tz={tz} audience={audience} href={eventHref?.(e)} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function YearGrid({ anchor, byDay, nav }: Inner) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTHS.map((name, m) => {
        const first = naive(anchor.getFullYear(), m, 1);
        const days = Array.from({ length: 42 }, (_, i) => naive(first.getFullYear(), m, 1 - first.getDay() + i));
        const count = days.filter((d) => d.getMonth() === m).reduce((n, d) => n + (byDay.get(naiveKey(d))?.length ?? 0), 0);
        return (
          <Link key={name} href={nav!("month", first)} className="rounded-xl border border-gold-300/40 bg-paper p-3 hover:border-gold-500">
            <div className="flex items-baseline justify-between"><span className="font-display font-semibold text-ink">{name}</span><span className="text-xs text-ink/60">{count ? `${count} event${count > 1 ? "s" : ""}` : ""}</span></div>
            <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[10px]">
              {days.map((d) => {
                const k = naiveKey(d);
                const n = byDay.get(k)?.length ?? 0;
                return <div key={k} className={cn("h-5 rounded leading-5", d.getMonth() !== m ? "text-transparent" : n ? "bg-brand-700 font-semibold text-ivory" : "text-ink/60")}>{d.getDate()}</div>;
              })}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
