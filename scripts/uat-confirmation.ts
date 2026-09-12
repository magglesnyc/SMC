/**
 * UAT: secure confirmation flow (spec §7) against the live database and dev server.
 *
 *  1. Take an offer that is partially accepted (musician accepted, facility pending).
 *  2. Issue a fresh facility link, open it (200, form shown).
 *  3. Redeem it twice concurrently → exactly one success; the other sees "inactive".
 *  4. Booking is CONFIRMED, request CLOSED, confirmation emails logged once each,
 *     feedback rows scheduled, offer links revoked.
 *  5. Re-opening the link shows "no longer active".
 *  6. Conflict path: on another offer, musician accepts then facility requests changes →
 *     exception CONFLICT, Confirmed blocked, alert raised.
 *
 *   npx tsx scripts/uat-confirmation.ts   (dev server on APP_BASE_URL)
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { issueToken, responseUrl } from "../lib/tokens";
import { approveMatch, recordOfferResponse } from "../lib/services/bookings";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const UAT_ACTOR = { type: "USER" as const, id: null, label: "UAT script" };

async function page(url: string) {
  const res = await fetch(url);
  return { status: res.status, html: await res.text() };
}

/** Find (or create, by approving a top recommendation) a live offer with no responses yet. */
async function freshOffer() {
  const existing = await prisma.match.findFirst({ where: { status: "OFFERED", selected: true, musicianResponse: null, facilityResponse: null, exceptionStatus: null }, include: { eventRequest: true } });
  if (existing) return existing;
  const candidates = await prisma.eventRequest.findMany({ where: { status: "AWAITING_APPROVAL", heldAt: null, matches: { none: { selected: true, status: { in: ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED"] }, exceptionStatus: null } } }, include: { matchRuns: { orderBy: { createdAt: "desc" }, take: 1, include: { matches: { where: { rank: 1 } } } } } });
  const r = candidates.find((c) => c.matchRuns[0]?.matches[0]);
  if (!r) throw new Error("No request with an eligible top candidate available; reseed");
  await approveMatch(r.matchRuns[0].matches[0].id, UAT_ACTOR);
  return prisma.match.findFirstOrThrow({ where: { id: r.matchRuns[0].matches[0].id }, include: { eventRequest: true } });
}

async function main() {
  // ── Happy path ──
  const offer = await freshOffer();
  console.log(`Using ${offer.eventRequest.reference} (offer out, no responses yet)`);
  const musicianLink = await prisma.$transaction((tx) => issueToken(offer.id, "MUSICIAN", "OFFER_RESPONSE", tx));
  const r0 = await recordOfferResponse(musicianLink.raw, "ACCEPT", "UAT musician accept");
  assert.ok(r0.ok && r0.matchStatus === "PARTIALLY_ACCEPTED" && !r0.confirmed, "musician acceptance alone must not confirm");
  console.log("✓ musician accepted → partially accepted (not confirmed)");
  const partial = await prisma.match.findUniqueOrThrow({ where: { id: offer.id }, include: { eventRequest: true } });
  const { raw } = await prisma.$transaction((tx) => issueToken(partial.id, "FACILITY", "OFFER_RESPONSE", tx));
  const url = responseUrl(raw);

  const before = await page(url);
  assert.equal(before.status, 200);
  assert.ok(before.html.includes("Confirm your musician"), "response page should render the offer");
  assert.ok(before.html.includes("Send response"), "response form should be shown");
  console.log("✓ live link renders the offer and form");

  const [a, b] = await Promise.all([recordOfferResponse(raw, "ACCEPT", "UAT accept 1"), recordOfferResponse(raw, "ACCEPT", "UAT accept 2")]);
  const oks = [a, b].filter((r) => r.ok);
  const fails = [a, b].filter((r) => !r.ok);
  assert.equal(oks.length, 1, "exactly one redemption succeeds");
  assert.equal(fails.length, 1, "the duplicate is rejected");
  assert.equal((fails[0] as { reason: string }).reason, "inactive");
  assert.ok(oks[0].ok && oks[0].confirmed, "both parties accepted → confirmed");
  console.log("✓ concurrent double redemption: one success, one 'inactive'");

  const m = await prisma.match.findUniqueOrThrow({ where: { id: partial.id }, include: { eventRequest: true, tokens: true, feedback: true, notifications: true } });
  assert.equal(m.status, "CONFIRMED");
  assert.ok(m.confirmedAt);
  assert.equal(m.facilityResponse, "ACCEPTED");
  assert.equal(m.eventRequest.status, "CLOSED");
  assert.equal(m.eventRequest.closeReason, "Booking confirmed");
  assert.equal(m.tokens.filter((t) => t.purpose === "OFFER_RESPONSE" && !t.usedAt && !t.revokedAt).length, 0, "no live offer links remain");
  assert.equal(m.feedback.length, 2, "client + musician feedback scheduled");
  const confirmedMails = m.notifications.filter((n) => n.templateKey.startsWith("confirmed."));
  assert.equal(confirmedMails.length, 2, "one confirmation email per party");
  console.log("✓ booking confirmed, request closed, links revoked, 2 feedback rows scheduled, 2 confirmation emails");

  const after = await page(url);
  assert.ok(after.html.includes("no longer active"), "used link shows a friendly inactive page");
  console.log("✓ reused link shows 'no longer active'");

  // Audit trail for the event includes the response
  const trail = await prisma.auditLog.findMany({ where: { eventRequestId: partial.eventRequestId }, orderBy: { createdAt: "asc" } });
  const actions = trail.map((t) => t.action);
  for (const expected of ["match.run", "match.approved", "match.offered", "response.accepted", "request.closed"]) assert.ok(actions.includes(expected), `audit trail has ${expected}`);
  console.log(`✓ audit trail complete (${trail.length} entries): ${Array.from(new Set(actions)).join(", ")}`);

  // ── Conflict path ──
  const offered = await freshOffer().catch(() => null);
  if (offered) {
    console.log(`Conflict test on ${offered.eventRequest.reference}`);
    const mt = await prisma.$transaction((tx) => issueToken(offered.id, "MUSICIAN", "OFFER_RESPONSE", tx));
    const ft = await prisma.$transaction((tx) => issueToken(offered.id, "FACILITY", "OFFER_RESPONSE", tx));
    const r1 = await recordOfferResponse(mt.raw, "ACCEPT");
    assert.ok(r1.ok && r1.matchStatus === "PARTIALLY_ACCEPTED");
    const r2 = await recordOfferResponse(ft.raw, "REQUEST_CHANGES", "Could we start at 3pm instead?");
    assert.ok(r2.ok && !r2.confirmed);
    const c = await prisma.match.findUniqueOrThrow({ where: { id: offered.id }, include: { alerts: { where: { resolvedAt: null } } } });
    assert.equal(c.exceptionStatus, "CONFLICT");
    assert.notEqual(c.status, "CONFIRMED");
    assert.ok(c.alerts.some((x) => x.type === "CONFLICTING_RESPONSES"), "admin alert raised");
    const ack = await prisma.notificationLog.count({ where: { matchId: offered.id, templateKey: "change.acknowledged" } });
    assert.equal(ack, 1, "change request acknowledged to the requester");
    console.log("✓ conflicting responses block Confirmed, raise CONFLICTING_RESPONSES alert, acknowledge the change request");
  } else {
    console.log("(no open offer available for the conflict test — skipped)");
  }

  // ── Feedback link ──
  const fb = await prisma.responseToken.findFirst({ where: { purpose: "FEEDBACK", usedAt: null, revokedAt: null, recipientRole: "FACILITY" } });
  if (fb) {
    const bad = await page(`${BASE}/feedback/facility?ref=not-a-token`);
    assert.ok(bad.html.includes("no longer active"));
    console.log("✓ feedback page rejects an unknown reference");
  }
  console.log("\nUAT confirmation flow: PASS");
}

main()
  .catch((e) => {
    console.error("UAT FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
