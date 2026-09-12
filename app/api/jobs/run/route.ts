import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/services/jobs";
import { auth } from "@/auth";

/**
 * Manual / external-cron trigger for the scheduled jobs. Accepts either a signed-in staff
 * session or the JOBS_SECRET bearer token (for Vercel Cron or similar).
 */
export async function POST(req: Request) {
  const session = await auth();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = process.env.JOBS_SECRET;
  if (!session?.user && !(secret && bearer === secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runDueJobs();
  return NextResponse.json(report);
}
