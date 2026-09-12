import { CRITERIA, type Thresholds, type Weights } from "./types";

/** Starting weights from the product spec (Section 5.2). Configurable in the admin UI. */
export const DEFAULT_WEIGHTS: Weights = {
  availability: 25,
  service: 20,
  distance: 15,
  audience: 15,
  budget: 10,
  quality: 10,
  rotation: 5,
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  comfortableBufferMinutes: 60,
  nearMinutes: 15,
  farMinutes: 90,
  longTravelWarningMinutes: 45,
  budgetComfortRatio: 0.8,
  budgetHardOverRatio: 1.25,
  lowRatingWarning: 3.5,
  rotationWindowDays: 90,
  rotationSaturationCount: 4,
  insuranceExpiryWarningDays: 30,
  bookingGapMinutes: 30,
};

export interface WeightValidation {
  ok: boolean;
  total: number;
  errors: string[];
}

/** Weights must be non-negative and sum to exactly 100 (tolerating floating error). */
export function validateWeights(weights: Partial<Record<string, unknown>>): WeightValidation {
  const errors: string[] = [];
  let total = 0;
  for (const c of CRITERIA) {
    const v = weights[c];
    if (typeof v !== "number" || Number.isNaN(v)) {
      errors.push(`${c}: must be a number`);
      continue;
    }
    if (v < 0) errors.push(`${c}: cannot be negative`);
    total += v;
  }
  const extra = Object.keys(weights).filter((k) => !(CRITERIA as readonly string[]).includes(k));
  if (extra.length) errors.push(`Unknown criteria: ${extra.join(", ")}`);
  if (Math.abs(total - 100) > 0.001) errors.push(`Weights sum to ${total}, must sum to 100`);
  return { ok: errors.length === 0, total, errors };
}

export function coerceWeights(input: unknown): Weights {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_WEIGHTS };
  for (const c of CRITERIA) {
    const v = src[c];
    if (typeof v === "number" && !Number.isNaN(v)) out[c] = v;
  }
  return out;
}

export function coerceThresholds(input: unknown): Thresholds {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_THRESHOLDS };
  for (const k of Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[]) {
    const v = src[k];
    if (typeof v === "number" && !Number.isNaN(v)) out[k] = v;
  }
  return out;
}
