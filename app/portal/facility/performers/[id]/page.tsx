import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFacilityUser } from "@/lib/rbac";
import { facilityMusicianProfile } from "@/lib/services/portal";
import { Section, StarRow } from "@/components/portal/Shell";
import { BookingCard } from "@/components/portal/Booking";
import { PreferredToggle } from "@/components/portal/client";
import { facilityTogglePreferred } from "@/app/portal/actions";
import { Badge, DL, Empty } from "@/components/ui";
import { fmtDate, fmtMoney, titleCase } from "@/lib/utils";
import type { WeeklyWindow } from "@/lib/matching/types";

export const metadata = { title: "Performer" };
export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function FacilityPerformerProfilePage(props: PageProps<"/portal/facility/performers/[id]">) {
  const u = await requireFacilityUser();
  const { id } = await props.params;
  const data = await facilityMusicianProfile(u.facilityId, id);
  if (!data) notFound();
  const { musician: m, history, preference, reviews } = data;
  const windows = (m.weeklyAvailability as unknown as WeeklyWindow[]) ?? [];
  const requestHref = `/request?facility=${encodeURIComponent(u.facilityId)}&musician=${encodeURIComponent(m.name)}`;

  return (
    <div>
      <Link href="/portal/facility/performers" className="text-sm font-semibold text-brand-700">← All performers</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">{m.city}, {m.state}</p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">{m.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <StarRow value={m.avgRating} size="lg" />
            <span className="text-sm text-stone-500">{m.ratingCount ? `${m.avgRating?.toFixed(1)} from ${m.ratingCount} community ratings · ${m.completedEvents} performances` : "New to the roster"}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={requestHref} className="rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-ivory shadow-warm hover:bg-brand-800">Request {m.name.split(" ")[0]} for an event →</Link>
          <PreferredToggle action={facilityTogglePreferred} musicianId={m.id} preferred={preference === "PREFERRED"} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="surface rounded-2xl p-5 lg:col-span-2">
          <DL
            items={[
              ["Programs", m.entertainmentTypes.map((t) => titleCase(t)).join(", ")],
              ["Genres", m.genres.join(", ")],
              ["Instruments", m.instruments.join(", ")],
              ["Sing-along / participatory", m.offersInteractive ? "Yes" : "No"],
              ["Audience experience", m.audienceExperience.map((t) => titleCase(t)).join(", ") || "—"],
              ["Community types", m.facilityTypeExperience.map((t) => titleCase(t)).join(", ") || "—"],
              ["Therapeutic qualifications", m.therapeuticQualifications.map((t) => titleCase(t)).join(", ") || "None"],
              ["Certifications", m.certifications.map((t) => titleCase(t)).join(", ") || "—"],
              ["Rate", `${fmtMoney(m.standardRate)} ${m.rateStructure === "PER_HOUR" ? "per hour" : "per event"}${m.travelFeeApplies ? " + travel fee" : ""} · minimum ${m.minBookingMinutes} min`],
              ["Travels up to", `${m.maxTravelMiles} miles`],
              ["Background check", m.backgroundCheckStatus === "CLEARED" ? "Cleared" : titleCase(m.backgroundCheckStatus)],
              ["Insured", m.insuranceExpiresAt ? `Yes, through ${fmtDate(m.insuranceExpiresAt)}` : "On file with SMC"],
            ]}
          />
        </div>
        <div className="surface rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Usually available</h2>
          {windows.length === 0 ? <p className="mt-2 text-sm text-stone-500">Ask us: availability is confirmed for every request.</p> : null}
          <ul className="mt-2 space-y-1 text-sm text-ink/80">
            {windows.map((w, i) => (
              <li key={i} className="flex justify-between"><span>{DOW[w.day]}</span><span>{w.start} – {w.end}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-stone-500">Exact dates are checked when you request; already-booked slots are excluded automatically.</p>
        </div>
      </div>

      <Section title={`At ${history.length ? "your community" : "your community"}`} description={history.length ? "Every visit by this performer, with the ratings each side gave." : "This performer has not visited yet."}>
        {history.length === 0 ? <Empty>Invite them: <Link href={requestHref} className="font-semibold text-brand-700 underline">request {m.name.split(" ")[0]} for an event</Link>.</Empty> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {history.map((b) => (
            <BookingCard key={b.id} b={b} perspective="FACILITY" rateHref={`/portal/facility/feedback/${b.id}`} />
          ))}
        </div>
      </Section>

      <Section title="What other communities say" description="Recent ratings from communities across the network. Comments are shared with the community's permission.">
        {reviews.length === 0 ? <Empty>No ratings yet.</Empty> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {reviews.map((r) => (
            <div key={r.id} className="surface rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <StarRow value={r.rating} />
                <span className="text-xs text-stone-500">{r.mine ? <Badge tone="gold">Your community</Badge> : `${r.facility.name}, ${r.facility.city}`} · {fmtDate(r.submittedAt)}</span>
              </div>
              {r.comments ? <p className="mt-2 text-sm text-ink/80">&ldquo;{r.comments}&rdquo;</p> : null}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
