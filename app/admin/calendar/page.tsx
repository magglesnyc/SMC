import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { anchorDate, loadCalendarEvents, type View } from "@/lib/calendar";
import { CalendarView, rangeFor } from "@/components/calendar/CalendarView";
import { PageHeader } from "@/components/ui";
import { DEFAULT_TZ } from "@/lib/utils";
import { US_TIMEZONES } from "@/lib/validation/constants";

export const metadata = { title: "Calendar" };
const VIEWS: View[] = ["day", "week", "month", "year", "list"];

export default async function AdminCalendarPage(props: PageProps<"/admin/calendar">) {
  await requireUser();
  const sp = await props.searchParams;
  const musicianId = typeof sp.musician === "string" && sp.musician ? sp.musician : undefined;
  const facilityId = typeof sp.facility === "string" && sp.facility ? sp.facility : undefined;
  const tz = typeof sp.tz === "string" && US_TIMEZONES.some(([id]) => id === sp.tz) ? sp.tz : DEFAULT_TZ;
  const view = VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const anchor = anchorDate(typeof sp.date === "string" ? sp.date : undefined, tz);
  const { start, end } = rangeFor(view, anchor);

  const [events, musicians, facilities] = await Promise.all([
    loadCalendarEvents({ musicianId, facilityId, from: fromZonedTime(start, tz), to: fromZonedTime(end, tz) }),
    prisma.musician.findMany({ where: { status: { in: ["ACTIVE", "APPROVED"] } }, select: { id: true, firstName: true, lastName: true, stageName: true }, orderBy: { lastName: "asc" } }),
    prisma.facility.findMany({ select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
  ]);
  const extra = { musician: musicianId, facility: facilityId, tz: tz === DEFAULT_TZ ? undefined : tz };

  return (
    <div>
      <PageHeader title="Calendar" description="Every offered, confirmed and completed booking. Filter to one musician or one community to see exactly what their personal calendar shows." />
      <form className="mb-4 flex flex-wrap items-end gap-3 text-sm" method="get">
        <input type="hidden" name="view" value={view} />
        <label>Musician<br /><select name="musician" defaultValue={musicianId ?? ""} className="h-9 rounded-md border border-stone-300 bg-white px-2"><option value="">All musicians</option>{musicians.map((m) => <option key={m.id} value={m.id}>{m.stageName ?? `${m.firstName} ${m.lastName}`}</option>)}</select></label>
        <label>Community<br /><select name="facility" defaultValue={facilityId ?? ""} className="h-9 rounded-md border border-stone-300 bg-white px-2"><option value="">All communities</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}</select></label>
        <label>Show times in<br /><select name="tz" defaultValue={tz} className="h-9 rounded-md border border-stone-300 bg-white px-2">{US_TIMEZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <button className="h-9 rounded-full bg-brand-700 px-4 font-semibold text-ivory">Apply</button>
        {musicianId || facilityId ? <a href={`/admin/calendar?view=${view}`} className="text-brand-700 underline">Clear</a> : null}
      </form>
      <CalendarView events={events} tz={tz} view={view} anchor={anchor} basePath="/admin/calendar" extraQuery={extra} audience="STAFF" eventHref={(e) => `/admin/requests/${e.eventRequestId}`} />
      <p className="mt-3 text-xs text-stone-500">{events.length} event{events.length === 1 ? "" : "s"} in view. Musicians and communities receive their own private calendar link and iCal feed in confirmation emails; you can copy or rotate it from their profile page.</p>
    </div>
  );
}

