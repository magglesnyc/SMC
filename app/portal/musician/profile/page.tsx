import { prisma } from "@/lib/db";
import { requireMusicianUser } from "@/lib/rbac";
import { Badge, DL } from "@/components/ui";
import { fmtDate, fmtMoney, decimalToNumber, titleCase } from "@/lib/utils";
import type { Blackout, WeeklyWindow } from "@/lib/matching/types";

export const metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function MusicianProfilePage() {
  const u = await requireMusicianUser();
  const m = await prisma.musician.findUniqueOrThrow({ where: { id: u.musicianId } });
  const windows = (m.weeklyAvailability as unknown as WeeklyWindow[]) ?? [];
  const blackouts = ((m.blackouts as unknown as Blackout[]) ?? []).filter((b) => new Date(b.end) >= new Date());

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">What communities see</p>
      <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">Your profile</h1>
      <p className="mt-2 max-w-2xl text-ink/70">This is how you appear when a community browses the roster. To change anything, including availability, rates or travel radius, reply to any email from us and our team will update it the same day.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="surface rounded-2xl p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="success">{titleCase(m.status)}</Badge>
            {m.backgroundCheckStatus === "CLEARED" ? <Badge tone="info">Background check cleared</Badge> : <Badge tone="warning">Background check {titleCase(m.backgroundCheckStatus)}</Badge>}
            {m.insuranceExpiresAt ? <Badge tone={m.insuranceExpiresAt > new Date() ? "info" : "danger"}>Insurance {m.insuranceExpiresAt > new Date() ? `through ${fmtDate(m.insuranceExpiresAt)}` : "expired"}</Badge> : null}
          </div>
          <DL
            items={[
              ["Name", m.stageName ? `${m.stageName} (${m.firstName} ${m.lastName})` : `${m.firstName} ${m.lastName}`],
              ["Based in", `${m.city}, ${m.state}`],
              ["Programs", m.entertainmentTypes.map((t) => titleCase(t)).join(", ")],
              ["Genres", m.genres.join(", ")],
              ["Instruments", m.instruments.join(", ")],
              ["Sing-along / participatory", m.offersInteractive ? "Yes" : "No"],
              ["Audience experience", m.audienceExperience.map((t) => titleCase(t)).join(", ") || "—"],
              ["Therapeutic qualifications", m.therapeuticQualifications.map((t) => titleCase(t)).join(", ") || "None"],
              ["Certifications", m.certifications.map((t) => titleCase(t)).join(", ") || "—"],
              ["Rate", `${fmtMoney(decimalToNumber(m.standardRate))} ${m.rateStructure === "PER_HOUR" ? "per hour" : "per event"}${m.travelFeeApplies ? " + travel fee" : ""}`],
              ["Minimum booking", `${m.minBookingMinutes} minutes`],
              ["Travel radius", `${m.maxTravelMiles} miles`],
              ["Contact on file", `${m.email} · ${m.phone}`],
              ["Track record", `${m.completedEvents} performances · ${m.ratingCount} ratings${m.avgRating ? ` · ${m.avgRating.toFixed(1)} average` : ""}`],
            ]}
          />
        </div>
        <div className="space-y-6">
          <div className="surface rounded-2xl p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Weekly availability</h2>
            <p className="text-xs text-stone-500">In your time zone ({m.timezone.replace(/_/g, " ")}).</p>
            {windows.length === 0 ? <p className="mt-2 text-sm text-stone-500">No regular windows on file; we ask you for every request.</p> : null}
            <ul className="mt-2 space-y-1 text-sm text-ink/80">
              {windows.map((w, i) => (
                <li key={i} className="flex justify-between"><span>{DOW[w.day]}</span><span>{w.start} – {w.end}</span></li>
              ))}
            </ul>
          </div>
          <div className="surface rounded-2xl p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Time off</h2>
            {blackouts.length === 0 ? <p className="mt-2 text-sm text-stone-500">No upcoming blackout dates.</p> : null}
            <ul className="mt-2 space-y-1 text-sm text-ink/80">
              {blackouts.map((b, i) => (
                <li key={i}>{fmtDate(b.start, m.timezone)} – {fmtDate(b.end, m.timezone)}{b.reason ? ` · ${b.reason}` : ""}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
