import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, CardBody, CardHeader, DL, PageHeader, StatusBadge, Badge, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { musicianCoordsAction, musicianNotesAction, musicianRestrictionAction, musicianStatusAction } from "../../actions";
import { fmtDate, fmtDateTime, fmtMoney, decimalToNumber, titleCase } from "@/lib/utils";
import { WEEKDAYS } from "@/lib/validation/constants";
import type { MusicianStatus } from "@/generated/prisma/enums";
import type { WeeklyWindow, Blackout } from "@/lib/matching";

const NEXT: Record<MusicianStatus, { status: MusicianStatus; label: string; admin?: boolean }[]> = {
  SUBMITTED: [{ status: "REVIEW", label: "Start review" }, { status: "INACTIVE", label: "Reject / archive" }],
  REVIEW: [{ status: "APPROVED", label: "Approve", admin: true }, { status: "INACTIVE", label: "Reject / archive" }],
  APPROVED: [{ status: "ACTIVE", label: "Activate" }, { status: "REVIEW", label: "Back to review" }],
  ACTIVE: [{ status: "INACTIVE", label: "Deactivate" }, { status: "SUSPENDED", label: "Suspend", admin: true }],
  INACTIVE: [{ status: "ACTIVE", label: "Reactivate" }, { status: "REVIEW", label: "Re-review" }],
  SUSPENDED: [{ status: "ACTIVE", label: "Lift suspension", admin: true }, { status: "INACTIVE", label: "Deactivate" }],
};

