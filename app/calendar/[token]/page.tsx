import { fromZonedTime } from "date-fns-tz";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { anchorDate, loadCalendarEvents, resolveCalendarToken, type View } from "@/lib/calendar";
import { CalendarView, rangeFor } from "@/components/calendar/CalendarView";
import { Wordmark } from "@/components/brand";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const metadata = { title: "My calendar" };
export const dynamic = "force-dynamic";

const VIEWS: View[] = ["day", "week", "month", "year", "list"];

export default async function PersonalCalendarPage(props: PageProps<"/calendar/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const h = await headers();
  if (!rateLimit(`calendar:${clientIp(h)}`, 120, 10 * 60_000).ok) return <Shell><Inactive text="Too many requests. Please try again in a few minutes." /></Shell>;

  const row = await resolveCalendarToken(token);
  if (!row) return <Shell><Inactive text="This calendar link is no longer active. Reply to any email from Senior Music Connection and we will send you a new one." /></Shell>;

  const owner =
    row.ownerType === "MUSICIAN"
      ? await prisma.musician.findUnique({ where: { id: row.ownerId }, select: { firstName: true, lastName: true, stageName: true, timezone: true } })
      : await prisma.facility.findUnique({ where: { id: row.ownerId }, select: { name: true, timezone: true } });
  if (!owner) return <Shell><Inactive text="We could not find the record for this calendar." /></Shell>;

  const tz = owner.timezone;
  const view = VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const anchor = anchorDate(typeof sp.date === "string" ? sp.date : undefined, tz);
  const { start, end } = rangeFor(view, anchor);
  const events = await loadCalendarEvents({
    ...(row.ownerType === "MUSICIAN" ? { musicianId: row.ownerId } : { facilityId: row.ownerId }),
    from: fromZonedTime(start, tz),
    to: fromZonedTime(end, tz),
  });
  const name = "name" in owner ? owner.name : (owner.stageName ?? `${owner.firstName} ${owner.lastName}`);
  const feedUrl = `${process.env.APP_BASE_URL ?? ""}/calendar/${token}/feed.ics`;
  const webcal = feedUrl.replace(/^https?:/, "webcal:");

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">{row.ownerType === "MUSICIAN" ? "Your performances" : "Performers at your community"}</p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">{name}</h1>
          <p className="mt-1 text-sm text-ink/60">This is your private calendar link. Please do not forward it; ask us for a new one if it is shared.</p>
        </div>
        <details className="surface rounded-2xl p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-brand-800">Add to Google, Apple or Outlook calendar</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink/75">
            <li>Copy this address: <code className="rounded bg-gold-100 px-1 text-xs">{feedUrl}</code></li>
            <li>In your calendar app choose <em>Subscribe</em> / <em>Add calendar from URL</em> and paste it.</li>
            <li>New bookings and changes appear automatically within about an hour.</li>
          </ol>
          <a href={webcal} className="mt-3 inline-block rounded-full bg-brand-700 px-4 py-1.5 text-xs font-semibold text-ivory">Subscribe (webcal)</a>
          <a href={feedUrl} className="ml-2 inline-block rounded-full border border-gold-500 px-4 py-1.5 text-xs font-semibold text-brand-800">Download .ics</a>
        </details>
      </div>
      <CalendarView events={events} tz={tz} view={view} anchor={anchor} basePath={`/calendar/${token}`} audience={row.ownerType} />
    </Shell>
  );
}

function Inactive({ text }: { text: string }) {
  return (
    <div className="surface rounded-2xl p-8 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Calendar unavailable</h1>
      <p className="mt-2 text-sm text-ink/70">{text}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gold-300/40 bg-paper/80">
        <div className="mx-auto max-w-6xl px-6 py-4"><Wordmark compact /></div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
