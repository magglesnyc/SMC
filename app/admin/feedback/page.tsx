import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, Empty, LinkButton, PageHeader, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { closeFeedbackAction } from "../actions";
import { fmtDateTime, titleCase } from "@/lib/utils";

export default async function FeedbackPage(props: PageProps<"/admin/feedback">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "all" ? "all" : "open";
  const rows = await prisma.feedback.findMany({
    where: view === "open" ? { status: { in: ["SCHEDULED", "SENT", "FOLLOW_UP_REQUIRED"] } } : undefined,
    include: { eventRequest: true, musician: true, facility: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Feedback" description="Client and musician feedback linked to each event" actions={user.role === "ADMIN" ? <LinkButton href="/api/admin/export/feedback">Export CSV</LinkButton> : null} />
      <div className="mb-4 flex gap-2 text-sm">
        <Link href="/admin/feedback" className={`rounded-full px-3 py-1 ${view === "open" ? "bg-stone-800 text-white" : "bg-white ring-1 ring-stone-200"}`}>Open</Link>
        <Link href="/admin/feedback?view=all" className={`rounded-full px-3 py-1 ${view === "all" ? "bg-stone-800 text-white" : "bg-white ring-1 ring-stone-200"}`}>All</Link>
      </div>
      <Card>
        {rows.length === 0 ? <div className="p-5"><Empty>No feedback rows.</Empty></div> : (
          <Table>
            <THead><tr><TH>Event</TH><TH>Kind</TH><TH>From</TH><TH>Status</TH><TH>Rating</TH><TH>Comments / issues</TH><TH>Follow-up</TH></tr></THead>
            <tbody>
              {rows.map((f) => (
                <TR key={f.id}>
                  <TD><Link href={`/admin/requests/${f.eventRequestId}`} className="text-brand-700 hover:underline">{f.eventRequest.reference}</Link><div className="text-xs text-stone-500">{fmtDateTime(f.eventRequest.startAt, f.eventRequest.timezone)}</div></TD>
                  <TD>{titleCase(f.kind)}</TD>
                  <TD className="text-xs">{f.kind === "CLIENT" ? f.facility.name : (f.musician.stageName ?? `${f.musician.firstName} ${f.musician.lastName}`)}<br /><span className="text-stone-500">about {f.kind === "CLIENT" ? (f.musician.stageName ?? `${f.musician.firstName} ${f.musician.lastName}`) : f.facility.name}</span></TD>
                  <TD><StatusBadge status={f.status} />{f.sentAt ? <div className="text-xs text-stone-500">sent {fmtDateTime(f.sentAt)}</div> : null}</TD>
                  <TD className="text-lg">{f.rating ? `${f.rating}★` : "—"}</TD>
                  <TD className="max-w-sm text-xs text-stone-700">{f.comments}{f.issues.length ? <div className="text-amber-800">Issues: {f.issues.join(", ")}</div> : null}</TD>
                  <TD>
                    {f.status === "FOLLOW_UP_REQUIRED" ? (
                      <ActionForm action={closeFeedbackAction} hidden={{ feedbackId: f.id }} submitLabel="Close" variant="outline">
                        <input name="notes" placeholder="Follow-up notes" className="h-8 w-40 rounded-md border border-stone-300 px-2 text-xs" />
                      </ActionForm>
                    ) : f.followUpNotes ? <span className="text-xs text-stone-500">{f.followUpNotes}</span> : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
