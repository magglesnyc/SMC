import { prisma, type Tx } from "@/lib/db";
import type { ActorType } from "@/generated/prisma/enums";

export interface Actor {
  type: ActorType;
  id?: string | null;
  label: string;
}

export const SYSTEM_ACTOR: Actor = { type: "SYSTEM", label: "system" };

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  eventRequestId?: string | null;
  before?: unknown;
  after?: unknown;
}

type Json = Parameters<typeof prisma.auditLog.create>[0]["data"]["before"];

function toJson(v: unknown): Json {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val))) as Json;
}

/** Append one audit row. Never throws into the caller's transaction on serialisation issues. */
export async function audit(actor: Actor, entry: AuditEntry, tx?: Tx) {
  const db = tx ?? prisma;
  return db.auditLog.create({
    data: {
      actorType: actor.type,
      actorId: actor.id ?? null,
      actorLabel: actor.label,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      eventRequestId: entry.eventRequestId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
