import type { Actor } from "@/lib/audit";

/** Audit actor for everything the Monday sync does on the app side. */
export const MONDAY_ACTOR: Actor = { type: "SYSTEM", label: "monday-sync" };
