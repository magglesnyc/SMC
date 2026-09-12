import type { Tx } from "@/lib/db";

/** Human-friendly event reference like EV-2026-0042, allocated inside the caller's transaction. */
export async function nextEventReference(tx: Tx): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `EV-${year}-`;
  const last = await tx.eventRequest.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}
