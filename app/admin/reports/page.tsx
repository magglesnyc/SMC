import { requireUser } from "@/lib/rbac";
import { matchQuality, outcomes, responseTracking, targetMetrics } from "@/lib/services/metrics";
import { Card, CardBody, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui";
import { FILTER_LABELS, type FilterCode } from "@/lib/matching";

const h = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} h`);

export default async function ReportsPage() {
  const user = await requireUser();
  const [resp, out, quality, targets] = await Promise.all([responseTracking(90), outcomes(365), matchQuality(365), targetMetrics()]);
  const maxRating = Math.max(1, ...Object.values(out.ratingDistribution));
  return (
    <div>
      <PageHeader title="Reports" description="Response tracking, outcomes, match quality, and the target metrics from the product spec." actions={user.role === "ADMIN" ? <><LinkButton href="/api/admin/export/matches">Export matches CSV</LinkButton><LinkButton href="/api/admin/export/audit">Export audit CSV</LinkButton></> : null} />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Target metrics</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Ready → recommendation" value={targets.medianMinutesReadyToRecommendation == null ? "—" : `${targets.medianMinutesReadyToRecommendation.toFixed(0)} min`} hint="Median (faster matching)" />
        <Stat label="Admin touches / event" value={targets.medianAdminTouchesPerCompletedEvent ?? "—"} hint="Median staff actions per completed event" />
        <Stat label="Candidates with reasons" value={`${targets.consistency.totalEligibleCandidates}/${targets.consistency.matchRunsWithReasons}`} hint="Consistency: every eligible candidate carries filters, scores, reasons" />
        <Stat label="Both responses ≤ 48h" value={targets.responsesWithin48hPct == null ? "—" : `${targets.responsesWithin48hPct}%`} hint="Target 90%" tone={targets.responsesWithin48hPct != null && targets.responsesWithin48hPct < 90 ? "warning" : "success"} />
        <Stat label="Complete trail" value={`${targets.traceability.withCompleteTrail}/${targets.traceability.confirmedEvents}`} hint="Confirmed events with match + audit trail" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Response tracking (90 days)" description="Time from offer to response, per party" />
          <CardBody>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-stone-500"><tr><th>Party</th><th>Responded</th><th>Median</th><th>Average</th></tr></thead>
              <tbody>
                <tr><td className="py-1">Musician</td><td>{resp.musician.responded}/{resp.offers}</td><td>{h(resp.musician.medianHours)}</td><td>{h(resp.musician.avgHours)}</td></tr>
                <tr><td className="py-1">Facility</td><td>{resp.facility.responded}/{resp.offers}</td><td>{h(resp.facility.medianHours)}</td><td>{h(resp.facility.avgHours)}</td></tr>
                <tr className="font-medium"><td className="py-1">Both parties</td><td>—</td><td>{h(resp.bothMedianHours)}</td><td>{resp.bothWithin48hPct == null ? "—" : `${resp.bothWithin48hPct}% within 48h`}</td></tr>
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Outcomes (12 months)" />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>Completed: <strong>{out.completed}</strong></div>
              <div>Confirmed upcoming: <strong>{out.confirmedUpcoming}</strong></div>
              <div>Cancelled: <strong>{out.cancelled}</strong></div>
              <div>No-shows: <strong>{out.noShow}</strong></div>
              <div>Completion rate: <strong>{out.completionRatePct ?? "—"}%</strong></div>
              <div>Cancellation / no-show rate: <strong>{out.cancellationRatePct ?? "—"}%</strong></div>
            </div>
            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Client rating distribution</div>
              <div className="mt-2 space-y-1">
                {[5, 4, 3, 2, 1].map((r) => (
                  <div key={r} className="flex items-center gap-2 text-sm"><span className="w-6">{r}★</span><div className="h-3 flex-1 overflow-hidden rounded bg-stone-100"><div className="h-full bg-brand-500" style={{ width: `${(out.ratingDistribution[r] / maxRating) * 100}%` }} /></div><span className="w-8 text-right text-stone-600">{out.ratingDistribution[r]}</span></div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Match quality (12 months)" description="Overrides are the feedback loop for tuning weights." />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-5">
              <Stat label="Approvals" value={quality.approvals} />
              <Stat label="Override rate" value={quality.overrideRatePct == null ? "—" : `${quality.overrideRatePct}%`} hint={`${quality.overrides} overrides`} tone={quality.overrideRatePct != null && quality.overrideRatePct > 30 ? "warning" : undefined} />
              <Stat label="Avg approved score" value={quality.avgApprovedScore ?? "—"} />
              <Stat label="Avg approved rank" value={quality.avgApprovedRank ?? "—"} />
              <Stat label="Avg eligible / run" value={quality.avgEligible ?? "—"} hint={`${quality.runs} runs`} />
            </div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Exclusion reasons (all runs)</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {Object.entries(quality.exclusions).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span>{FILTER_LABELS[k as FilterCode] ?? k}</span><strong>{v}</strong></li>)}
                  {Object.keys(quality.exclusions).length === 0 ? <li className="text-stone-500">No runs yet.</li> : null}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Override reasons</div>
                <ul className="mt-2 space-y-1 text-sm text-stone-700">
                  {quality.overrideReasons.slice(0, 12).map((r, i) => <li key={i}>• {r}</li>)}
                  {quality.overrideReasons.length === 0 ? <li className="text-stone-500">No overrides recorded.</li> : null}
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
