"use client";

import { useActionState, useState } from "react";
import { respondAction, type RespondState } from "./actions";
import { Button } from "@/components/ui";

export function ResponseForm({ token, role }: { token: string; role: "MUSICIAN" | "FACILITY" }) {
  const [state, formAction, pending] = useActionState<RespondState, FormData>(respondAction, null);
  const [action, setAction] = useState<"ACCEPT" | "DECLINE" | "REQUEST_CHANGES">("ACCEPT");

  if (state?.outcome) {
    const o = state.outcome;
    if (!o.ok) {
      return (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-stone-900">This link is no longer active</h2>
          <p className="mt-2 text-sm text-stone-600">{o.reason === "inactive" ? "It may have already been used, expired, or the offer was withdrawn. If you still need to respond, reply to the email." : "This offer is no longer open for responses."}</p>
        </div>
      );
    }
    const heading = o.response === "ACCEPTED" ? (o.confirmed ? "Confirmed — the event is booked" : "Thank you — your acceptance is recorded") : o.response === "DECLINED" ? "Thanks for letting us know" : "Change request received";
    const body =
      o.response === "ACCEPTED"
        ? o.confirmed
          ? "Both parties have accepted. You will receive a confirmation email and a reminder before the event."
          : `We are waiting on the ${role === "MUSICIAN" ? "facility" : "musician"} to respond. We will email you once the booking is confirmed.`
        : o.response === "DECLINED"
          ? "We have recorded your decline and our team will arrange an alternative."
          : "Confirmation is paused while our team reviews your request. We will follow up shortly.";
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="mt-2 text-sm">{body}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="surface space-y-5 rounded-2xl p-6">
      <input type="hidden" name="token" value={token} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-stone-700">Your response</legend>
        {(
          [
            ["ACCEPT", "Accept", role === "MUSICIAN" ? "I am available and accept this booking." : "Please book this musician for our event."],
            ["DECLINE", "Decline", role === "MUSICIAN" ? "I cannot take this booking." : "We do not want to proceed with this musician."],
            ["REQUEST_CHANGES", "Request changes", "I can proceed if something changes (time, duration, rate, room…)."],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${action === value ? "border-gold-500 bg-gold-100/60" : "border-stone-200 hover:border-gold-300"}`}>
            <input type="radio" name="action" value={value} checked={action === value} onChange={() => setAction(value)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-stone-900">{label}</span>
              <span className="block text-xs text-stone-600">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <label className="mb-1 block text-sm font-medium text-stone-700">{action === "REQUEST_CHANGES" ? "What needs to change?" : "Note (optional)"}</label>
        <textarea name="note" rows={3} className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      </div>
      {state?.error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div> : null}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Sending…" : "Send response"}</Button>
      <p className="text-xs text-stone-500">This link can be used once. Sending a response closes it.</p>
    </form>
  );
}
