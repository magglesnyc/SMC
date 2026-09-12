import type { FilterResult } from "./filters";
import type { Criterion, EngineMusician, EngineRequest, Relaxations, Thresholds, TravelEstimate } from "./types";

export interface CriterionScore {
  score: number; // 0–100
  reasons: string[];
  warnings: string[];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const money = (v: number) => `$${v.toFixed(v % 1 === 0 ? 0 : 2)}`;

function overlapFraction(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const set = new Set(b.map((s) => s.toLowerCase()));
  const hits = a.filter((x) => set.has(x.toLowerCase())).length;
  return hits / a.length;
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

export function effectiveRate(m: EngineMusician, durationMinutes: number): number {
  return m.rateStructure === "PER_HOUR" ? m.standardRate * (durationMinutes / 60) : m.standardRate;
}

export function scoreAvailability(f: FilterResult["computed"], t: Thresholds): CriterionScore {
  const slack = Math.min(f.slackBefore, f.slackAfter);
  const travel = f.travel?.durationMinutes ?? 0;
  const warnings: string[] = [];
  let score: number;
  if (slack >= t.comfortableBufferMinutes) {
    score = 100;
  } else {
    // Tight but feasible: 50 at zero slack, rising linearly to 100 at the comfortable buffer.
    score = lerp(slack, 0, t.comfortableBufferMinutes, 50, 100);
    if (slack < 15) warnings.push(`Tight availability: only ${slack} min of slack around the needed window`);
  }
  const reason =
    slack >= t.comfortableBufferMinutes
      ? `Available with ${slack}+ min buffer (incl. ${travel} min travel)`
      : `Available but tight: ${slack} min slack (incl. ${travel} min travel)`;
  return { score: round1(score), reasons: [reason], warnings };
}

export function scoreService(m: EngineMusician, req: EngineRequest): CriterionScore {
  const reasons: string[] = [];
  let score = 60; // the mandatory filter already guarantees the service type matches
  reasons.push(`Offers ${req.serviceType.toLowerCase().replace(/_/g, " ")}`);

  if (req.programTags.length) {
    const frac = overlapFraction(req.programTags, [...m.genres, ...m.instruments, ...m.therapeuticQualifications, ...(m.offersInteractive ? ["interactive"] : [])]);
    score += 20 * frac;
    if (frac > 0) reasons.push(`Matches ${Math.round(frac * 100)}% of program tags`);
  } else {
    score += 10;
  }

  if (req.preferredGenres.length) {
    const frac = overlapFraction(req.preferredGenres, m.genres);
    score += 20 * frac;
    if (frac > 0) {
      const hits = req.preferredGenres.filter((g) => m.genres.map((x) => x.toLowerCase()).includes(g.toLowerCase()));
      reasons.push(`Plays preferred genre${hits.length > 1 ? "s" : ""}: ${hits.join(", ")}`);
    }
  } else {
    score += 10;
  }
  if (req.serviceType === "INTERACTIVE_SESSION" && m.offersInteractive) reasons.push("Offers participatory sessions");
  return { score: round1(clamp(score)), reasons, warnings: [] };
}

export function scoreDistance(m: EngineMusician, travel: TravelEstimate, t: Thresholds): CriterionScore {
  const score = lerp(travel.durationMinutes, t.nearMinutes, t.farMinutes, 100, 0);
  const reasons = [
    `${travel.distanceMiles.toFixed(0)} miles / ${Math.round(travel.durationMinutes)} min — within ${m.maxTravelMiles} mi radius${travel.source === "straight-line" ? " (straight-line estimate)" : ""}`,
  ];
  const warnings: string[] = [];
  if (travel.durationMinutes > t.longTravelWarningMinutes) warnings.push(`Travel time ${Math.round(travel.durationMinutes)} minutes`);
  if (m.travelFeeApplies) warnings.push("Travel fee may apply");
  return { score: round1(score), reasons, warnings };
}

export function scoreAudience(m: EngineMusician, req: EngineRequest): CriterionScore {
  const reasons: string[] = [];
  let score = 0;
  const typeMatch = m.facilityTypeExperience.map((x) => x.toLowerCase()).includes(req.facilityType.toLowerCase());
  if (typeMatch) {
    score += 40;
    reasons.push(`Experienced with ${req.facilityType.replace(/-/g, " ")} venues`);
  } else if (m.facilityTypeExperience.length === 0 && m.completedEvents === 0) {
    score += 20; // unknown, neutral
  }
  const tags = Array.from(new Set([...req.facilityAudienceTags, ...req.hardRequirements.audienceTags]));
  if (tags.length) {
    const frac = overlapFraction(tags, m.audienceExperience);
    score += 40 * frac;
    if (frac > 0) reasons.push(`Experience with ${Math.round(frac * 100)}% of audience considerations`);
  } else {
    score += 20;
  }
  if (m.eventsAtFacility > 0) {
    score += 20 * Math.min(m.eventsAtFacility, 3) / 3;
    reasons.push(`${m.eventsAtFacility} prior event${m.eventsAtFacility > 1 ? "s" : ""} at this facility`);
  }
  return { score: round1(clamp(score)), reasons, warnings: [] };
}

export function scoreBudget(m: EngineMusician, req: EngineRequest, t: Thresholds, relax: Relaxations): CriterionScore {
  const rate = effectiveRate(m, req.durationMinutes);
  const warnings: string[] = [];
  if (req.budgetCeiling == null) {
    return { score: 70, reasons: [`Rate ${money(rate)}; no budget ceiling set`], warnings };
  }
  const ratio = rate / req.budgetCeiling;
  const diff = req.budgetCeiling - rate;
  let score: number;
  if (ratio <= t.budgetComfortRatio) score = 100;
  else if (ratio <= 1) score = lerp(ratio, t.budgetComfortRatio, 1, 100, 70);
  else score = lerp(ratio, 1, t.budgetHardOverRatio, 70, 0);
  const reasons: string[] = [];
  if (diff >= 0) reasons.push(`Rate ${money(rate)} — ${money(diff)} under budget`);
  else {
    const pct = Math.round((ratio - 1) * 100);
    reasons.push(`Rate ${money(rate)} — ${money(-diff)} over budget`);
    warnings.push(`Rate is ${pct}% over budget`);
  }
  if (relax.ignoreBudget) {
    reasons.push("Budget ignored for this run (admin choice)");
    score = 70;
  }
  return { score: round1(clamp(score)), reasons, warnings };
}

export function scoreQuality(m: EngineMusician, t: Thresholds): CriterionScore {
  const total = m.completedEvents + m.cancellations + m.noShows;
  if (total === 0 && m.ratingCount === 0) {
    return { score: 55, reasons: ["No performance history yet"], warnings: [] };
  }
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  if (m.avgRating != null && m.ratingCount > 0) {
    score += (m.avgRating / 5) * 60;
    reasons.push(`${m.avgRating.toFixed(1)} avg rating over ${m.ratingCount} review${m.ratingCount > 1 ? "s" : ""}`);
    if (m.avgRating < t.lowRatingWarning) warnings.push(`Average rating ${m.avgRating.toFixed(1)} is below ${t.lowRatingWarning}`);
  } else {
    score += 36; // unrated: neutral
    reasons.push("No ratings yet");
  }
  if (total > 0) {
    const completion = m.completedEvents / total;
    score += completion * 30;
    reasons.push(`${m.completedEvents} completed, ${m.cancellations} cancelled, ${m.noShows} no-show`);
    if (m.noShows > 0) warnings.push(`${m.noShows} no-show${m.noShows > 1 ? "s" : ""} on record`);
  } else {
    score += 15;
  }
  if (m.avgResponseHours == null) score += 5;
  else if (m.avgResponseHours <= 24) {
    score += 10;
    reasons.push(`Responds to offers in ~${Math.round(m.avgResponseHours)}h`);
  } else if (m.avgResponseHours <= 48) score += 7;
  else {
    score += 3;
    warnings.push(`Slow to respond to offers (~${Math.round(m.avgResponseHours)}h average)`);
  }
  return { score: round1(clamp(score)), reasons, warnings };
}

export function scoreRotation(m: EngineMusician, t: Thresholds, relax: Relaxations): CriterionScore {
  const reasons: string[] = [];
  let score = 50;
  if (m.facilityPreference === "PREFERRED" && !relax.ignoreFacilityPreferences) {
    score += 40;
    reasons.push("Preferred by this facility");
  }
  const sat = Math.max(1, t.rotationSaturationCount);
  const penalty = (Math.min(m.recentBookings, sat) / sat) * 30;
  score -= penalty;
  if (m.recentBookings === 0) {
    score += 10;
    reasons.push(`No bookings in the last ${t.rotationWindowDays} days — rotation boost`);
  } else {
    reasons.push(`${m.recentBookings} booking${m.recentBookings > 1 ? "s" : ""} in the last ${t.rotationWindowDays} days`);
  }
  return { score: round1(clamp(score)), reasons, warnings: [] };
}

export function scoreAll(
  m: EngineMusician,
  req: EngineRequest,
  f: FilterResult["computed"],
  t: Thresholds,
  relax: Relaxations,
): Record<Criterion, CriterionScore> {
  const travel = f.travel as TravelEstimate;
  return {
    availability: scoreAvailability(f, t),
    service: scoreService(m, req),
    distance: scoreDistance(m, travel, t),
    audience: scoreAudience(m, req),
    budget: scoreBudget(m, req, t, relax),
    quality: scoreQuality(m, t),
    rotation: scoreRotation(m, t, relax),
  };
}

export function insuranceWarning(m: EngineMusician, eventEnd: Date, t: Thresholds): string | null {
  if (!m.insuranceExpiresAt) return null;
  const days = (m.insuranceExpiresAt.getTime() - eventEnd.getTime()) / 86_400_000;
  if (days >= 0 && days <= t.insuranceExpiryWarningDays) {
    return `Insurance expires ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} after the event`;
  }
  return null;
}
