import { NextResponse } from "next/server";
import { currentUser } from "@/lib/rbac";
import { portalClientFeedbackSchema } from "@/lib/validation/schemas";
import { submitPortalFeedback } from "@/lib/services/feedback";
import { recordFailure } from "@/lib/alerts";

/** Community rates a performer from the signed-in portal. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u || u.role !== "FACILITY" || !u.facilityId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = portalClientFeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  try {
    const res = await submitPortalFeedback("CLIENT", u.facilityId, parsed.data.matchId, parsed.data);
    if (!res.ok) return NextResponse.json({ error: res.reason === "already" ? "Feedback for this event has already been submitted." : res.reason === "not_completed" ? "You can rate this performance once it has taken place." : "We could not find that booking." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await recordFailure("Portal feedback (facility) failed", e);
    return NextResponse.json({ error: "We could not save your feedback. Please try again." }, { status: 500 });
  }
}
