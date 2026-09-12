import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, Empty, LinkButton, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const refMatches = q ? await prisma.eventRequest.findMany({ where: { reference: { contains: q, mode: "insensitive" } }, select: { id: true } }) : [];
  const rawRows = await prisma.auditLog.findMany({
    where: q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { actorLabel: { contains: q, mode: "insensitive" } }, { entityId: { contains: q } }, { eventRequestId: { in: refMatches.map((r) => r.id) } }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  // Audit rows carry no foreign keys (they outlive their entities), so look up references separately.
  const refs = await prisma.eventRequest.findMany({ where: { id: { in: Array.from(new Set(rawRows.map((r) => r.eventRequestId).filter((x): x is string => !!x))) } }, select: { id: true, reference: true } });
  const refById = new Map(refs.map((r) => [r.id, r.reference]));
  const rows = rawRows.map((r) => ({ ...r, eventRequest: r.eventRequestId ? { reference: refById.get(r.eventRequestId) ?? "(deleted)" } : null }));
  return (
    <div>
      <PageHeader title="Audit log" description="Append-only. Every match run, score, override, status change, response, email and error, with actor and before/after values." actions={user.role === "ADMIN" ? <LinkButton href="/api/admin/export/audit">Export CSV</LinkButton> : null} />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Filter by action, actor, entity id or event reference" className="h-8 w-96 max-w-full rounded-md border border-stone-300 px-2 text-sm" /></form>
      <Card>
        {rows.length === 0 ? <div className="p-5"><Empty>No entries.</Empty></div> : (
          <Table>
            <THead><tr><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>Event</TH><TH>Before → after</TH></tr></THead>
            <tbody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</TD>
                  <TD className="text-xs">{a.actorLabel}<div className="text-stone-400">{a.actorType.toLowerCase()}</div></TD>
                  <TD className="font-mono text-xs">{a.action}</TD>
                  <TD className="text-xs">{a.entityType}<div className="text-stone-400">{a.entityId.slice(0, 12)}…</div></TD>
                  <TD className="text-xs">{a.eventRequestId ? <Link href={`/admin/requests/${a.eventRequestId}`} className="text-brand-700 underline">{a.eventRequest?.reference}</Link> : "—"}</TD>
                  <TD className="max-w-md font-mono text-[11px] text-stone-600">{a.before ? <div className="truncate">− {JSON.stringify(a.before)}</div> : null}{a.after ? <div className="truncate">+ {JSON.stringify(a.after)}</div> : null}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
