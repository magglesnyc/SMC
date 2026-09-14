import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, CardBody, CardHeader, DL, PageHeader, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { facilityPreferenceAction, rotateCalendarLinkAction, updateFacilityAction } from "../../actions";
import { calendarUrlFor } from "@/lib/calendar";
import { fmtDateTime, fmtMoney, decimalToNumber, titleCase } from "@/lib/utils";

export default async function FacilityDetailPage(props: PageProps<"/admin/facilities/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const f = await prisma.facility.findUnique({
    where: { id },
    include: {
      eventRequests: { orderBy: { startAt: "desc" }, take: 25, include: { matches: { where: { selected: true }, include: { musician: true }, take: 1 } } },
      preferences: { include: { musician: true } },
      feedback: { where: { kind: "CLIENT", rating: { not: null } }, orderBy: { submittedAt: "desc" }, take: 8, include: { musician: true } },
    },
  });
  if (!f) notFound();
  const musicians = await prisma.musician.findMany({ where: { status: { in: ["ACTIVE", "APPROVED"] } }, select: { id: true, firstName: true, lastName: true, stageName: true }, orderBy: { lastName: "asc" } });
  const calendarUrl = await calendarUrlFor("FACILITY", f.id);

  return (
    <div>
      <PageHeader title={f.name} description={<span className="space-x-2"><StatusBadge status={f.status} /><span>{titleCase(f.facilityType)} · {f.city}, {f.state}</span></span>} actions={<Link href="/admin/facilities" className="text-sm text-stone-600 underline">← Facilities</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <DL items={[
                ["Address", `${f.addressLine1}, ${f.city}, ${f.state} ${f.postalCode}`],
                ["Coordinates", f.lat != null ? `${f.lat.toFixed(4)}, ${f.lng?.toFixed(4)}` : <span key="c" className="text-amber-700">not geocoded</span>],
                ["Primary contact", `${f.primaryContactName}${f.primaryContactRole ? ` (${f.primaryContactRole})` : ""} · ${f.primaryContactEmail}${f.primaryContactPhone ? ` · ${f.primaryContactPhone}` : ""}`],
                ["Secondary contact", f.secondaryContactName ? `${f.secondaryContactName} · ${f.secondaryContactEmail ?? ""}` : "—"],
                ["Audience", `${f.residentPopulation ?? "—"} · typical group ${f.typicalGroupSize ?? "—"} · ${f.audienceTags.join(", ") || "no tags"}`],
                ["Venue", `${f.roomType ?? "—"} · ${f.equipment.join(", ") || "no equipment listed"} · ${f.hasPiano ? "piano available" : "no piano"} · ${f.hasPower ? "power" : "no power"}`],
                ["Parking", f.parkingNotes ?? "—"],
                ["Load-in", f.loadInNotes ?? "—"],
                ["Preferred genres", f.preferredGenres.join(", ") || "—"],
                ["Budget range", `${fmtMoney(decimalToNumber(f.budgetMin))} – ${fmtMoney(decimalToNumber(f.budgetMax))}`],
                ["Timezone", f.timezone],
              ]} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Booking history" />
            <CardBody className="p-0">
              <Table>
                <THead><tr><TH>Event</TH><TH>When</TH><TH>Program</TH><TH>Status</TH><TH>Musician</TH></tr></THead>
                <tbody>
                  {f.eventRequests.map((r) => (
                    <TR key={r.id}>
                      <TD><Link href={`/admin/requests/${r.id}`} className="text-brand-700 hover:underline">{r.reference}</Link></TD>
                      <TD>{fmtDateTime(r.startAt, r.timezone)}</TD>
                      <TD>{titleCase(r.serviceType)}</TD>
                      <TD><StatusBadge status={r.status} /></TD>
                      <TD>{r.matches[0] ? <span>{r.matches[0].musician.stageName ?? `${r.matches[0].musician.firstName} ${r.matches[0].musician.lastName}`} <StatusBadge status={r.matches[0].exceptionStatus ?? r.matches[0].status} /></span> : "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Community calendar" description="Private link the activity director receives in confirmations and reminders: every performer scheduled here, by day / week / month / year, plus an iCal feed." />
            <CardBody className="space-y-2 text-sm">
              <a href={calendarUrl} target="_blank" rel="noreferrer" className="block break-all text-brand-700 underline">{calendarUrl}</a>
              <Link href={`/admin/calendar?facility=${f.id}`} className="block text-brand-700 underline">View in staff calendar</Link>
              <ActionForm action={rotateCalendarLinkAction} hidden={{ ownerType: "FACILITY", ownerId: f.id }} submitLabel="Rotate link" variant="outline" confirm="Issue a new calendar link? The old one stops working immediately." inline />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Preferred / blocked musicians" description="Preferred boosts rotation score; blocked excludes." />
            <CardBody className="space-y-3">
              <ul className="space-y-1 text-sm">{f.preferences.map((p) => <li key={p.id} className="flex items-center justify-between"><span><StatusBadge status={p.kind} /> <Link href={`/admin/musicians/${p.musicianId}`} className="hover:underline">{p.musician.stageName ?? `${p.musician.firstName} ${p.musician.lastName}`}</Link>{p.note ? <span className="text-xs text-stone-500"> — {p.note}</span> : null}</span><ActionForm action={facilityPreferenceAction} hidden={{ facilityId: f.id, musicianId: p.musicianId, kind: "NONE" }} submitLabel="Remove" variant="ghost" inline /></li>)}</ul>
              <ActionForm action={facilityPreferenceAction} hidden={{ facilityId: f.id }} submitLabel="Add" variant="outline">
                <select name="musicianId" className="h-8 w-full rounded-md border border-stone-300 text-sm">{musicians.map((m) => <option key={m.id} value={m.id}>{m.stageName ?? `${m.firstName} ${m.lastName}`}</option>)}</select>
                <div className="flex gap-2"><select name="kind" className="h-8 rounded-md border border-stone-300 text-sm"><option value="PREFERRED">Preferred</option><option value="BLOCKED">Blocked</option></select><input name="note" placeholder="Note" className="h-8 flex-1 rounded-md border border-stone-300 px-2 text-sm" /></div>
              </ActionForm>
            </CardBody>
          </Card>

          {f.feedback.length ? <Card><CardHeader title="Recent client feedback" /><CardBody><ul className="space-y-1 text-sm">{f.feedback.map((x) => <li key={x.id}><strong>{x.rating}★</strong> {x.musician.stageName ?? `${x.musician.firstName} ${x.musician.lastName}`}{x.comments ? <span className="text-stone-600"> — “{x.comments}”</span> : null}</li>)}</ul></CardBody></Card> : null}

          <Card>
            <CardHeader title="Edit" />
            <CardBody>
              <ActionForm action={updateFacilityAction} hidden={{ facilityId: f.id }} submitLabel="Save" variant="secondary">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="col-span-2">Name<input name="name" defaultValue={f.name} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label>Type<input name="facilityType" defaultValue={f.facilityType} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label>Status<select name="status" defaultValue={f.status} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2"><option value="ACTIVE">Active</option><option value="PENDING_REVIEW">Pending review</option><option value="INACTIVE">Inactive</option></select></label>
                  <label className="col-span-2">Contact name<input name="primaryContactName" defaultValue={f.primaryContactName} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label className="col-span-2">Contact email<input name="primaryContactEmail" defaultValue={f.primaryContactEmail} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label>Lat<input name="lat" type="number" step="any" defaultValue={f.lat ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label>Lng<input name="lng" type="number" step="any" defaultValue={f.lng ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label className="col-span-2">Audience tags<input name="audienceTags" defaultValue={f.audienceTags.join(", ")} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label className="col-span-2">Preferred genres<input name="preferredGenres" defaultValue={f.preferredGenres.join(", ")} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label>Budget min<input name="budgetMin" type="number" defaultValue={decimalToNumber(f.budgetMin) ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label>Budget max<input name="budgetMax" type="number" defaultValue={decimalToNumber(f.budgetMax) ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                  <label className="col-span-2">Load-in notes<textarea name="loadInNotes" rows={2} defaultValue={f.loadInNotes ?? ""} className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1" /></label>
                  <label className="col-span-2">Parking notes<textarea name="parkingNotes" rows={2} defaultValue={f.parkingNotes ?? ""} className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1" /></label>
                  {user.role === "ADMIN" ? <label className="col-span-2">Private notes (admin)<textarea name="privateNotes" rows={3} defaultValue={f.privateNotes ?? ""} className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1" /></label> : null}
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
