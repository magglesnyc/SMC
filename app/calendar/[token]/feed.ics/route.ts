import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadCalendarEvents, resolveCalendarToken, toIcs } from "@/lib/calendar";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** iCalendar subscription feed for a personal calendar link (Google / Apple / Outlook). */
export async function GET(req: Request, ctx: RouteContext<"/calendar/[token]/feed.ics">) {
  if (!rateLimit(`ics:${clientIp(req.headers)}`, 60, 10 * 60_000).ok) return new NextResponse("Too many requests", { status: 429 });
  const { token } = await ctx.params;
  const row = await resolveCalendarToken(token);
  if (!row) return new NextResponse("This calendar link is no longer active.", { status: 404 });
  const from = new Date(Date.now() - 180 * 86_400_000);
  const events = await loadCalendarEvents(row.ownerType === "MUSICIAN" ? { musicianId: row.ownerId, from } : { facilityId: row.ownerId, from });
  const name =
    row.ownerType === "MUSICIAN"
      ? await prisma.musician.findUnique({ where: { id: row.ownerId }, select: { firstName: true, lastName: true, stageName: true } }).then((m) => (m ? `SMC — ${m.stageName ?? `${m.firstName} ${m.lastName}`}` : "SMC performances"))
      : await prisma.facility.findUnique({ where: { id: row.ownerId }, select: { name: true } }).then((f) => (f ? `SMC — ${f.name}` : "SMC performers"));
  return new NextResponse(toIcs(events, name, row.ownerType), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="senior-music-connection.ics"', "cache-control": "private, max-age=900" },
  });
}
