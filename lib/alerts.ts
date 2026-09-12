import { prisma, type Tx } from "@/lib/db";
import type { AlertSeverity } from "@/generated/prisma/enums";

export type AlertType =
  | "NO_ELIGIBLE_MUSICIAN"
  | "CONFLICTING_RESPONSES"
  | "DECLINE"
  | "CHANGE_REQUEST"
  | "LOW_RATING"
  | "AUTOMATION_FAILURE"
  | "NEEDS_INFORMATION"
  | "UNMATCHED_FACILITY"
  | "DUPLICATE"
  | "NO_SHOW"
  | "CANCELLATION"
  | "NEW_MUSICIAN"
  | "FEEDBACK_ISSUE";

export interface RaiseAlertInput {
  type: AlertType;
  severity?: AlertSeverity;
  title: string;
  message: string;
  eventRequestId?: string | null;
  matchId?: string | null;
  musicianId?: string | null;
}

/**
 * Raise an alert for the admin queue. Deduplicates on (type, entity refs) while an
 * identical alert is still unresolved, so retries never create duplicates.
 */
export async function raiseAlert(input: RaiseAlertInput, tx?: Tx) {
  const db = tx ?? prisma;
  const existing = await db.alert.findFirst({
    where: {
      type: input.type,
      title: input.title,
      eventRequestId: input.eventRequestId ?? null,
      matchId: input.matchId ?? null,
      musicianId: input.musicianId ?? null,
      resolvedAt: null,
    },
  });
  if (existing) return existing;
  return db.alert.create({
    data: {
      type: input.type,
      severity: input.severity ?? "WARNING",
      title: input.title,
      message: input.message,
      eventRequestId: input.eventRequestId ?? null,
      matchId: input.matchId ?? null,
      musicianId: input.musicianId ?? null,
    },
  });
}

/** Record an automation failure so it shows in the error/exception queue. */
export async function recordFailure(context: string, err: unknown, refs: Pick<RaiseAlertInput, "eventRequestId" | "matchId" | "musicianId"> = {}) {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`[automation failure] ${context}:`, err);
  try {
    await raiseAlert({ type: "AUTOMATION_FAILURE", severity: "CRITICAL", title: context, message, ...refs });
  } catch (e) {
    console.error("Failed to record automation failure", e);
  }
}
