import { NextResponse } from "next/server";
import { eventRequestSchema } from "@/lib/validation/schemas";
import { createEventRequestFromForm } from "@/lib/services/eventRequests";
import { runMatchingForRequest } from "@/lib/services/matching";
import { emit } from "@/lib/inngest/client";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordFailure } from "@/lib/alerts";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`request:${ip}`, 10, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = eventRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  try {
    const { request, replay } = await createEventRequestFromForm(parsed.data);
    // Stage 4 → 5: a ready request triggers the matching engine (Inngest, or inline if unavailable).
    if (!replay && request.status === "READY_TO_MATCH") {
      emit("smc/request.ready", { eventRequestId: request.id }, () => runMatchingForRequest(request.id)).catch((e) => recordFailure(`Trigger matching for ${request.reference}`, e, { eventRequestId: request.id }));
    }
    return NextResponse.json({ ok: true, id: request.id, reference: request.reference, status: request.status, missingFields: request.missingFields, replay });
  } catch (e) {
    await recordFailure("Event request submission failed", e);
    return NextResponse.json({ error: "We could not save your request. Please try again." }, { status: 500 });
  }
}
