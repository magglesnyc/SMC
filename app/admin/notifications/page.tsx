import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, Empty, PageHeader, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { Disclosure } from "@/components/admin/ActionForm";
import { fmtDateTime } from "@/lib/utils";

export default async function NotificationsPage() {
  await requireUser();
  const rows = await prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 150, include: { match: { include: { eventRequest: true } } } });
  const devMode = !process.env.RESEND_API_KEY;
  return (
    <div>
      <PageHeader title="Email log" description={devMode ? "No RESEND_API_KEY is set: emails are logged here instead of being sent. Expand a row to see the message and its secure link." : "Every outbound email, with delivery status. Each send has an idempotency key so retries never duplicate."} />
      <Card>
        {rows.length === 0 ? <div className="p-5"><Empty>No emails yet.</Empty></div> : (
          <Table>
            <THead><tr><TH>Sent</TH><TH>Status</TH><TH>To</TH><TH>Template</TH><TH>Subject</TH><TH>Event</TH></tr></THead>
            <tbody>
              {rows.map((n) => {
                const payload = n.payload as { devPreview?: boolean; text?: string } | null;
                return (
                  <TR key={n.id}>
                    <TD className="whitespace-nowrap text-xs">{fmtDateTime(n.createdAt)}</TD>
                    <TD><StatusBadge status={n.status} />{n.error ? <div className="max-w-xs text-xs text-red-700">{n.error}</div> : null}</TD>
                    <TD className="text-xs">{n.recipient}</TD>
                    <TD className="font-mono text-xs">{n.templateKey}</TD>
                    <TD className="text-xs">{n.subject}{payload?.devPreview && payload.text ? <div className="mt-1"><Disclosure title="Preview"><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-stone-700">{payload.text}</pre></Disclosure></div> : null}</TD>
                    <TD className="text-xs">{n.eventRequestId ? <Link href={`/admin/requests/${n.eventRequestId}`} className="text-brand-700 underline">{n.match?.eventRequest.reference ?? "open"}</Link> : "—"}</TD>
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
