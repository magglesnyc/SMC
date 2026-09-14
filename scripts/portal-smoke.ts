/**
 * HTTP smoke test for the community and musician portals against a running dev server.
 *   npx tsx scripts/portal-smoke.ts            (read-only page checks + role guards)
 *   npx tsx scripts/portal-smoke.ts --write    (also submits one rating from each portal)
 */
import "dotenv/config";
import { prisma } from "../lib/db";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const WRITE = process.argv.includes("--write");
let failures = 0;
const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

class Session {
  private jar = new Map<string, string>();
  private absorb(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  private cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: this.cookie() }, redirect: "manual" });
    this.absorb(res);
    return { status: res.status, location: res.headers.get("location"), text: await res.text() };
  }
  async postJson(path: string, body: unknown) {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { cookie: this.cookie(), "content-type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });
    this.absorb(res);
    return { status: res.status, json: (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean } };
  }
  async login(email: string, password: string) {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    this.absorb(csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { cookie: this.cookie(), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, email, password, redirectTo: "/go" }),
      redirect: "manual",
    });
    this.absorb(res);
    return res.status;
  }
}

async function main() {
  const facilityUser = await prisma.user.findUniqueOrThrow({ where: { email: "director@community.test" } });
  const musicianUser = await prisma.user.findUniqueOrThrow({ where: { email: "performer@community.test" } });

  // Unauthenticated → login
  const anon = new Session();
  const r0 = await anon.get("/portal/facility");
  ok(r0.status === 307 || r0.status === 302, `anonymous /portal/facility redirects (${r0.status} → ${r0.location})`);

  // Community portal
  const f = new Session();
  ok((await f.login("director@community.test", "demo-community")) < 400, "facility login");
  const go = await f.get("/go");
  ok(go.location?.endsWith("/portal/facility"), `/go routes facility user to portal (${go.location})`);
  const home = await f.get("/portal/facility");
  ok(home.status === 200 && home.text.includes("Community portal"), "facility home renders");
  ok(home.text.includes("Please confirm") || home.text.includes("Performers you have booked"), "facility home shows bookings");
  ok(home.text.includes("How did it go?"), "facility home shows a performance to rate");
  ok((await f.get("/portal/facility/calendar")).text.includes("Add to Google"), "facility calendar renders");
  const perf = await f.get("/portal/facility/performers");
  ok(perf.status === 200 && perf.text.includes("Performers you could book"), "facility performers list renders");
  const firstId = perf.text.match(/\/portal\/facility\/performers\/([a-z0-9]+)/)?.[1];
  ok(firstId, "performers list links to a profile");
  if (firstId) {
    const prof = await f.get(`/portal/facility/performers/${firstId}`);
    ok(prof.status === 200 && prof.text.includes("What other communities say"), "facility performer profile renders");
  }
  const guard1 = await f.get("/portal/musician");
  ok(guard1.status !== 200 && guard1.location?.endsWith("/portal/facility"), `facility user blocked from musician portal (${guard1.status} → ${guard1.location})`);
  const guard2 = await f.get("/admin");
  ok(guard2.status !== 200, `facility user blocked from console (${guard2.status} → ${guard2.location})`);

  // Musician portal
  const m = new Session();
  ok((await m.login("performer@community.test", "demo-musician")) < 400, "musician login");
  const mh = await m.get("/portal/musician");
  ok(mh.status === 200 && mh.text.includes("Musician portal"), "musician home renders");
  ok(mh.text.includes("Offers waiting for you"), "musician home shows an open offer");
  ok(mh.text.includes("How was the venue?"), "musician home shows a venue to rate");
  ok((await m.get("/portal/musician/calendar")).text.includes("Every community you are booked at"), "musician calendar renders");
  ok((await m.get("/portal/musician/venues")).text.includes("Where you play"), "musician venues renders");
  ok((await m.get("/portal/musician/reviews")).text.includes("Your ratings"), "musician reviews renders");
  ok((await m.get("/portal/musician/profile")).text.includes("Weekly availability"), "musician profile renders");
  const guard3 = await m.get("/portal/facility");
  ok(guard3.status !== 200 && guard3.location?.endsWith("/portal/musician"), `musician blocked from facility portal (${guard3.status})`);
  const guard4 = await m.postJson("/api/portal/facility/feedback", {});
  ok(guard4.status === 403 || guard4.status === 401, `musician blocked from facility feedback API (${guard4.status})`);

  if (WRITE) {
    const fMatch = await prisma.match.findFirst({ where: { facilityId: facilityUser.facilityId!, selected: true, status: "COMPLETED", feedback: { some: { kind: "CLIENT", submittedAt: null } } } });
    const mMatch = await prisma.match.findFirst({ where: { musicianId: musicianUser.musicianId!, selected: true, status: "COMPLETED", feedback: { some: { kind: "MUSICIAN", submittedAt: null } } } });
    if (fMatch) {
      const page = await f.get(`/portal/facility/feedback/${fMatch.id}`);
      ok(page.status === 200 && page.text.includes("How was the performance?"), "facility feedback page renders");
      const res = await f.postJson("/api/portal/facility/feedback", { kind: "CLIENT", matchId: fMatch.id, rating: 5, secondaryRatings: { engagement: 5 }, comments: "Portal smoke test: residents sang along.", issues: [], wouldBookAgain: true, followUpRequested: false });
      ok(res.status === 200 && res.json.ok, `facility rating submitted via portal (${res.status} ${res.json.error ?? ""})`);
      const row = await prisma.feedback.findUnique({ where: { matchId_kind: { matchId: fMatch.id, kind: "CLIENT" } } });
      ok(row?.rating === 5 && row.status === "SUBMITTED", "facility rating stored");
      const again = await f.postJson("/api/portal/facility/feedback", { kind: "CLIENT", matchId: fMatch.id, rating: 1, secondaryRatings: {}, comments: "", issues: [], wouldBookAgain: false, followUpRequested: false });
      ok(again.status === 409, `second rating of the same event rejected (${again.status})`);
      const other = await prisma.match.findFirstOrThrow({ where: { musicianId: { not: musicianUser.musicianId! }, selected: true, status: "COMPLETED" } });
      const wrong = await m.postJson("/api/portal/musician/feedback", { kind: "MUSICIAN", matchId: other.id, rating: 3, secondaryRatings: {}, comments: "", issues: [], wouldReturn: true, followUpRequested: false });
      ok(wrong.status === 409, `musician cannot rate a booking that is not theirs (${wrong.status})`);
    } else ok(false, "no unrated completed booking for the facility persona");
    if (mMatch) {
      const res = await m.postJson("/api/portal/musician/feedback", { kind: "MUSICIAN", matchId: mMatch.id, rating: 2, secondaryRatings: { venueSetup: 2 }, comments: "Portal smoke test: parking was hard to find.", issues: ["access-parking"], wouldReturn: true, followUpRequested: false });
      ok(res.status === 200 && res.json.ok, `musician venue rating submitted via portal (${res.status} ${res.json.error ?? ""})`);
      const row = await prisma.feedback.findUnique({ where: { matchId_kind: { matchId: mMatch.id, kind: "MUSICIAN" } } });
      ok(row?.rating === 2 && row.status === "FOLLOW_UP_REQUIRED", "low venue rating flagged for follow-up");
      const alert = await prisma.alert.findFirst({ where: { matchId: mMatch.id, type: "LOW_RATING", resolvedAt: null } });
      ok(alert, "low venue rating raised a staff alert");
    } else ok(false, "no unrated completed booking for the musician persona");
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll portal checks passed");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
