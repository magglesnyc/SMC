/**
 * Backtest the matching engine against historical bookings.
 *
 * For every closed request with a selected (booked) musician, rebuild the engine input as
 * of that event, run the engine, and report where the musician who was actually booked
 * landed in the ranking. Run before changing weights, and after, to see the effect.
 *
 *   npx tsx scripts/backtest.ts            # uses the stored weights
 *   npx tsx scripts/backtest.ts weights.json
 *
 * Caveat: musician profiles are their *current* state, so history that changed since the
 * event (rates, availability) can move a result. Persisted MatchRun snapshots are the
 * authoritative record of what the engine said at the time.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { runMatching, coerceWeights, validateWeights, summarizeExclusions, type EngineMusician } from "../lib/matching";
import { estimateTravel } from "../lib/geo";
import { getMatchingConfig, toEngineMusician, toEngineRequest } from "../lib/services/matching";

async function main() {
  const cfg = await getMatchingConfig();
  let weights = cfg.weights;
  if (process.argv[2]) {
    weights = coerceWeights(JSON.parse(readFileSync(process.argv[2], "utf8")));
    const v = validateWeights(weights);
    if (!v.ok) throw new Error(v.errors.join("; "));
  }
  const history = await prisma.match.findMany({
    where: { selected: true, status: { in: ["CONFIRMED", "COMPLETED"] }, eventRequest: { status: "CLOSED" } },
    include: { eventRequest: { include: { facility: true } }, musician: true },
    orderBy: { eventRequest: { startAt: "asc" } },
  });
  const musicians = await prisma.musician.findMany({ include: { preferences: true } });

  const rows: { ref: string; booked: string; rank: number | null; score: number | null; eligible: number; excludedReason?: string; wasOverride: boolean }[] = [];
  for (const h of history) {
    const req = toEngineRequest(h.eventRequest);
    const engineMusicians: EngineMusician[] = musicians.map((m) =>
      toEngineMusician(
        { ...m, preferences: m.preferences.filter((p) => p.facilityId === req.facilityId), matches: [] },
        req,
        new Date(0),
        new Date(0),
        new Date(0),
      ),
    );
    // Historical statuses: treat the booked musician as active for the evaluation.
    for (const m of engineMusicians) if (m.id === h.musicianId && m.status !== "ACTIVE") m.status = "ACTIVE";
    const travel = await estimateTravel(engineMusicians.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })), req.lat != null && req.lng != null ? { lat: req.lat, lng: req.lng } : null);
    const result = runMatching({ request: req, musicians: engineMusicians, travel, weights, thresholds: cfg.thresholds, now: new Date(h.eventRequest.startAt.getTime() - 14 * 86_400_000) });
    const c = result.candidates.find((x) => x.musicianId === h.musicianId);
    rows.push({
      ref: h.eventRequest.reference,
      booked: `${h.musician.firstName} ${h.musician.lastName}`,
      rank: c?.rank ?? null,
      score: c?.eligible ? c.score : null,
      eligible: result.eligibleCount,
      excludedReason: c && !c.eligible ? `${c.failedFilter}: ${c.filterDetail ?? ""}` : undefined,
      wasOverride: h.isOverride,
    });
    if (rows.length === 1) console.log(`Example run: ${summarizeExclusions(result.totalMusicians, result.exclusionSummary)}`);
  }

  const n = rows.length;
  const top1 = rows.filter((r) => r.rank === 1).length;
  const top3 = rows.filter((r) => r.rank != null && r.rank <= 3).length;
  const excluded = rows.filter((r) => r.rank == null).length;
  console.table(rows);
  console.log(`\nWeights: ${JSON.stringify(weights)}`);
  console.log(`Historical bookings: ${n}`);
  console.log(`Booked musician ranked #1: ${top1} (${n ? Math.round((top1 / n) * 100) : 0}%)`);
  console.log(`Booked musician in top 3:  ${top3} (${n ? Math.round((top3 / n) * 100) : 0}%)`);
  console.log(`Booked musician excluded:  ${excluded}${excluded ? "  ← investigate: a mandatory filter disagrees with history" : ""}`);
  const nonOverride = rows.filter((r) => !r.wasOverride);
  const t1no = nonOverride.filter((r) => r.rank === 1).length;
  console.log(`Excluding recorded overrides (${nonOverride.length}): #1 = ${t1no} (${nonOverride.length ? Math.round((t1no / nonOverride.length) * 100) : 0}%)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
