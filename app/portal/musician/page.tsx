import Link from "next/link";
import { requireMusicianUser } from "@/lib/rbac";
import { musicianHome } from "@/lib/services/portal";
import { Section, StarRow } from "@/components/portal/Shell";
import { BookingCard } from "@/components/portal/Booking";
import { RespondForm } from "@/components/portal/client";
import { musicianRespond } from "@/app/portal/actions";
import { Empty, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Your performances" };
export const dynamic = "force-dynamic";

export default async function MusicianHomePage() {
  const u = await requireMusicianUser();
  const { musician, offers, upcoming, past, toRate, reviews } = await musicianHome(u.musicianId);
  const scheduled = upcoming.filter((b) => !offers.includes(b));
  const next = scheduled[0];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Welcome back, {musician.firstName}</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">{next ? `Next up: ${next.facility.name}, ${fmtDate(next.eventRequest.startAt, next.eventRequest.timezone)}` : "Your performances"}</h1>
      <p className="mt-2 max-w-2xl text-ink/70">Offers waiting for your answer, everywhere you are booked to play, and how communities have rated you.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Offers to answer" value={offers.length} hint="respond within 72 hours" tone={offers.length ? "warning" : undefined} />
        <Stat label="Booked" value={scheduled.length} hint="upcoming performances" />
        <Stat label="Your rating" value={musician.avgRating ? musician.avgRating.toFixed(1) : "—"} hint={`${musician.ratingCount} community ratings · ${musician.completedEvents} performances`} />
        <Stat label="Venues to rate" value={toRate.length} hint="recent performances" tone={toRate.length ? "warning" : undefined} />
      </div>

      {offers.length ? (
        <Section title="Offers waiting for you" description="Accept and the community is asked to confirm. Declining quickly lets us find someone else.">
          <div className="grid gap-4 lg:grid-cols-2">
            {offers.map((b) => (
              <BookingCard key={b.id} b={b} perspective="MUSICIAN" respond={<RespondForm action={musicianRespond} matchId={b.id} acceptLabel="Accept this booking" />} />
            ))}
          </div>
        </Section>
      ) : null}

      {toRate.length ? (
        <Section title="How was the venue?" description="Your notes on parking, room setup and staff help the next musician, and help us coach communities.">
          <div className="grid gap-4 lg:grid-cols-2">
            {toRate.map((b) => (
              <BookingCard key={b.id} b={b} perspective="MUSICIAN" rateHref={`/portal/musician/feedback/${b.id}`} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Where you are booked" description="Confirmed and pending performances, with addresses and load-in notes." actions={<div className="flex gap-3 text-sm font-semibold"><Link href="/portal/musician/calendar" className="text-brand-700 underline decoration-gold-500 underline-offset-4">Calendar →</Link><Link href="/portal/musician/venues" className="text-brand-700 underline decoration-gold-500 underline-offset-4">All venues →</Link></div>}>
        {scheduled.length === 0 ? <Empty>Nothing scheduled yet. Offers arrive by email and appear here.</Empty> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {scheduled.map((b) => (
            <BookingCard key={b.id} b={b} perspective="MUSICIAN" />
          ))}
        </div>
      </Section>

      <Section title="What communities say" description="Your most recent ratings." actions={<Link href="/portal/musician/reviews" className="text-sm font-semibold text-brand-700 underline decoration-gold-500 underline-offset-4">All ratings →</Link>}>
        {reviews.length === 0 ? <Empty>No ratings yet. They appear after your first completed performance.</Empty> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {reviews.map((r) => (
            <div key={r.id} className="surface rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <StarRow value={r.rating} />
                <span className="text-xs text-stone-500">{r.facility.name}, {r.facility.city} · {fmtDate(r.submittedAt)}</span>
              </div>
              {r.comments ? <p className="mt-2 text-sm text-ink/80">&ldquo;{r.comments}&rdquo;</p> : null}
            </div>
          ))}
        </div>
      </Section>

      {past.length ? (
        <Section title="Past performances">
          <div className="grid gap-4 lg:grid-cols-2">
            {past.slice(0, 6).map((b) => (
              <BookingCard key={b.id} b={b} perspective="MUSICIAN" rateHref={`/portal/musician/feedback/${b.id}`} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
