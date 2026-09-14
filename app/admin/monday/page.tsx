import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { Alert, Badge, Card, CardBody, CardHeader, Checkbox, Empty, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { mondayPullAction, mondayPushAction } from "../actions";
import { BOARDS, BOARD_LABELS, type BoardKey } from "@/lib/monday/boards";
import { mondayEnabled } from "@/lib/monday/client";
import { syncEnabled } from "@/lib/monday/webhook";
import { fmtDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SYNCED: BoardKey[] = ["entertainers", "clients", "bookingRequests", "gigs", "facilityFeedback", "entertainerFeedback", "applications"];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

export default async function MondaySyncPage() {
  await requireAdmin();
  const enabled = mondayEnabled();
  const scheduled = syncEnabled();
  const [cursors, links, recent, errors24h] = await Promise.all([
    prisma.mondaySyncCursor.findMany(),
    prisma.mondayLink.groupBy({ by: ["boardId"], _count: true, _max: { pushedAt: true, pulledAt: true } }),
    prisma.mondaySyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.mondaySyncLog.count({ where: { action: "error", createdAt: { gte: hoursAgo(24) } } }),
  ]);
  const cursorBy = new Map(cursors.map((c) => [c.boardId, c]));
  const linkBy = new Map(links.map((l) => [l.boardId, l]));
  const boardName = (id: string) => (Object.entries(BOARDS).find(([, v]) => v === id)?.[0] as BoardKey | undefined) ?? id;
  const lastPull = cursors.reduce<Date | null>((a, c) => (c.lastPulledAt && (!a || c.lastPulledAt > a) ? c.lastPulledAt : a), null);
  const lastPush = links.reduce<Date | null>((a, l) => (l._max.pushedAt && (!a || l._max.pushedAt > a) ? l._max.pushedAt : a), null);

  return (
    <div>
      <PageHeader title="Monday.com sync" description="Two-way mirror with the Monday boards while staff keep working there. Monday owns anything it has a column for; the app owns matching, availability and history." />

      {!enabled ? (
        <Alert tone="warning" title="Sync is off">MONDAY_API_TOKEN is not set on this environment, so nothing is read from or written to Monday.</Alert>
      ) : !scheduled ? (
        <Alert tone="info" title="Manual mode">The token is set, so the buttons below work, but MONDAY_SYNC_ENABLED is not &quot;true&quot;: the scheduled push/reconcile and the webhook receiver are paused. This is the intended state while the demo runs on seed data.</Alert>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Linked records" value={links.reduce((n, l) => n + l._count, 0)} hint="Monday items mirrored in the app" />
        <Stat label="Last pull" value={lastPull ? fmtDateTime(lastPull) : "never"} />
        <Stat label="Last push" value={lastPush ? fmtDateTime(lastPush) : "never"} />
        <Stat label="Errors (24h)" value={errors24h} tone={errors24h ? "warning" : "success"} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Boards" description="Per-board state. Feedback and applications are read-only from Monday; agreements are not synced." />
        <CardBody className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR><TH>Board</TH><TH>Monday id</TH><TH>Linked</TH><TH>Last pull</TH><TH>Last push</TH><TH>Last error</TH></TR>
            </THead>
            <tbody>
              {SYNCED.map((key) => {
                const id = BOARDS[key];
                const c = cursorBy.get(id);
                const l = linkBy.get(id);
                return (
                  <TR key={key}>
                    <TD>{BOARD_LABELS[key]}</TD>
                    <TD><span className="font-mono text-xs text-stone-500">{id}</span></TD>
                    <TD>{l?._count ?? 0}</TD>
                    <TD>{c?.lastPulledAt ? fmtDateTime(c.lastPulledAt) : <span className="text-stone-400">—</span>}</TD>
                    <TD>{l?._max.pushedAt ? fmtDateTime(l._max.pushedAt) : <span className="text-stone-400">—</span>}</TD>
                    <TD className="max-w-xs truncate text-xs text-red-700">{c?.lastError ?? ""}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {enabled ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title="Pull from Monday" description="Read every board and update linked records. Items unchanged since the last pull are skipped." />
            <CardBody>
              <ActionForm action={mondayPullAction} submitLabel="Pull now" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Push to Monday" description="Write app changes back to their linked Monday items. Creating new Monday items for app-only records is opt-in." />
            <CardBody>
              <ActionForm action={mondayPushAction} submitLabel="Push now" confirm="Write app changes to the live Monday boards?">
                <Checkbox name="create" label="Also create Monday items for approved musicians, active facilities and app-originated events that have none" />
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader title="Recent activity" description="Newest first. Webhook rows are events received from Monday; pull/push rows are what the app did with them." />
        <CardBody className="overflow-x-auto p-0">
          {recent.length === 0 ? <Empty>No sync activity yet.</Empty> : (
            <Table>
              <THead>
                <TR><TH>When</TH><TH>Direction</TH><TH>Board</TH><TH>Action</TH><TH>Record</TH><TH>Detail</TH></TR>
              </THead>
              <tbody>
                {recent.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</TD>
                    <TD><Badge tone={r.direction === "PULL" ? "info" : r.direction === "PUSH" ? "success" : "neutral"}>{r.direction}</Badge></TD>
                    <TD className="text-xs">{BOARD_LABELS[boardName(r.boardId) as BoardKey] ?? r.boardId}</TD>
                    <TD className={r.action === "error" ? "text-red-700" : ""}>{r.action}</TD>
                    <TD className="text-xs">{r.entityType && r.entityId ? <RecordLink type={r.entityType} id={r.entityId} /> : r.itemId ? <span className="font-mono text-stone-500">item {r.itemId}</span> : ""}</TD>
                    <TD className="max-w-md truncate text-xs text-stone-600">{r.error ?? (r.detail ? JSON.stringify(r.detail) : "")}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function RecordLink({ type, id }: { type: string; id: string }) {
  const href = type === "Musician" ? `/admin/musicians/${id}` : type === "Facility" ? `/admin/facilities/${id}` : type === "EventRequest" ? `/admin/requests/${id}` : null;
  return href ? <Link href={href} className="text-brand-700 underline">{type}</Link> : <span>{type}</span>;
}
