import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFacilityUser } from "@/lib/rbac";
import { facilityFeedbackTarget, feedbackFor, musicianName, serviceLabel } from "@/lib/services/portal";
import { FeedbackForm } from "@/components/forms/FeedbackForm";
import { StarRow } from "@/components/portal/Shell";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Rate the performance" };
export const dynamic = "force-dynamic";

export default async function FacilityFeedbackPage(props: PageProps<"/portal/facility/feedback/[matchId]">) {
  const u = await requireFacilityUser();
  const { matchId } = await props.params;
  const b = await facilityFeedbackTarget(u.facilityId, matchId);
  if (!b) notFound();
  const mine = feedbackFor(b, "CLIENT");
  const r = b.eventRequest;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/portal/facility" className="text-sm font-semibold text-brand-700">← Home</Link>
      <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight text-ink">How was the performance?</h1>
      <div className="surface mt-5 rounded-2xl p-5 text-base text-ink/80">
        <div className="text-xs uppercase tracking-wide text-stone-500">Event {r.reference}</div>
        <div className="mt-1 font-medium text-stone-900">{musicianName(b.musician)} · {fmtDateTime(r.startAt, r.timezone)}</div>
        <div>{serviceLabel(r.serviceType)} · {r.durationMinutes} min</div>
      </div>
      {mine?.submittedAt ? (
        <div className="surface mt-6 rounded-2xl p-6">
          <p className="text-sm text-stone-500">You rated this performance on {fmtDateTime(mine.submittedAt, r.timezone)}.</p>
          <div className="mt-2"><StarRow value={mine.rating} size="lg" /></div>
          {mine.comments ? <p className="mt-2 text-ink/80">&ldquo;{mine.comments}&rdquo;</p> : null}
          <p className="mt-4 text-xs text-stone-500">Need to change something? Reply to any email from us and our team will update it.</p>
        </div>
      ) : (
        <div className="mt-8">
          <p className="mb-6 text-sm text-ink/65">Your rating goes to the Senior Music Connection team and shapes future matches. Low ratings or flagged issues get a personal follow-up.</p>
          <FeedbackForm kind="CLIENT" matchId={b.id} />
        </div>
      )}
    </div>
  );
}
