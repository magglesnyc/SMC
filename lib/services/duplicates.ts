import { prisma } from "@/lib/db";

/** Normalised Levenshtein similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  const s = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s.length && !t.length) return 1;
  if (!s.length || !t.length) return 0;
  const prev = new Array(t.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    let last = i - 1;
    prev[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (s[i - 1] === t[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return 1 - prev[t.length] / Math.max(s.length, t.length);
}

export function normalisePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
}

export interface DuplicateHit {
  id: string;
  label: string;
  reasons: string[];
  confidence: number;
}

/** Fuzzy match on name + email + phone (FR-03). */
export async function findMusicianDuplicates(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  excludeId?: string;
}): Promise<DuplicateHit[]> {
  const name = `${input.firstName} ${input.lastName}`;
  const phone = normalisePhone(input.phone);
  const emailLocal = input.email.toLowerCase();
  const candidates = await prisma.musician.findMany({
    where: input.excludeId ? { id: { not: input.excludeId } } : undefined,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  const hits: DuplicateHit[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    let confidence = 0;
    if (c.email.toLowerCase() === emailLocal) {
      reasons.push("same email");
      confidence += 0.6;
    }
    if (phone && normalisePhone(c.phone) === phone) {
      reasons.push("same phone");
      confidence += 0.5;
    }
    const nameSim = similarity(`${c.firstName} ${c.lastName}`, name);
    if (nameSim >= 0.85) {
      reasons.push(`similar name (${Math.round(nameSim * 100)}%)`);
      confidence += 0.4 * nameSim;
    }
    if (confidence >= 0.4) hits.push({ id: c.id, label: `${c.firstName} ${c.lastName} <${c.email}>`, reasons, confidence: Math.min(1, confidence) });
  }
  return hits.sort((a, b) => b.confidence - a.confidence);
}

export async function findFacilityDuplicates(input: { name: string; addressLine1: string; postalCode: string; contactEmail?: string; excludeId?: string }): Promise<DuplicateHit[]> {
  const candidates = await prisma.facility.findMany({
    where: input.excludeId ? { id: { not: input.excludeId } } : undefined,
    select: { id: true, name: true, addressLine1: true, postalCode: true, primaryContactEmail: true, city: true },
  });
  const hits: DuplicateHit[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    let confidence = 0;
    const nameSim = similarity(c.name, input.name);
    if (nameSim >= 0.8) {
      reasons.push(`similar name (${Math.round(nameSim * 100)}%)`);
      confidence += 0.5 * nameSim;
    }
    if (c.postalCode === input.postalCode && similarity(c.addressLine1, input.addressLine1) >= 0.8) {
      reasons.push("same address");
      confidence += 0.5;
    }
    if (input.contactEmail && c.primaryContactEmail.toLowerCase() === input.contactEmail.toLowerCase()) {
      reasons.push("same contact email");
      confidence += 0.4;
    }
    if (confidence >= 0.4) hits.push({ id: c.id, label: `${c.name}, ${c.city}`, reasons, confidence: Math.min(1, confidence) });
  }
  return hits.sort((a, b) => b.confidence - a.confidence);
}