export default async function MusicianDetailPage(props: PageProps<"/admin/musicians/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const m = await prisma.musician.findUnique({
    where: { id },
    include: {
      matches: { where: { selected: true }, include: { eventRequest: true, facility: true }, orderBy: { eventRequest: { startAt: "desc" } }, take: 20 },
      feedback: { where: { kind: "CLIENT", rating: { not: null } }, orderBy: { submittedAt: "desc" }, take: 10, include: { facility: true } },
      alerts: { where: { resolvedAt: null } },
      preferences: { include: { facility: true } },
    },
  });
  if (!m) notFound();
  const dup = m.duplicateOfId ? await prisma.musician.findUnique({ where: { id: m.duplicateOfId }, select: { id: true, firstName: true, lastName: true, email: true } }) : null;
  const windows = (m.weeklyAvailability as unknown as WeeklyWindow[]) ?? [];
  const blackouts = (m.blackouts as unknown as Blackout[]) ?? [];

  return (
    <div>
      <PageHeader title={m.stageName ?? `${m.firstName} ${m.lastName}`} description={<span className="space-x-2"><StatusBadge status={m.status} />{m.stageName ? <span>{m.firstName} {m.lastName}</span> : null}{m.adminRestriction ? <Badge tone="danger">Restricted: {m.adminRestriction}</Badge> : null}{m.possibleDuplicate ? <Badge tone="warning">Possible duplicate</Badge> : null}</span>} actions={<Link href="/admin/musicians" className="text-sm text-stone-600 underline">← Musicians</Link>} />

      {m.alerts.length ? <div className="mb-4 space-y-2">{m.alerts.map((a) => <div key={a.id} className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"><strong>{a.title}</strong> — {a.message}</div>)}</div> : null}
      {dup ? <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">Possible duplicate of <Link href={`/admin/musicians/${dup.id}`} className="underline">{dup.firstName} {dup.lastName} ({dup.email})</Link>. Review before approving.</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Qualification review" description="Services, credentials, geography, rate — then approve and activate." />
            <CardBody>
              <DL items={[
                ["Entertainment types", m.entertainmentTypes.map(titleCase).join(", ")],
                ["Genres", m.genres.join(", ") || "—"],
                ["Instruments", m.instruments.join(", ") || "—"],
                ["Interactive sessions", m.offersInteractive ? "Yes" : "No"],
                ["Therapeutic / specialty", m.therapeuticQualifications.join(", ") || "—"],
                ["Audience experience", m.audienceExperience.join(", ") || "—"],
                ["Venue types", m.facilityTypeExperience.join(", ") || "—"],
                ["Certifications", m.certifications.join(", ") || "—"],
                ["Insurance", m.insuranceCarrier ? `${m.insuranceCarrier} · ${m.insurancePolicyNumber} · expires ${fmtDate(m.insuranceExpiresAt)}` : <span key="i" className="text-amber-700">none on file</span>],
                ["Background check", <span key="b"><StatusBadge status={m.backgroundCheckStatus} /> {m.backgroundCheckDate ? fmtDate(m.backgroundCheckDate) : ""}</span>],
                ["Rate", `${fmtMoney(decimalToNumber(m.standardRate))} ${m.rateStructure === "PER_HOUR" ? "per hour" : "per event"} · min ${m.minBookingMinutes} min`],
                ["Travel", `${m.maxTravelMiles} mi radius${m.travelFeeApplies ? " · travel fee applies" : ""}`],
                ["Home base", `${m.addressLine1}, ${m.city}, ${m.state} ${m.postalCode}`],
                ["Coordinates", m.lat != null ? `${m.lat.toFixed(4)}, ${m.lng?.toFixed(4)}` : <span key="c" className="text-amber-700">not geocoded — required for matching</span>],
                ["Contact", `${m.email} · ${m.phone}`],
                ["Applied", fmtDateTime(m.createdAt)],
                ["Approved", m.approvedAt ? fmtDateTime(m.approvedAt) : "—"],
              ]} />
              <div className="mt-4 flex flex-wrap gap-2">
                {NEXT[m.status].filter((n) => !n.admin || user.role === "ADMIN").map((n) => (
                  <ActionForm key={n.status} action={musicianStatusAction} hidden={{ musicianId: m.id, status: n.status }} submitLabel={n.label} variant={n.status === "INACTIVE" || n.status === "SUSPENDED" ? "outline" : "primary"} inline>
                    <input name="note" placeholder="Note (optional)" className="h-8 rounded-md border border-stone-300 px-2 text-sm" />
                  </ActionForm>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Availability" />
            <CardBody>
              <div className="flex flex-wrap gap-2 text-sm">
                {windows.length ? windows.map((w, i) => <Badge key={i} tone="info">{WEEKDAYS[w.day]} {w.start}–{w.end}</Badge>) : <span className="text-amber-700">No weekly availability — will fail the availability filter.</span>}
              </div>
              {blackouts.length ? <ul className="mt-3 text-sm text-stone-700">{blackouts.map((b, i) => <li key={i}>Blackout: {fmtDate(b.start)} → {fmtDate(b.end)}{b.reason ? ` (${b.reason})` : ""}</li>)}</ul> : null}
              <p className="mt-2 text-xs text-stone-500">Timezone {m.timezone}. Blackouts are edited with the musician by email in v1.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Booking history" />
            <CardBody className="p-0">
              <Table>
                <THead><tr><TH>Event</TH><TH>Facility</TH><TH>When</TH><TH>Status</TH><TH className="text-right">Score / rank</TH></tr></THead>
                <tbody>
                  {m.matches.map((x) => (
                    <TR key={x.id}>
                      <TD><Link href={`/admin/requests/${x.eventRequestId}`} className="text-brand-700 hover:underline">{x.eventRequest.reference}</Link></TD>
                      <TD>{x.facility.name}</TD>
                      <TD>{fmtDateTime(x.eventRequest.startAt, x.eventRequest.timezone)}</TD>
                      <TD><StatusBadge status={x.exceptionStatus ?? x.status} />{x.exceptionReason ? <div className="text-xs text-stone-500">{x.exceptionReason}</div> : null}</TD>
                      <TD className="text-right">{x.score?.toFixed(1)} / #{x.rank}{x.isOverride ? " (override)" : ""}</TD>
                    </TR>
                  ))}
                  {m.matches.length === 0 ? <TR><TD className="text-stone-500">No bookings yet.</TD></TR> : null}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Performance" />
            <CardBody>
              <DL items={[
                ["Completed", m.completedEvents],
                ["Cancellations", m.cancellations],
                ["No-shows", m.noShows],
                ["Avg rating", m.avgRating ? `${m.avgRating.toFixed(2)} (${m.ratingCount})` : "unrated"],
                ["Avg response", m.avgResponseHours != null ? `${m.avgResponseHours.toFixed(1)} h (${m.responseCount})` : "—"],
              ]} />
              {m.feedback.length ? <ul className="mt-3 space-y-1 text-sm">{m.feedback.map((f) => <li key={f.id}><strong>{f.rating}★</strong> {f.facility.name}{f.comments ? <span className="text-stone-600"> — “{f.comments}”</span> : null}</li>)}</ul> : null}
            </CardBody>
          </Card>

          {m.preferences.length ? (
            <Card>
              <CardHeader title="Facility preferences" />
              <CardBody><ul className="space-y-1 text-sm">{m.preferences.map((p) => <li key={p.id}><StatusBadge status={p.kind} /> <Link href={`/admin/facilities/${p.facilityId}`} className="hover:underline">{p.facility.name}</Link>{p.note ? <span className="text-xs text-stone-500"> — {p.note}</span> : null}</li>)}</ul></CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Coordinates" description="Set manually if geocoding is unavailable." />
            <CardBody>
              <ActionForm action={musicianCoordsAction} hidden={{ musicianId: m.id }} submitLabel="Save" variant="outline" inline>
                <input name="lat" type="number" step="any" defaultValue={m.lat ?? ""} placeholder="lat" className="h-8 w-28 rounded-md border border-stone-300 px-2 text-sm" />
                <input name="lng" type="number" step="any" defaultValue={m.lng ?? ""} placeholder="lng" className="h-8 w-28 rounded-md border border-stone-300 px-2 text-sm" />
              </ActionForm>
            </CardBody>
          </Card>

          {user.role === "ADMIN" ? (
            <>
              <Card>
                <CardHeader title="Administrative restriction" description="Excludes the musician from matching while active." />
                <CardBody>
                  <ActionForm action={musicianRestrictionAction} hidden={{ musicianId: m.id }} submitLabel="Save restriction" variant="outline">
                    <input name="restriction" defaultValue={m.adminRestriction ?? ""} placeholder="Leave blank to clear" className="h-8 w-full rounded-md border border-stone-300 px-2 text-sm" />
                    <label className="block text-xs text-stone-500">Until (optional)<input name="until" type="date" className="ml-2 h-8 rounded-md border border-stone-300 px-2 text-sm" /></label>
                  </ActionForm>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Private notes" description="Administrators only." />
                <CardBody>
                  <ActionForm action={musicianNotesAction} hidden={{ musicianId: m.id }} submitLabel="Save notes" variant="outline">
                    <textarea name="privateNotes" rows={5} defaultValue={m.privateNotes ?? ""} className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm" />
                  </ActionForm>
                </CardBody>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
