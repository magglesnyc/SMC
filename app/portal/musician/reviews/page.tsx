import { requireMusicianUser } from "@/lib/rbac";
import { musicianReviews, serviceLabel } from "@/lib/services/portal";
import { Section, StarRow } from "@/components/portal/Shell";
import { Empty, Stat } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/utils";

export const metadata = { title: "Your ratings" };
export const dynamic = "force-dynamic";

export default async function MusicianReviewsPage() {
  const u = await requireMusicianUser();
  const { received, given, distribution } = await musicianReviews(u.musicianId);
  const avg = received.length ? received.reduce((a, r) => a + (r.rating ?? 0), 0) / received.length : null;
  const again = received.length ? Math.round((received.filter((r) => r.rating != null && r.rating >= 4).length / received.length) * 100) : null;
  const max = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Feedback</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">Your ratings</h1>
      <p className="mt-2 max-w-2xl text-ink/70">What communities said after your performances, and the ratings you gave their venues. Ratings are shared with the SMC team and never published.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Average" value={avg ? avg.toFixed(1) : "—"} hint={`${received.length} community ratings`} />
        <Stat label="4 stars or better" value={again != null ? `${again}%` : "—"} hint="communities likely to rebook" />
        <div className="surface rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-700">Breakdown</div>
          <div className="mt-2 space-y-1">
            {[...distribution].reverse().map((d) => (
              <div key={d.stars} className="flex items-center gap-2 text-xs text-ink/70">
                <span className="w-6 text-right">{d.stars}★</span>
                <div className="h-2 flex-1 rounded-full bg-gold-100"><div className="h-2 rounded-full bg-brand-700" style={{ width: `${(d.count / max) * 100}%` }} /></div>
                <span className="w-5">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Section title="From communities" description="Most recent first.">
        {received.length === 0 ? <Empty>No ratings yet.</Empty> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {received.map((r) => (
            <div key={r.id} className="surface rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StarRow value={r.rating} />
                <span className="text-xs text-stone-500">{r.facility.name}, {r.facility.city} · {fmtDate(r.eventRequest.startAt, r.eventRequest.timezone)} · {serviceLabel(r.eventRequest.serviceType)}</span>
              </div>
              {r.comments ? <p className="mt-2 text-sm text-ink/80">&ldquo;{r.comments}&rdquo;</p> : null}
              {r.issues.length ? <p className="mt-1 text-xs text-amber-800">Flagged: {r.issues.map(titleCase).join(", ")} · our team followed up</p> : null}
              <Secondary ratings={r.secondaryRatings as Record<string, number>} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Ratings you gave venues" description="Visible to the SMC team only. They help us prepare the next musician and coach communities.">
        {given.length === 0 ? <Empty>You have not rated a venue yet.</Empty> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {given.map((r) => (
            <div key={r.id} className="surface rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StarRow value={r.rating} />
                <span className="text-xs text-stone-500">{r.facility.name}, {r.facility.city} · {fmtDate(r.eventRequest.startAt, r.eventRequest.timezone)}</span>
              </div>
              {r.comments ? <p className="mt-2 text-sm text-ink/80">&ldquo;{r.comments}&rdquo;</p> : null}
              <Secondary ratings={r.secondaryRatings as Record<string, number>} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Secondary({ ratings }: { ratings: Record<string, number> }) {
  const entries = Object.entries(ratings ?? {}).filter(([, v]) => typeof v === "number");
  if (!entries.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-500">
      {entries.map(([k, v]) => (
        <span key={k}>{titleCase(k.replace(/([A-Z])/g, " $1"))}: {v}/5</span>
      ))}
    </div>
  );
}
