/**
 * Handles one Monday webhook event: identify the board, drop our own echoes, re-read the item and run the
 * single-item importer. Monday delivers ids and the changed column only, never the full item, so every event
 * costs one items() query; that keeps the handler robust to event-type details.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { raiseAlert } from "@/lib/alerts";
import { BOARDS, type BoardKey } from "./boards";
import { fetchItems } from "./client";
import { pullItems } from "./pull";

export interface MondayWebhookEvent {
  type: string; // create_pulse | update_column_value | update_name | move_pulse_into_group | archive_pulse | delete_pulse | create_update …
  boardId: number | string;
  pulseId?: number | string;
  pulseName?: string;
  columnId?: string;
  columnTitle?: string;
  value?: unknown;
  previousValue?: unknown;
  groupId?: string;
  userId?: number;
  triggerTime?: string;
  app?: string;
  triggerUuid?: string;
}

export type WebhookOutcome = { handled: false; reason: string } | { handled: true; board: BoardKey; itemId: string; result: Awaited<ReturnType<typeof pullItems>> };

const ECHO_WINDOW_MS = 10 * 60_000;

export function boardKeyFor(boardId: string): BoardKey | null {
  for (const [key, id] of Object.entries(BOARDS) as [BoardKey, string][]) if (id === boardId) return key;
  return null;
}

export function syncEnabled(): boolean {
  return process.env.MONDAY_SYNC_ENABLED === "true" && Boolean(process.env.MONDAY_API_TOKEN);
}

export async function handleMondayEvent(event: MondayWebhookEvent): Promise<WebhookOutcome> {
  const boardId = String(event.boardId);
  const itemId = event.pulseId != null ? String(event.pulseId) : null;
  const board = boardKeyFor(boardId);
  await prisma.mondaySyncLog.create({ data: { direction: "WEBHOOK", boardId, itemId, action: event.type, detail: { columnId: event.columnId ?? null, groupId: event.groupId ?? null, userId: event.userId ?? null } } });
  if (!board) return { handled: false, reason: `board ${boardId} is not synced` };
  if (!itemId) return { handled: false, reason: "no item id on event" };

  if (event.type === "delete_pulse" || event.type === "archive_pulse") {
    const link = await prisma.mondayLink.findFirst({ where: { boardId, itemId } });
    if (link) {
      await raiseAlert({
        type: "AUTOMATION_FAILURE",
        severity: "WARNING",
        title: `Monday item ${event.type === "delete_pulse" ? "deleted" : "archived"}: ${event.pulseName ?? itemId}`,
        message: `The ${board} item linked to ${link.entityType} ${link.entityId} was ${event.type === "delete_pulse" ? "deleted" : "archived"} in Monday. The app record was left as-is; review it and close or archive it by hand.`,
        ...(link.entityType === "EventRequest" ? { eventRequestId: link.entityId } : link.entityType === "Musician" ? { musicianId: link.entityId } : {}),
      });
    }
    return { handled: false, reason: "delete/archive noted; app record untouched" };
  }

  // Our own write coming back: same item + column written within the echo window.
  if (event.type === "update_column_value" && event.columnId) {
    const echo = await prisma.mondayEcho.findFirst({ where: { itemId, columnId: event.columnId, createdAt: { gte: new Date(Date.now() - ECHO_WINDOW_MS) } }, orderBy: { createdAt: "desc" } });
    if (echo) {
      await prisma.mondayEcho.delete({ where: { id: echo.id } }).catch(() => {});
      return { handled: false, reason: "echo of our own write" };
    }
  }

  const [item] = await fetchItems([itemId]);
  if (!item) return { handled: false, reason: "item no longer readable" };
  const result = await pullItems(board, [item]);
  return { handled: true, board, itemId, result };
}

/** Housekeeping: echoes are only meaningful for a few minutes. */
export async function pruneEchoes() {
  await prisma.mondayEcho.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } });
}

export function hashValue(v: unknown) {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex");
}
