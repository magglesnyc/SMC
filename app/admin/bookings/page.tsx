import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, CardHeader, Empty, LinkButton, PageHeader, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { runJobsAction } from "../actions";
import { fmtDate, fmtTime, hoursBetween } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export default async function BookingsPage(props: PageProps<"/admin/bookings">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "offers" ? "offers" : sp.view === "past" ? "past" : "upcoming";
  const now = new Date();
  const where: Prisma.MatchWhereInput =
    view === "offers"
      ? { status: { in: ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED"] }, selected: true }
      : view === "past"
        ? { selected: true, eventRequest: { startAt: { lt: now } }, status: { in: ["CONFIRMED", "COMPLETED"] } }
        : { status: "CONFIRMED", exceptionStatus: null, eventRequest: { startAt: { gte: now } } };
  const bookings = await prisma.match.findMany({
    where,
    include: { eventRequest: true, musician: true, facility: true, notifications: { where: { templateKey: { startsWith: "reminder" } } } },
    orderBy: { eventRequest: { startAt: view === "past" ? "desc" : "asc" } },
    take: 200,
  });
  // Group upcoming by local date for a calendar-style list.
  const groups = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const key = fmtDate(b.eventRequest.startAt, b.eventRequest.timezone);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return (
    <div>
      <PageHeader title="Events" description={view === "offers" ? "Offers awaiting responses" : view === "past" ? "Past events" : "Upcoming confirmed events"} actions={<>{user.role === "ADMIN" ? <LinkButton href="/api/admin/export/bookings">Export CSV</LinkButton> : null}<ActionForm action={runJobsAction} submitLabel="Run reminders & feedback jobs now" variant="outline" inline /></>} />
      <div className="mb-4 flex gap-2 text-sm">
        {[["upcoming", "Upcoming"], ["offers", "Awaiting response"], ["past", "Past"]].map(([v, l]) => (
          <Link key={v} href={`/admin/bookings?view=${v}`} className={`rounded-full px-3 py-1 ${view === v ? "bg-stone-800 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}>{l}</Link>
        ))}
      </div>
      {bookings.length === 0 ? <Empty>Nothing here.</Empty> : null}
      <div className="space-y-4">
        {[...groups.entries()].map(([day, items]) => (
          <Card key={day}>
            <CardHeader title={day} />
            <Table>
              <THead><tr><TH>Time</TH><TH>Event</TH><TH>Facility</TH><TH>Musician</TH><TH>Status</TH><TH>{view === "offers" ? "Waiting" : "Reminders"}</TH></tr></THead>
              <tbody>
                {items.map((b) => (
                  <TR key={b.id}>
                    <TD>{fmtTime(b.eventRequest.startAt, b.eventRequest.timezone)}<div className="text-xs text-stone-500">{b.eventRequest.durationMinutes} min</div></TD>
                    <TD><Link href={`/admin/requests/${b.eventRequestId}`} className="text-brand-700 hover:underline">{b.eventRequest.reference}</Link></TD>
                    <TD>{b.facility.name}<div className="text-xs text-stone-500">{b.facility.city}</div></TD>
                    <TD>{b.musician.stageName ?? `${b.musician.firstName} ${b.musician.lastName}`}<div className="text-xs text-stone-500">{b.travelMinutes} min travel</div></TD>
                    <TD><StatusBadge status={b.exceptionStatus ?? b.status} /></TD>
                    <TD className="text-xs text-stone-600">
                      {view === "offers" ? (
                        <span>{b.offeredAt ? `${hoursBetween(b.offeredAt, now).toFixed(0)} h` : "—"} · M: <StatusBadge status={b.musicianResponse ?? "PENDING"} /> F: <StatusBadge status={b.facilityResponse ?? "PENDING"} /></span>
                      ) : b.notifications.length ? `${b.notifications.length} sent` : "none yet"}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
      </div>
    </div>
  );
}
