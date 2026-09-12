import { feedbackContext } from "@/lib/services/feedback";
import { eventSummary } from "@/lib/services/eventRequests";
import { FeedbackForm } from "@/components/forms/FeedbackForm";

export async function FeedbackPage({ kind, refToken }: { kind: "CLIENT" | "MUSICIAN"; refToken: string | undefined }) {
  if (!refToken) return <Inactive reason="This feedback link is missing its event reference." />;
  const { state, match } = await feedbackContext(refToken, kind);
  if (state === "used") return <Inactive reason="Thank you — feedback for this event has already been submitted." />;
  if (state !== "active" || !match) return <Inactive reason="This link is no longer active. If you still want to share feedback, reply to the email we sent you." />;
  const e = eventSummary(match.eventRequest, { musicianName: match.musician.stageName ?? `${match.musician.firstName} ${match.musician.lastName}` });
  return (
    <div>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">{kind === "CLIENT" ? "How was the performance?" : "How was the venue?"}</h1>
      <div className="surface mt-5 rounded-2xl p-5 text-base text-ink/80">
        <div className="text-xs uppercase tracking-wide text-stone-500">Event {e.reference}</div>
        <div className="mt-1 font-medium text-stone-900">{e.facilityName} · {e.when}</div>
        <div>{e.service} · {e.durationMinutes} min{kind === "CLIENT" ? ` · ${e.musicianName}` : ""}</div>
      </div>
      <div className="mt-8">
        <FeedbackForm kind={kind} refToken={refToken} />
      </div>
    </div>
  );
}

function Inactive({ reason }: { reason: string }) {
  return (
    <div className="surface rounded-2xl p-8 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">This link is no longer active</h1>
      <p className="mt-2 text-sm text-stone-600">{reason}</p>
    </div>
  );
}
