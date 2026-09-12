import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { agingByStatus, pendingActions, pipelineCounts } from "@/lib/services/metrics";
import { Card, CardBody, CardHeader, Empty, PageHeader, Stat, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/utils";

export default async function DashboardPage(props: PageProps<"/admin">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [pending, pipeline, aging, upcoming, alerts, awaiting] = await Promise.all([
    pendingActions(),
    pipelineCounts(),
    agingByStatus(),
    prisma.match.findMany({ where: { status: "CONFIRMED", exceptionStatus: null, eventRequest: { startAt: { gte: new Date() } } }, include: { eventRequest: true, musician: true, facility: true }, orderBy: { eventRequest: { startAt: "asc" } }, take: 6 }),
    prisma.alert.findMany({ where: { resolvedAt: null }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 6 }),
    prisma.eventRequest.findMany({ where: { status: "AWAITING_APPROVAL", heldAt: null }, include: { facility: true, matchRuns: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { startAt: "asc" }, take: 6 }),
  ]);
  const statuses = ["SUBMITTED", "NEEDS_INFORMATION", "READY_TO_MATCH", "MATCHING", "AWAITING_APPROVAL", "CLOSED"];

  return (
    <div>
      <PageHeader title={`Good day, ${user.name.split(" ")[0]}`} description="What needs a human right now, and the state of the pipeline." />
      {sp.denied ? <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">That page is limited to administrators.</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/requests?status=AWAITING_APPROVAL"><Stat label="Awaiting approval" value={pending.awaitingApproval} hint="Ranked candidates ready for review" tone={pending.awaitingApproval ? "warning" : undefined} /></Link>
        <Link href="/admin/bookings?view=offers"><Stat label="Awaiting response" value={pending.awaitingResponse} hint="Offers out to musician / facility" /></Link>
        <Link href="/admin/requests?status=NEEDS_INFORMATION"><Stat label="Needs information" value={pending.needsInfo + pending.unmatchedFacility} hint={`${pending.unmatchedFacility} unlinked facility`} tone={pending.needsInfo + pending.unmatchedFacility ? "warning" : undefined} /></Link>
        <Link href="/admin/alerts"><Stat label="Exceptions" value={pending.openAlerts} hint={`${pending.followUps} feedback follow-ups`} tone={pending.openAlerts ? "danger" : "success"} /></Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pipeline" description="Requests by status with aging" />
          <Table>
            <THead><tr><TH>Status</TH><TH className="text-right">Count</TH><TH className="text-right">Avg age</TH><TH className="text-right">Oldest</TH></tr></THead>
            <tbody>
              {statuses.map((s) => (
                <TR key={s}>
                  <TD><Link href={`/admin/requests?status=${s}`}><StatusBadge status={s} /></Link></TD>
                  <TD className="text-right">{pipeline.byStatus[s] ?? 0}</TD>
                  <TD className="text-right">{aging[s] ? `${aging[s].avgDays.toFixed(1)} d` : "—"}</TD>
                  <TD className="text-right">{aging[s] ? `${aging[s].maxDays.toFixed(0)} d` : "—"}</TD>
                </TR>
              ))}
              <TR><TD className="text-stone-500">On hold</TD><TD className="text-right">{pipeline.held}</TD><TD /><TD /></TR>
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Awaiting your approval" description="Top recommendation shown; open to see the full reasoned list" actions={<Link href="/admin/requests?status=AWAITING_APPROVAL" className="text-sm text-brand-700 underline">All</Link>} />
          <CardBody className="p-0">
            {awaiting.length === 0 ? <div className="p-5"><Empty>Nothing waiting for approval.</Empty></div> : (
              <Table>
                <THead><tr><TH>Event</TH><TH>Facility</TH><TH>When</TH><TH className="text-right">Eligible</TH></tr></THead>
                <tbody>
                  {awaiting.map((r) => (
                    <TR key={r.id}>
                      <TD><Link href={`/admin/requests/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link></TD>
                      <TD>{r.facility?.name}</TD>
                      <TD>{fmtDateTime(r.startAt, r.timezone)}</TD>
                      <TD className="text-right">{r.matchRuns[0]?.eligibleCount ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Upcoming confirmed events" actions={<Link href="/admin/bookings" className="text-sm text-brand-700 underline">Calendar</Link>} />
          <CardBody className="p-0">
            {upcoming.length === 0 ? <div className="p-5"><Empty>No confirmed events coming up.</Empty></div> : (
              <Table>
                <THead><tr><TH>When</TH><TH>Facility</TH><TH>Musician</TH></tr></THead>
                <tbody>
                  {upcoming.map((m) => (
                    <TR key={m.id}>
                      <TD><Link href={`/admin/requests/${m.eventRequestId}`} className="text-brand-700 hover:underline">{fmtDateTime(m.eventRequest.startAt, m.eventRequest.timezone)}</Link></TD>
                      <TD>{m.facility.name}</TD>
                      <TD>{m.musician.stageName ?? `${m.musician.firstName} ${m.musician.lastName}`}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Open exceptions" actions={<Link href="/admin/alerts" className="text-sm text-brand-700 underline">Queue</Link>} />
          <CardBody className="p-0">
            {alerts.length === 0 ? <div className="p-5"><Empty>No open exceptions. 🎉</Empty></div> : (
              <ul className="divide-y divide-stone-100">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <StatusBadge status={a.severity} />
                    <div className="min-w-0">
                      <div className="font-medium text-stone-900">{a.title}</div>
                      <div className="truncate text-xs text-stone-500">{titleCase(a.type)} · {fmtDateTime(a.createdAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
