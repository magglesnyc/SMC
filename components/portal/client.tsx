"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { PortalActionResult } from "@/app/portal/actions";

type Action = (prev: PortalActionResult, fd: FormData) => Promise<PortalActionResult>;

/** Accept / decline / request changes on an open offer, from either portal. */
export function RespondForm({ action, matchId, acceptLabel = "Accept" }: { action: Action; matchId: string; acceptLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state?.ok) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{state.message}</div>;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="matchId" value={matchId} />
      <textarea name="note" rows={2} placeholder="Optional note (e.g. a time change you need)" className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="action" value="ACCEPT" disabled={pending}>{acceptLabel}</Button>
        <Button type="submit" name="action" value="REQUEST_CHANGES" variant="outline" disabled={pending}>Request a change</Button>
        <Button type="submit" name="action" value="DECLINE" variant="ghost" disabled={pending}>Decline</Button>
      </div>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}

/** Community toggles a performer on / off its preferred list. */
export function PreferredToggle({ action, musicianId, preferred }: { action: Action; musicianId: string; preferred: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="musicianId" value={musicianId} />
      <input type="hidden" name="preferred" value={preferred ? "0" : "1"} />
      <Button type="submit" size="sm" variant={preferred ? "outline" : "primary"} disabled={pending}>
        {preferred ? "★ Preferred · remove" : "☆ Add to preferred"}
      </Button>
      {state && !state.ok ? <span className="text-xs text-red-700">{state.error}</span> : null}
    </form>
  );
}
