import { ActionForm, Disclosure } from "@/components/admin/ActionForm";
import { approveMatchAction } from "@/app/admin/actions";
import { Badge, StatusBadge } from "@/components/ui";
import { CRITERIA, CRITERION_LABELS, FILTER_LABELS, type Criterion, type FilterCode, type Weights } from "@/lib/matching";
import { fmtMoney, decimalToNumber } from "@/lib/utils";
import Link from "next/link";
import type { Match, Musician } from "@/generated/prisma/client";

type Candidate = Match & { musician: Musician };

export function CandidateList({ candidates, weights, eventRequestId, canApprove }: { candidates: Candidate[]; weights: Weights; eventRequestId: string; canApprove: boolean }) {
  const eligible = candidates.filter((c) => c.eligible).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const excluded = candidates.filter((c) => !c.eligible);
  return (
    <div className="space-y-4">
      {eligible.length === 0 ? <div className="rounded-md border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">No eligible musicians in this run.</div> : null}
      {eligible.map((c) => {
        const sub = ((c.subScores as { sub?: Record<Criterion, number>; weighted?: Record<Criterion, number> }) ?? {}).sub ?? ({} as Record<Criterion, number>);
        const weighted = ((c.subScores as { weighted?: Record<Criterion, number> }) ?? {}).weighted ?? ({} as Record<Criterion, number>);
        const reasons = (c.reasons as string[]) ?? [];
        const warnings = (c.warnings as string[]) ?? [];
        const name = c.musician.stageName ? `${c.musician.stageName} (${c.musician.firstName} ${c.musician.lastName})` : `${c.musician.firstName} ${c.musician.lastName}`;
        const isTop = c.rank === 1;
        return (
          <div key={c.id} className={`rounded-lg border bg-white p-4 shadow-sm ${c.selected ? "border-brand-500 ring-1 ring-brand-200" : isTop ? "border-gold-500" : "border-stone-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${isTop ? "bg-brand-700 text-gold-300 ring-2 ring-gold-500" : "bg-gold-100 text-brand-800"}`}>#{c.rank}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/musicians/${c.musicianId}`} className="font-semibold text-stone-900 hover:underline">{name}</Link>
                    {isTop ? <Badge tone="gold">Recommended</Badge> : null}
                    {c.selected ? <Badge tone="brand">Selected</Badge> : null}
                    {c.isOverride ? <Badge tone="warning">Override</Badge> : null}
                    {c.exceptionStatus ? <StatusBadge status={c.exceptionStatus} /> : c.selected ? <StatusBadge status={c.status} /> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-500">
                    {c.musician.entertainmentTypes.map((t) => t.toLowerCase().replace(/_/g, " ")).join(" · ")} · {fmtMoney(decimalToNumber(c.musician.standardRate))}{c.musician.rateStructure === "PER_HOUR" ? "/hr" : ""} · {c.distanceMiles?.toFixed(0)} mi / {c.travelMinutes} min
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-4xl font-semibold tabular-nums text-brand-800">{c.score?.toFixed(1)}</div>
                <div className="text-xs text-stone-500">of 100</div>
              </div>
            </div>

            <div className="mt-3 grid gap-1 sm:grid-cols-7">
              {CRITERIA.map((k) => (
                <div key={k} className="rounded bg-stone-50 px-2 py-1.5" title={`${CRITERION_LABELS[k]}: ${sub[k] ?? 0}/100 × ${weights[k]}% = ${weighted[k] ?? 0}`}>
                  <div className="truncate text-[10px] uppercase tracking-wide text-stone-500">{CRITERION_LABELS[k]}</div>
                  <div className="text-sm font-medium tabular-nums text-stone-900">{sub[k] ?? 0}<span className="text-xs text-stone-400"> × {weights[k]}%</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-stone-200"><div className="h-full bg-brand-500" style={{ width: `${sub[k] ?? 0}%` }} /></div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Why</div>
                <ul className="mt-1 space-y-0.5 text-sm text-stone-700">{reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
              </div>
              <div>
                {warnings.length ? (
                  <>
                    <div className="text-xs font-medium uppercase tracking-wide text-amber-700">Warnings</div>
                    <ul className="mt-1 space-y-0.5 text-sm text-amber-800">{warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
                  </>
                ) : <div className="text-xs text-stone-400">No warnings</div>}
                {c.overrideReason ? <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900"><strong>Override reason:</strong> {c.overrideReason}</div> : null}
                {c.musicianResponse || c.facilityResponse ? (
                  <div className="mt-2 text-xs text-stone-600">Musician: <StatusBadge status={c.musicianResponse ?? "PENDING"} /> Facility: <StatusBadge status={c.facilityResponse ?? "PENDING"} /></div>
                ) : null}
              </div>
            </div>

            {canApprove && !c.selected ? (
              <div className="mt-3 border-t border-stone-100 pt-3">
                {isTop ? (
                  <ActionForm action={approveMatchAction} hidden={{ matchId: c.id, eventRequestId }} submitLabel="Approve recommendation & send offers" inline />
                ) : (
                  <Disclosure title={`Select #${c.rank} instead (override — reason required)`}>
                    <ActionForm action={approveMatchAction} hidden={{ matchId: c.id, eventRequestId }} submitLabel="Select this candidate & send offers" variant="secondary">
                      <textarea name="overrideReason" required rows={2} placeholder="Why are you choosing this candidate over the top recommendation? This is logged and used to tune the weights." className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
                    </ActionForm>
                  </Disclosure>
                )}
              </div>
            ) : null}
          </div>
        );
      })}

      {excluded.length ? (
        <Disclosure title={`${excluded.length} excluded by mandatory filters`}>
          <table className="w-full text-sm">
            <tbody>
              {excluded.map((c) => {
                const [code, ...rest] = (c.failedFilter ?? "").split(":");
                return (
                  <tr key={c.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-1 pr-3"><Link href={`/admin/musicians/${c.musicianId}`} className="hover:underline">{c.musician.stageName ?? `${c.musician.firstName} ${c.musician.lastName}`}</Link></td>
                    <td className="py-1 pr-3"><Badge tone="danger">{FILTER_LABELS[code as FilterCode] ?? code}</Badge></td>
                    <td className="py-1 text-xs text-stone-500">{rest.join(":").trim()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Disclosure>
      ) : null}
    </div>
  );
}
