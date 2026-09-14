import { NextResponse } from "next/server";
import { handleMondayEvent, syncEnabled, type MondayWebhookEvent } from "@/lib/monday/webhook";

/**
 * Monday.com webhook receiver. Registered by `npm run monday:webhooks -- --url <this url>`; the shared secret
 * travels in the query string because Monday's plain webhooks carry no signature.
 *
 * Monday verifies a new webhook by POSTing { challenge } and expecting it echoed back.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.MONDAY_WEBHOOK_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { challenge?: string; event?: MondayWebhookEvent } | null;
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  if (body.challenge) return NextResponse.json({ challenge: body.challenge });
  if (!body.event) return NextResponse.json({ error: "no event" }, { status: 400 });
  if (!syncEnabled()) return NextResponse.json({ ignored: true, reason: "MONDAY_SYNC_ENABLED is not true" }, { status: 202 });

  try {
    const outcome = await handleMondayEvent(body.event);
    return NextResponse.json(outcome);
  } catch (e) {
    // Always 200-range back to Monday: a 5xx makes it retry and disable the webhook after repeated failures.
    console.error("Monday webhook failed", e);
    return NextResponse.json({ handled: false, error: e instanceof Error ? e.message : String(e) }, { status: 202 });
  }
}
