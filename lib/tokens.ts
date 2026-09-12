import { createHash, randomBytes } from "node:crypto";
import { prisma, type Tx } from "@/lib/db";
import type { RecipientRole, TokenPurpose } from "@/generated/prisma/enums";

/**
 * Secure response links use database-stored random tokens (not JWTs) so they can be
 * revoked. Only a SHA-256 hash is stored; the raw token lives solely in the emailed URL.
 */

const OFFER_TTL_HOURS = Number(process.env.OFFER_LINK_TTL_HOURS ?? 72);
const FEEDBACK_TTL_DAYS = Number(process.env.FEEDBACK_LINK_TTL_DAYS ?? 30);

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface IssuedToken {
  raw: string;
  id: string;
  expiresAt: Date;
}

/**
 * Issue a single-purpose token for one recipient on one match. Any previously active
 * token for the same (match, role, purpose) is revoked first, so exactly one link is live.
 */
export async function issueToken(
  matchId: string,
  recipientRole: RecipientRole,
  purpose: TokenPurpose,
  tx?: Tx,
): Promise<IssuedToken> {
  const db = tx ?? prisma;
  const now = new Date();
  await db.responseToken.updateMany({
    where: { matchId, recipientRole, purpose, usedAt: null, revokedAt: null },
    data: { revokedAt: now, revokedReason: "Superseded by a new link" },
  });
  const raw = generateRawToken();
  const ttlMs = purpose === "OFFER_RESPONSE" ? OFFER_TTL_HOURS * 3_600_000 : FEEDBACK_TTL_DAYS * 86_400_000;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const row = await db.responseToken.create({
    data: { tokenHash: hashToken(raw), matchId, recipientRole, purpose, expiresAt },
  });
  return { raw, id: row.id, expiresAt };
}

export type TokenState = "active" | "used" | "expired" | "revoked" | "unknown";

export async function peekToken(raw: string) {
  const row = await prisma.responseToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: {
      match: {
        include: {
          eventRequest: { include: { facility: true } },
          facility: true,
          musician: true,
        },
      },
    },
  });
  if (!row) return { state: "unknown" as TokenState, token: null };
  let state: TokenState = "active";
  if (row.usedAt) state = "used";
  else if (row.revokedAt) state = "revoked";
  else if (row.expiresAt < new Date()) state = "expired";
  return { state, token: row };
}

/**
 * Atomically consume a token: a single conditional UPDATE marks it used only if it is
 * still active. Concurrent or repeated redemptions see 0 rows affected and are rejected,
 * which is what makes double-clicks and duplicate webhooks idempotent.
 */
export async function consumeToken(raw: string, purpose: TokenPurpose, tx?: Tx) {
  const db = tx ?? prisma;
  const tokenHash = hashToken(raw);
  const now = new Date();
  const res = await db.responseToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (res.count !== 1) return null;
  return db.responseToken.findUnique({ where: { tokenHash } });
}

export async function revokeTokensForMatch(matchId: string, reason: string, purpose?: TokenPurpose, tx?: Tx) {
  const db = tx ?? prisma;
  return db.responseToken.updateMany({
    where: { matchId, usedAt: null, revokedAt: null, ...(purpose ? { purpose } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export function responseUrl(raw: string): string {
  return `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/respond/${raw}`;
}

export function feedbackUrl(kind: "facility" | "musician", raw: string): string {
  return `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/feedback/${kind}?ref=${raw}`;
}
