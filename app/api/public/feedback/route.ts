import { NextResponse } from "next/server";
import { clientFeedbackSchema, musicianFeedbackSchema } from "@/lib/validation/schemas";
import { submitFeedback } from "@/lib/services/feedback";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordFailure } from "@/lib/alerts";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`feedback:${ip}`, 20, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }
  let body: { kind?: string } & Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body.kind === "MUSICIAN" ? "MUSICIAN" : "CLIENT";
  const parsed = (kind === "CLIENT" ? clientFeedbackSchema : musicianFeedbackSchema).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  try {
    const res = await submitFeedback(kind, parsed.data);
    if (!res.ok) return NextResponse.json({ error: "This feedback link is no longer active." }, { status: 410 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await recordFailure("Feedback submission failed", e);
    return NextResponse.json({ error: "We could not save your feedback. Please try again." }, { status: 500 });
  }
}
