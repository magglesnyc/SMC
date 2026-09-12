import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { resolveAlertAction } from "../actions";
import { fmtDateTime, titleCase } from "@/lib/utils";

export default async function AlertsPage(props: PageProps<"/admin/alerts">) {
  await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "resolved" ? "resolved" : sp.view === "errors" ? "errors" : "open";
  const alerts = await prisma.alert.findMany({
    where: view === "resolved" ? { resolvedAt: { not: null } } : view === "errors" ? { resolvedAt: null, type: "AUTOMATION_FAILURE" } : { resolvedAt: null },
    include: { eventRequest: true, musician: true, resolvedBy: true },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Exceptions & errors" description="Records needing a human: declines, conflicts, change requests, no eligible musicians, low ratings, failed automations." />
      <div className="mb-4 flex gap-2 text-sm">
        {[["open", "Open"], ["errors", "Automation failures"], ["resolved", "Resolved"]].map(([v, l]) => (
          <Link key={v} href={`/admin/alerts?view=${v}`} className={`rounded-full px-3 py-1 ${view === v ? "bg-stone-800 text-white" : "bg-white ring-1 ring-stone-200"}`}>{l}</Link>
        ))}
      </div>
      {alerts.length === 0 ? <Empty>Nothing in this queue.</Empty> : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={a.severity} /><span className="text-xs uppercase tracking-wide text-stone-500">{titleCase(a.type)}</span><span className="text-xs text-stone-400">{fmtDateTime(a.createdAt)}</span></div>
                  <div className="mt-1 font-medium text-stone-900">{a.title}</div>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-stone-700">{a.message}</pre>
                  <div className="mt-1 flex gap-3 text-xs">
                    {a.eventRequest ? <Link href={`/admin/requests/${a.eventRequest.id}`} className="text-brand-700 underline">Open {a.eventRequest.reference}</Link> : null}
                    {a.musician ? <Link href={`/admin/musicians/${a.musician.id}`} className="text-brand-700 underline">Open musician</Link> : null}
                  </div>
                  {a.resolvedAt ? <div className="mt-1 text-xs text-emerald-700">Resolved {fmtDateTime(a.resolvedAt)}{a.resolvedBy ? ` by ${a.resolvedBy.name}` : ""}{a.resolutionNote ? ` — ${a.resolutionNote}` : ""}</div> : null}
                </div>
                {!a.resolvedAt ? (
                  <ActionForm action={resolveAlertAction} hidden={{ alertId: a.id }} submitLabel="Resolve" variant="outline" inline>
                    <input name="note" placeholder="Resolution note" className="h-8 rounded-md border border-stone-300 px-2 text-xs" />
                  </ActionForm>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
