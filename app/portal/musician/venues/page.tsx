import { requireMusicianUser } from "@/lib/rbac";
import { musicianVenues } from "@/lib/services/portal";
import { StarRow } from "@/components/portal/Shell";
import { Badge, Empty } from "@/components/ui";
import { formatAddress } from "@/lib/geo";
import { fmtDateTime, titleCase } from "@/lib/utils";

export const metadata = { title: "Where you play" };
export const dynamic = "force-dynamic";

export default async function MusicianVenuesPage() {
  const u = await requireMusicianUser();
  const venues = await musicianVenues(u.musicianId);
  const withUpcoming = venues.filter((v) => v.upcoming.length);
  const pastOnly = venues.filter((v) => !v.upcoming.length);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Locations</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">Where you play</h1>
      <p className="mt-2 max-w-2xl text-ink/70">Every community on your schedule with its address, room and load-in notes. Communities you have played before are listed below for reference.</p>

      {venues.length === 0 ? <div className="mt-8"><Empty>No venues yet. Once you accept an offer the community appears here.</Empty></div> : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {withUpcoming.map((v) => (
          <VenueCard key={v.facility.id} v={v} />
        ))}
      </div>

      {pastOnly.length ? (
        <>
          <h2 className="font-display mt-12 text-2xl font-semibold text-ink">Played before</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {pastOnly.map((v) => (
              <VenueCard key={v.facility.id} v={v} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function VenueCard({ v }: { v: Awaited<ReturnType<typeof musicianVenues>>[number] }) {
  const f = v.facility;
  const address = formatAddress(f);
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-semibold text-ink">{f.name}</h3>
          <div className="text-xs text-ink/60">{titleCase(f.facilityType)}{f.typicalGroupSize ? ` · about ${f.typicalGroupSize} residents` : ""}</div>
        </div>
        {v.next ? <Badge tone="success">Next: {fmtDateTime(v.next.eventRequest.startAt, v.next.eventRequest.timezone)}</Badge> : <Badge>{v.completed} past {v.completed === 1 ? "visit" : "visits"}</Badge>}
      </div>
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-brand-700 underline decoration-gold-500 underline-offset-4">{address}</a>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wide text-stone-500">Room</dt><dd className="text-ink/85">{f.roomType ?? "—"}{f.hasPiano ? " · piano available" : ""}{f.hasPower ? "" : " · no power"}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-stone-500">Equipment</dt><dd className="text-ink/85">{f.equipment.length ? f.equipment.join(", ") : "Bring your own"}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-stone-500">Parking</dt><dd className="text-ink/85">{f.parkingNotes ?? "—"}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-stone-500">Load-in</dt><dd className="text-ink/85">{f.loadInNotes ?? "—"}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-stone-500">On-site contact</dt><dd className="text-ink/85">{f.primaryContactName}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-stone-500">Your last rating of this venue</dt><dd><StarRow value={v.myRating} /></dd></div>
      </dl>
      {v.upcoming.length > 1 ? (
        <ul className="mt-3 border-t border-gold-300/30 pt-2 text-sm text-ink/75">
          {v.upcoming.map((b) => (
            <li key={b.id}>♪ {fmtDateTime(b.eventRequest.startAt, b.eventRequest.timezone)} · {b.eventRequest.durationMinutes} min{b.status !== "CONFIRMED" ? " · awaiting confirmation" : ""}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
