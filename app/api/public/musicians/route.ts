import { NextResponse } from "next/server";
import { musicianApplicationSchema } from "@/lib/validation/schemas";
import { createMusicianFromApplication } from "@/lib/services/musicians";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordFailure } from "@/lib/alerts";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`apply:${ip}`, 5, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = musicianApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  try {
    const { musician, replay } = await createMusicianFromApplication(parsed.data);
    return NextResponse.json({ ok: true, id: musician.id, replay });
  } catch (e) {
    await recordFailure("Musician application failed", e);
    return NextResponse.json({ error: "We could not save your application. Please try again." }, { status: 500 });
  }
}
