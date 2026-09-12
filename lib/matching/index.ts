export * from "./types";
export * from "./defaults";
export { runMatching } from "./engine";
export { applyMandatoryFilters } from "./filters";
export { effectiveRate } from "./scoring";
export { addMinutes, weeklyWindowFit, blackoutConflict, bookingConflict, localMinutes } from "./availability";

import { FILTER_LABELS, type FilterCode } from "./types";

/** "12 of 40 excluded: 7 unavailable, 3 out of radius, 2 missing credential" */
export function summarizeExclusions(total: number, summary: Partial<Record<FilterCode, number>>): string {
  const entries = Object.entries(summary) as [FilterCode, number][];
  const excluded = entries.reduce((n, [, c]) => n + c, 0);
  if (excluded === 0) return `All ${total} musicians passed the mandatory filters`;
  const parts = entries
    .sort((a, b) => b[1] - a[1])
    .map(([code, c]) => `${c} ${FILTER_LABELS[code].toLowerCase()}`);
  return `${excluded} of ${total} excluded: ${parts.join(", ")}`;
}
