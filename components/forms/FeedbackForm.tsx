"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { FEEDBACK_ISSUES_CLIENT, FEEDBACK_ISSUES_MUSICIAN } from "@/lib/validation/constants";
import { titleCase } from "@/lib/utils";
import { textareaClass } from "./shared";

function Stars({ value, onChange, name }: { value: number; onChange: (v: number) => void; name: string }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} className={`h-11 w-11 rounded-full border text-xl transition ${value >= n ? "border-gold-500 bg-gold-100 text-gold-700" : "border-stone-300 text-stone-300 hover:text-gold-500"}`}>
          ★
        </button>
      ))}
    </div>
  );
}

/**
 * Two doors to the same form: `refToken` (emailed single-use link, posts to the public endpoint) or
 * `matchId` (signed-in portal, posts to the session-guarded portal endpoint).
 */
export function FeedbackForm({ kind, refToken, matchId }: { kind: "CLIENT" | "MUSICIAN"; refToken?: string; matchId?: string }) {
  const [rating, setRating] = useState(0);
  const [secondary, setSecondary] = useState<Record<string, number>>({});
  const [issues, setIssues] = useState<string[]>([]);
  const [comments, setComments] = useState("");
  const [again, setAgain] = useState(true);
  const [followUp, setFollowUp] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "submitting" | "done" | "error"; message?: string }>({ status: "idle" });

  const secondaryKeys = kind === "CLIENT" ? ["engagement", "punctuality", "professionalism"] : ["venueSetup", "staffSupport", "audienceEngagement"];
  const issueOptions = kind === "CLIENT" ? FEEDBACK_ISSUES_CLIENT : FEEDBACK_ISSUES_MUSICIAN;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      setState({ status: "error", message: "Please choose an overall rating." });
      return;
    }
    setState({ status: "submitting" });
    const target = matchId ? { matchId } : { ref: refToken };
    const body = { kind, ...target, rating, secondaryRatings: secondary, comments, issues, followUpRequested: followUp, ...(kind === "CLIENT" ? { wouldBookAgain: again } : { wouldReturn: again }) };
    const res = await fetch(matchId ? `/api/portal/${kind === "CLIENT" ? "facility" : "musician"}/feedback` : "/api/public/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) setState({ status: "error", message: data.error ?? "Something went wrong" });
    else setState({ status: "done" });
  }

  if (state.status === "done") {
    return <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900"><h2 className="text-lg font-semibold">Thank you.</h2><p className="mt-1 text-sm">Your feedback has been recorded against this event.</p>{matchId ? <a href={kind === "CLIENT" ? "/portal/facility" : "/portal/musician"} className="mt-3 inline-block text-sm font-semibold underline">Back to your home page →</a> : null}</div>;
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">{kind === "CLIENT" ? "Overall, how was the performance?" : "Overall, how was your experience at this venue?"}</p>
        <Stars value={rating} onChange={setRating} name="overall" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {secondaryKeys.map((k) => (
          <div key={k}>
            <p className="mb-1 text-sm text-stone-700">{titleCase(k.replace(/([A-Z])/g, " $1"))}</p>
            <Stars value={secondary[k] ?? 0} onChange={(v) => setSecondary({ ...secondary, [k]: v })} name={k} />
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">Any issues?</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {issueOptions.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={issues.includes(o)} onChange={(e) => setIssues(e.target.checked ? [...issues, o] : issues.filter((x) => x !== o))} className="h-4 w-4 rounded border-stone-300" />
              {titleCase(o)}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-stone-700">Comments</p>
        <textarea className={textareaClass} rows={4} value={comments} onChange={(e) => setComments(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />{kind === "CLIENT" ? "We would book this musician again" : "I would perform at this venue again"}</label>
      <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />Please have someone from SMC follow up with me</label>
      {state.status === "error" ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.message}</div> : null}
      <Button type="submit" size="lg" disabled={state.status === "submitting"}>{state.status === "submitting" ? "Sending…" : "Submit feedback"}</Button>
    </form>
  );
}
