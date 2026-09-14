import Link from "next/link";
import { Badge } from "@/components/ui";
import { fmtDateTime, fmtTime } from "@/lib/utils";
import { formatAddress } from "@/lib/geo";
import { bookingEnd, bookingState, feedbackFor, musicianName, serviceLabel, type PortalBooking } from "@/lib/services/portal";
import { StarRow } from "./Shell";

/**
 * One booking as seen from either side. `perspective` decides which party is named and which
 * feedback row is "mine". `respond` renders an inline response form for open offers.
 */
export function BookingCard({ b, perspective, respond, rateHref, profileHref }: { b: PortalBooking; perspective: "FACILITY" | "MUSICIAN"; respond?: React.ReactNode; rateHref?: string; profileHref?: string }) {
  const r = b.eventRequest;
  const state = bookingState(b);
  const other = perspective === "FACILITY" ? musicianName(b.musician) : b.facility.name;
  const address = formatAddress({ addressLine1: r.locationAddressLine1 ?? b.facility.addressLine1, city: r.locationCity ?? b.facility.city, state: r.locationState ?? b.facility.state, postalCode: r.locationPostalCode ?? b.facility.postalCode });
  const mine = feedbackFor(b, perspective === "FACILITY" ? "CLIENT" : "MUSICIAN");
  const theirs = feedbackFor(b, perspective === "FACILITY" ? "MUSICIAN" : "CLIENT");
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">{fmtDateTime(r.startAt, r.timezone)} – {fmtTime(bookingEnd(b), r.timezone)}</div>
          <h3 className="font-display mt-1 text-xl font-semibold text-ink">
            {profileHref ? <Link href={profileHref} className="hover:text-brand-700">{other}</Link> : other}
          </h3>
          <div className="mt-1 text-sm text-ink/75">
            {serviceLabel(r.serviceType)} · {r.durationMinutes} min{r.expectedAttendance ? ` · about ${r.expectedAttendance} residents` : ""}
          </div>
          <div className="mt-1 text-sm text-ink/60">{address}</div>
          {r.programTags.length ? <div className="mt-2 flex flex-wrap gap-1">{r.programTags.map((t) => <Badge key={t} tone="gold">{t.replace(/-/g, " ")}</Badge>)}</div> : null}
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <Badge tone={state.tone}>{state.label}</Badge>
          <span className="text-xs text-stone-500">Ref {r.reference}</span>
        </div>
      </div>
      {perspective === "MUSICIAN" && (b.facility.parkingNotes || b.facility.loadInNotes) ? (
        <div className="mt-3 rounded-xl bg-gold-100/50 px-3 py-2 text-sm text-ink/80">
          {b.facility.parkingNotes ? <div><span className="font-semibold">Parking:</span> {b.facility.parkingNotes}</div> : null}
          {b.facility.loadInNotes ? <div><span className="font-semibold">Load-in:</span> {b.facility.loadInNotes}</div> : null}
        </div>
      ) : null}
      {respond ? <div className="mt-4 border-t border-gold-300/30 pt-4">{respond}</div> : null}
      {(mine || theirs || rateHref) && !respond ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gold-300/30 pt-3 text-sm">
          <div className="flex flex-wrap gap-4">
            <span>
              <span className="text-xs uppercase tracking-wide text-stone-500">Your rating</span> <StarRow value={mine?.rating} />
            </span>
            {theirs?.rating ? (
              <span>
                <span className="text-xs uppercase tracking-wide text-stone-500">{perspective === "FACILITY" ? "Their rating of you" : "Their rating"}</span> <StarRow value={theirs.rating} />
              </span>
            ) : null}
          </div>
          {rateHref && !mine?.submittedAt ? <Link href={rateHref} className="rounded-full bg-brand-700 px-4 py-1.5 text-xs font-semibold text-ivory hover:bg-brand-800">Rate {perspective === "FACILITY" ? "this performance" : "this venue"} →</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
