import Link from "next/link";
import { requireFacilityUser } from "@/lib/rbac";
import { facilityHome, musicianName } from "@/lib/services/portal";
import { Section, StarRow } from "@/components/portal/Shell";
import { BookingCard } from "@/components/portal/Booking";
import { RespondForm } from "@/components/portal/client";
import { facilityRespond } from "@/app/portal/actions";
import { Empty, Stat, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";
import { serviceLabel } from "@/lib/services/portal";

export const metadata = { title: "Your community" };
export const dynamic = "force-dynamic";

export default async function FacilityHomePage() {
  const u = await requireFacilityUser();
  const { facility, upcoming, past, requests, toRate, preferences } = await facilityHome(u.facilityId);
  const offers = upcoming.filter((b) => (b.status === "OFFERED" || b.status === "PARTIALLY_ACCEPTED") && b.facilityResponse == null);
  const confirmed = upcoming.filter((b) => !offers.includes(b));
  const preferred = preferences.filter((p) => p.kind === "PREFERRED");
  const ratedCount = past.filter((b) => b.feedback.some((f) => f.kind === "CLIENT" && f.submittedAt)).length;

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Welcome back, {u.name.split(" ")[0]}</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">Music at {facility.name}</h1>
      <p className="mt-2 max-w-2xl text-ink/70">Everything about the performers coming to your community: what is booked, what needs your confirmation, and who you could invite next.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Coming up" value={upcoming.length} hint="performances on the calendar" />
        <Stat label="Needs your reply" value={offers.length} hint="offers awaiting confirmation" tone={offers.length ? "warning" : undefined} />
        <Stat label="To rate" value={toRate.length} hint="recent performances" tone={toRate.length ? "warning" : undefined} />
        <Stat label="Hosted so far" value={past.filter((b) => b.status === "COMPLETED").length} hint={`${ratedCount} rated by you`} />
      </div>

      {offers.length ? (
        <Section title="Please confirm" description="A performer has been proposed for these events. Confirm and it goes on both calendars.">
          <div className="grid gap-4 lg:grid-cols-2">
            {offers.map((b) => (
              <BookingCard key={b.id} b={b} perspective="FACILITY" profileHref={`/portal/facility/performers/${b.musicianId}`} respond={<RespondForm action={facilityRespond} matchId={b.id} acceptLabel="Confirm this performer" />} />
            ))}
          </div>
        </Section>
      ) : null}

      {toRate.length ? (
        <Section title="How did it go?" description="Your rating helps us match you with the right performers, and it is shared with our team, not published.">
          <div className="grid gap-4 lg:grid-cols-2">
            {toRate.map((b) => (
              <BookingCard key={b.id} b={b} perspective="FACILITY" rateHref={`/portal/facility/feedback/${b.id}`} profileHref={`/portal/facility/performers/${b.musicianId}`} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Performers you have booked" description="Upcoming performances at your community." actions={<Link href="/portal/facility/calendar" className="text-sm font-semibold text-brand-700 underline decoration-gold-500 underline-offset-4">Open calendar →</Link>}>
        {confirmed.length === 0 ? <Empty>Nothing booked yet. <Link href="/portal/facility/performers" className="font-semibold text-brand-700 underline">Browse performers</Link> or <Link href={`/request?facility=${facility.id}`} className="font-semibold text-brand-700 underline">request a musician</Link>.</Empty> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {confirmed.map((b) => (
            <BookingCard key={b.id} b={b} perspective="FACILITY" profileHref={`/portal/facility/performers/${b.musicianId}`} />
          ))}
        </div>
      </Section>

      {requests.length ? (
        <Section title="Requests in progress" description="Our team is matching these. You will get an email, and a card above, as soon as a performer is proposed.">
          <div className="surface divide-y divide-gold-300/30 rounded-2xl">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <div className="font-semibold text-ink">{fmtDateTime(r.startAt, r.timezone)}</div>
                  <div className="text-ink/65">{serviceLabel(r.serviceType)} · {r.durationMinutes} min · Ref {r.reference}</div>
                </div>
                <StatusBadge status={r.status === "SUBMITTED" || r.status === "READY_TO_MATCH" || r.status === "MATCHING" || r.status === "AWAITING_APPROVAL" ? "MATCHING" : r.status} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Performers you could book" description="Your preferred performers first, then musicians on our roster who travel to your area." actions={<Link href="/portal/facility/performers" className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-semibold text-ivory hover:bg-brand-800">Find performers →</Link>}>
        {preferred.length === 0 ? (
          <Empty>Mark performers as preferred from their profile and they will appear here for quick rebooking.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preferred.map((p) => (
              <Link key={p.id} href={`/portal/facility/performers/${p.musicianId}`} className="surface rounded-2xl p-4 transition hover:border-gold-500">
                <div className="font-display text-lg font-semibold text-ink">{musicianName(p.musician)}</div>
                <div className="mt-1 text-xs text-ink/60">{p.musician.genres.slice(0, 3).join(" · ")}</div>
                <div className="mt-2"><StarRow value={p.musician.avgRating} /> <span className="text-xs text-stone-500">({p.musician.ratingCount})</span></div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {past.length ? (
        <Section title="Past performances" description="Ratings you gave, and how performers rated your venue.">
          <div className="grid gap-4 lg:grid-cols-2">
            {past.slice(0, 8).map((b) => (
              <BookingCard key={b.id} b={b} perspective="FACILITY" rateHref={`/portal/facility/feedback/${b.id}`} profileHref={`/portal/facility/performers/${b.musicianId}`} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
