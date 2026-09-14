import Link from "next/link";
import { requireFacilityUser } from "@/lib/rbac";
import { facilityBrowseMusicians } from "@/lib/services/portal";
import { StarRow } from "@/components/portal/Shell";
import { Badge, Empty, Select } from "@/components/ui";
import { GENRES } from "@/lib/validation/constants";
import { SERVICE_TYPE_LABELS, SERVICE_TYPES } from "@/lib/matching/types";
import { fmtMoney } from "@/lib/utils";

export const metadata = { title: "Find performers" };
export const dynamic = "force-dynamic";

export default async function FacilityPerformersPage(props: PageProps<"/portal/facility/performers">) {
  const u = await requireFacilityUser();
  const sp = await props.searchParams;
  const filters = { q: typeof sp.q === "string" ? sp.q : undefined, genre: typeof sp.genre === "string" ? sp.genre : undefined, service: typeof sp.service === "string" ? sp.service : undefined, interactive: sp.interactive === "1" };
  const { facility, rows } = await facilityBrowseMusicians(u.facilityId, filters);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Roster</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">Performers you could book</h1>
      <p className="mt-2 max-w-2xl text-ink/70">Vetted musicians whose travel radius reaches your community. Familiar faces and your preferred performers come first. To book one, open their profile and request them.</p>

      <form className="surface mt-6 grid gap-3 rounded-2xl p-4 sm:grid-cols-5">
        <input name="q" defaultValue={filters.q ?? ""} placeholder="Search name, instrument, genre" className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm sm:col-span-2" />
        <Select name="genre" defaultValue={filters.genre ?? ""}>
          <option value="">Any genre{facility.preferredGenres.length ? ` (you prefer ${facility.preferredGenres.slice(0, 2).join(", ")})` : ""}</option>
          {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Select name="service" defaultValue={filters.service ?? ""}>
          <option value="">Any program type</option>
          {SERVICE_TYPES.map((s) => <option key={s} value={s}>{SERVICE_TYPE_LABELS[s]}</option>)}
        </Select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" name="interactive" value="1" defaultChecked={filters.interactive} className="h-4 w-4 rounded border-stone-300" />Sing-along</label>
          <button className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-semibold text-ivory hover:bg-brand-800">Filter</button>
        </div>
      </form>

      {rows.length === 0 ? <Empty>No performers match those filters. Try clearing one, or <Link href={`/request?facility=${facility.id}`} className="font-semibold text-brand-700 underline">send a request</Link> and our team will look wider.</Empty> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => (
          <Link key={m.id} href={`/portal/facility/performers/${m.id}`} className="surface group flex flex-col rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-gold-500">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display text-xl font-semibold text-ink group-hover:text-brand-700">{m.name}</div>
                <div className="text-xs text-ink/60">{m.city}, {m.state}{m.distance != null ? ` · about ${m.distance} mi away` : ""}</div>
              </div>
              {m.preference === "PREFERRED" ? <Badge tone="gold">★ Preferred</Badge> : m.timesBooked ? <Badge tone="brand">Booked {m.timesBooked}×</Badge> : null}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <StarRow value={m.avgRating} />
              <span className="text-xs text-stone-500">{m.ratingCount ? `${m.avgRating?.toFixed(1)} · ${m.ratingCount} ratings` : "New to the roster"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {m.genres.slice(0, 4).map((g) => <Badge key={g}>{g}</Badge>)}
              {m.offersInteractive ? <Badge tone="success">Sing-along</Badge> : null}
              {m.therapeuticQualifications.length ? <Badge tone="info">Music therapy</Badge> : null}
            </div>
            <div className="mt-3 text-sm text-ink/70">{m.instruments.slice(0, 3).join(", ")}</div>
            <div className="mt-auto flex items-center justify-between pt-4 text-sm">
              <span className="font-semibold text-ink">{fmtMoney(m.standardRate)} {m.rateStructure === "PER_HOUR" ? "/ hour" : "/ event"}{m.travelFeeApplies ? " + travel" : ""}</span>
              {m.backgroundCheckStatus === "CLEARED" ? <span className="text-xs text-emerald-700">✓ Background checked</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
