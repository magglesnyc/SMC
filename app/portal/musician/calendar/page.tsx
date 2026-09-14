import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireMusicianUser } from "@/lib/rbac";
import { anchorDate, calendarUrlFor, loadCalendarEvents, type View } from "@/lib/calendar";
import { CalendarView, rangeFor } from "@/components/calendar/CalendarView";

export const metadata = { title: "Your calendar" };
export const dynamic = "force-dynamic";

const VIEWS: View[] = ["day", "week", "month", "year", "list"];

export default async function MusicianCalendarPage(props: PageProps<"/portal/musician/calendar">) {
  const u = await requireMusicianUser();
  const sp = await props.searchParams;
  const musician = await prisma.musician.findUniqueOrThrow({ where: { id: u.musicianId }, select: { timezone: true } });
  const tz = musician.timezone;
  const view = VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const anchor = anchorDate(typeof sp.date === "string" ? sp.date : undefined, tz);
  const { start, end } = rangeFor(view, anchor);
  const [events, feedUrl] = await Promise.all([loadCalendarEvents({ musicianId: u.musicianId, from: fromZonedTime(start, tz), to: fromZonedTime(end, tz) }), calendarUrlFor("MUSICIAN", u.musicianId)]);
  const ics = `${feedUrl}/feed.ics`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Every community you are booked at</p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-ink/60">Shown in your home time zone. Dashed entries are still awaiting confirmation.</p>
        </div>
        <details className="surface rounded-2xl p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-brand-800">Add to Google, Apple or Outlook</summary>
          <p className="mt-2 text-ink/75">Subscribe to this address in your calendar app and bookings appear automatically:</p>
          <code className="mt-1 block break-all rounded bg-gold-100 px-2 py-1 text-xs">{ics}</code>
          <a href={ics.replace(/^https?:/, "webcal:")} className="mt-3 inline-block rounded-full bg-brand-700 px-4 py-1.5 text-xs font-semibold text-ivory">Subscribe</a>
          <a href={ics} className="ml-2 inline-block rounded-full border border-gold-500 px-4 py-1.5 text-xs font-semibold text-brand-800">Download .ics</a>
        </details>
      </div>
      <CalendarView events={events} tz={tz} view={view} anchor={anchor} basePath="/portal/musician/calendar" audience="MUSICIAN" eventHref={() => "/portal/musician/venues"} />
    </div>
  );
}
