import { NextResponse } from "next/server";
import { currentUser } from "@/lib/rbac";
import { portalMusicianFeedbackSchema } from "@/lib/validation/schemas";
import { submitPortalFeedback } from "@/lib/services/feedback";
import { recordFailure } from "@/lib/alerts";

/** Musician rates a community from the signed-in portal. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u || u.role !== "MUSICIAN" || !u.musicianId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = portalMusicianFeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  try {
    const res = await submitPortalFeedback("MUSICIAN", u.musicianId, parsed.data.matchId, parsed.data);
    if (!res.ok) return NextResponse.json({ error: res.reason === "already" ? "Feedback for this event has already been submitted." : res.reason === "not_completed" ? "You can rate this venue once the performance has taken place." : "We could not find that booking." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await recordFailure("Portal feedback (musician) failed", e);
    return NextResponse.json({ error: "We could not save your feedback. Please try again." }, { status: 500 });
  }
}
