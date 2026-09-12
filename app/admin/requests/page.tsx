import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, Empty, PageHeader, StatusBadge, Table, TD, TH, THead, TR, LinkButton } from "@/components/ui";
import { fmtDateTime, daysAgo, titleCase } from "@/lib/utils";
import type { EventRequestStatus } from "@/generated/prisma/enums";

const STATUSES: EventRequestStatus[] = ["SUBMITTED", "NEEDS_INFORMATION", "READY_TO_MATCH", "MATCHING", "AWAITING_APPROVAL", "CLOSED"];

export default async function RequestsPage(props: PageProps<"/admin/requests">) {
  await requireUser();
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status as EventRequestStatus) ? (sp.status as EventRequestStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const requests = await prisma.eventRequest.findMany({
    where: {
      ...(status ? { status } : { status: { not: "CLOSED" } }),
      ...(q ? { OR: [{ reference: { contains: q, mode: "insensitive" } }, { facility: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { facility: true, matches: { where: { selected: true }, orderBy: { updatedAt: "desc" }, take: 1, include: { musician: true } }, matchRuns: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ startAt: "asc" }],
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Pipeline" description={status ? `Requests in ${titleCase(status)}` : "All open requests"} actions={<LinkButton href="/api/admin/export/requests" variant="outline">Export CSV</LinkButton>} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin/requests" className={`rounded-full px-3 py-1 ${!status ? "bg-stone-800 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}>Open</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/requests?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-stone-800 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}>{titleCase(s)}</Link>
        ))}
        <form className="ml-auto"><input name="q" defaultValue={q} placeholder="Search reference or facility" className="h-8 rounded-md border border-stone-300 px-2 text-sm" /></form>
      </div>
      <Card>
        {requests.length === 0 ? <div className="p-5"><Empty>No requests match.</Empty></div> : (
          <Table>
            <THead><tr><TH>Reference</TH><TH>Facility</TH><TH>When</TH><TH>Program</TH><TH>Status</TH><TH>Selected musician</TH><TH className="text-right">Age</TH></tr></THead>
            <tbody>
              {requests.map((r) => {
                const intake = (r.intakeFacility ?? {}) as { facilityName?: string };
                const sel = r.matches[0];
                return (
                  <TR key={r.id}>
                    <TD><Link href={`/admin/requests/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link></TD>
                    <TD>{r.facility?.name ?? <span className="text-amber-700">{intake.facilityName ?? "—"} (unlinked)</span>}</TD>
                    <TD>{fmtDateTime(r.startAt, r.timezone)}</TD>
                    <TD>{titleCase(r.serviceType)}</TD>
                    <TD className="space-x-1"><StatusBadge status={r.status} />{r.heldAt ? <StatusBadge status="ON_HOLD" /> : null}{r.missingFields.length ? <span className="text-xs text-amber-700">missing: {r.missingFields.join(", ")}</span> : null}</TD>
                    <TD>{sel ? <span>{sel.musician.stageName ?? `${sel.musician.firstName} ${sel.musician.lastName}`} <StatusBadge status={sel.exceptionStatus ?? sel.status} /></span> : r.matchRuns[0] ? <span className="text-stone-500">{r.matchRuns[0].eligibleCount} eligible</span> : "—"}</TD>
                    <TD className="text-right text-stone-500">{daysAgo(r.submittedAt)} d</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
