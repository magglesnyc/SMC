import { validateWeights } from "./defaults";
import { applyMandatoryFilters } from "./filters";
import { insuranceWarning, scoreAll } from "./scoring";
import { CRITERIA, type Candidate, type Criterion, type EngineInput, type EngineResult, type FilterCode } from "./types";

const emptyScores = (): Record<Criterion, number> =>
  Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<Criterion, number>;

/**
 * Run the matching engine for one event request against a roster.
 * Pure: no I/O. Deterministic for a given input.
 */
export function runMatching(input: EngineInput): EngineResult {
  const started = Date.now();
  const relaxations = input.relaxations ?? {};
  const validation = validateWeights(input.weights);
  if (!validation.ok) {
    throw new Error(`Invalid weights: ${validation.errors.join("; ")}`);
  }

  const eligible: Candidate[] = [];
  const excluded: Candidate[] = [];
  const exclusionSummary: Partial<Record<FilterCode, number>> = {};

  for (const m of input.musicians) {
    const travel = input.travel[m.id];
    const filter = applyMandatoryFilters(m, input.request, travel, input.thresholds, relaxations, input.now);

    if (!filter.passed) {
      const code = filter.code as FilterCode;
      exclusionSummary[code] = (exclusionSummary[code] ?? 0) + 1;
      excluded.push({
        musicianId: m.id,
        musicianName: m.name,
        eligible: false,
        failedFilter: code,
        filterDetail: filter.detail,
        score: 0,
        subScores: emptyScores(),
        weighted: emptyScores(),
        reasons: [],
        warnings: [],
        distanceMiles: travel?.distanceMiles,
        travelMinutes: travel ? Math.round(travel.durationMinutes) : undefined,
      });
      continue;
    }

    const scores = scoreAll(m, input.request, filter.computed, input.thresholds, relaxations);
    const subScores = emptyScores();
    const weighted = emptyScores();
    const reasons: string[] = [];
    const warnings: string[] = [];
    let total = 0;
    for (const c of CRITERIA) {
      subScores[c] = scores[c].score;
      weighted[c] = Math.round(scores[c].score * (input.weights[c] / 100) * 100) / 100;
      total += weighted[c];
      reasons.push(...scores[c].reasons);
      warnings.push(...scores[c].warnings);
    }
    const ins = insuranceWarning(m, filter.computed.eventEnd, input.thresholds);
    if (ins) warnings.push(ins);

    eligible.push({
      musicianId: m.id,
      musicianName: m.name,
      eligible: true,
      score: Math.round(total * 10) / 10,
      subScores,
      weighted,
      reasons,
      warnings,
      distanceMiles: travel?.distanceMiles,
      travelMinutes: travel ? Math.round(travel.durationMinutes) : undefined,
    });
  }

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.travelMinutes ?? Infinity;
    const db = b.travelMinutes ?? Infinity;
    if (da !== db) return da - db;
    return a.musicianName.localeCompare(b.musicianName);
  });
  eligible.forEach((c, i) => (c.rank = i + 1));

  return {
    candidates: [...eligible, ...excluded],
    eligible,
    excluded,
    exclusionSummary,
    totalMusicians: input.musicians.length,
    eligibleCount: eligible.length,
    weights: input.weights,
    thresholds: input.thresholds,
    relaxations,
    durationMs: Date.now() - started,
  };
}
