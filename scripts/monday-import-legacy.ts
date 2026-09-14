import "dotenv/config";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "../lib/db";
import { audit } from "../lib/audit";
import { MONDAY_ACTOR } from "../lib/monday/actor";
import { LEGACY_BOARDS } from "../lib/monday/boards";
import { firstEmail, parseTimeRange } from "../lib/monday/parse";
import { similarity } from "../lib/services/duplicates";
import { nextEventReference } from "../lib/services/references";
import { recomputeMusicianStats } from "../lib/services/musicians";
import { DEFAULT_TZ } from "../lib/utils";

/**
 * Import the retired workspace's history from a `monday:export-legacy` export into the app.
 *
 *   npm run monday:import-legacy -- --dry-run
 *   npm run monday:import-legacy                       (uses the newest folder under exports/monday-legacy)
 *   npm run monday:import-legacy -- --dir=exports/monday-legacy/2026-09-14
 *
 * Rules (agreed with the client): old Gig Tracker rows become completed history linked to the current musician
 * (by entertainer email, then name) and facility (by contact email, then name); rows already carried over to the
 * new Gig Tracker are skipped; old applications and agreements become notes on the matching record; anything
 * that cannot be matched confidently is listed in import-report.md for a person to resolve, never guessed.
 * Idempotent: every imported row gets a MondayLink against the legacy board id.
 */
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const DRY = flag("dry-run");

interface ExportItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  group: { id: string; title: string };
  column_values: { id: string; type: string; text: string | null; display_value?: string | null }[];
  updates: { text_body: string; created_at: string; creator: { name: string } | null }[];
}
interface ExportFile { board: { id: string; name: string }; items: ExportItem[] }

const col = (i: ExportItem, id: string) => (i.column_values.find((c) => c.id === id)?.display_value ?? i.column_values.find((c) => c.id === id)?.text ?? "").trim();
const updatesText = (i: ExportItem) => i.updates.map((u) => `[${u.created_at.slice(0, 10)} ${u.creator?.name ?? "?"}] ${u.text_body.trim()}`).join("\n");

const report = { gigs: { seen: 0, skippedMoved: 0, created: 0, existing: 0, noDate: 0, noFacility: [] as string[], noMusician: [] as string[] }, applications: { seen: 0, noted: 0, already: 0, unmatched: [] as string[] }, agreements: { seen: 0, noted: 0, already: 0, unmatched: [] as string[] } };

function loadBoard(dir: string, boardId: string): ExportFile | null {
  const f = readdirSync(dir).find((n) => n.endsWith(`-${boardId}.json`));
  return f ? (JSON.parse(readFileSync(join(dir, f), "utf8")) as ExportFile) : null;
}

// ───────────────────────── Matching helpers ─────────────────────────

type MusicianRow = { id: string; firstName: string; lastName: string; stageName: string | null; email: string };
type FacilityRow = { id: string; name: string; primaryContactEmail: string };
let musicians: MusicianRow[] = [];
let facilities: FacilityRow[] = [];

/** Placeholder addresses staff typed when they had no real one; never match on these. */
const PLACEHOLDER_DOMAINS = new Set(["krissy.com", "ccc.com"]);
const GENERIC_DOMAINS = new Set(["gmail.com", "yahoo.com", "aol.com", "hotmail.com", "outlook.com", "icloud.com", "msn.com", "att.net", "sbcglobal.net", "proton.me", "mail.com", "rocketmail.com", "gmaill.com"]);
const domainOf = (email: string) => email.split("@")[1] ?? "";
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !["of", "at", "the", "and", "senior", "living"].includes(w));
const acronym = (s: string) => words(s).map((w) => w[0]).join("");
const onlyOne = <T,>(xs: T[]): T | null => (xs.length === 1 ? xs[0] : null);

/** "Providence Road - jerryasbury@rocketmail.com" → musician by email, else by name / stage name / acronym ("CCC"). */
function findMusician(text: string): MusicianRow | null {
  const email = firstEmail(text);
  if (email && !PLACEHOLDER_DOMAINS.has(domainOf(email))) {
    const hit = musicians.find((m) => m.email.toLowerCase() === email);
    if (hit) return hit;
  }
  const name = text.split(/\s+-\s+/)[0].trim();
  if (!name) return null;
  let best: { m: MusicianRow; s: number } | null = null;
  for (const m of musicians) {
    const s = Math.max(similarity(`${m.firstName} ${m.lastName}`, name), m.stageName ? similarity(m.stageName, name) : 0);
    if (!best || s > best.s) best = { m, s };
  }
  if (best && best.s >= 0.85) return best.m;
  if (/^[A-Z]{2,5}$/.test(name)) return onlyOne(musicians.filter((m) => [m.stageName ?? "", `${m.firstName} ${m.lastName}`].some((n) => acronym(n) === name.toLowerCase())));
  return null;
}

function findFacility(name: string, contactText: string): FacilityRow | null {
  const email = firstEmail(contactText);
  if (email && !PLACEHOLDER_DOMAINS.has(domainOf(email))) {
    const hit = facilities.find((f) => f.primaryContactEmail.toLowerCase() === email);
    if (hit) return hit;
  }
  const clean = name.replace(/-?\s*cancell?ed\b.*$/i, "").trim();
  let best: { f: FacilityRow; s: number } | null = null;
  for (const f of facilities) {
    const s = similarity(f.name, clean);
    if (!best || s > best.s) best = { f, s };
  }
  if (best && best.s >= 0.8) return best.f;
  // A short name whose words all appear in exactly one facility name ("Hidden Springs", "Trustwell Urbana Place").
  const ws = words(clean);
  if (ws.length) {
    const contained = onlyOne(facilities.filter((f) => { const fw = words(f.name); return ws.every((w) => fw.includes(w)); }));
    if (contained) return contained;
  }
  // An organisation email domain that belongs to exactly one facility.
  if (email) {
    const d = domainOf(email);
    if (d && !GENERIC_DOMAINS.has(d) && !PLACEHOLDER_DOMAINS.has(d)) {
      const byDomain = onlyOne(facilities.filter((f) => domainOf(f.primaryContactEmail.toLowerCase()) === d));
      if (byDomain) return byDomain;
    }
  }
  return null;
}

// ───────────────────────── Gig Tracker (old) → EventRequest + Match ─────────────────────────

async function importGigs(file: ExportFile) {
  const boardId = file.board.id;
  const touched = new Set<string>();
  for (const it of file.items) {
    report.gigs.seen++;
    if (/moved to revised/i.test(it.group.title)) {
      report.gigs.skippedMoved++;
      continue;
    }
    const existing = await prisma.mondayLink.findFirst({ where: { boardId, itemId: it.id } });
    if (existing) {
      report.gigs.existing++;
      continue;
    }
    const date = col(it, "date_1").match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!date) {
      report.gigs.noDate++;
      continue;
    }
    const facility = findFacility(it.name, col(it, "email"));
    if (!facility) {
      report.gigs.noFacility.push(`${it.name} (${date}) — requestor: ${col(it, "email") || "none"}`);
      continue;
    }
    const musician = col(it, "email_1") ? findMusician(col(it, "email_1")) : null;
    if (col(it, "email_1") && !musician) report.gigs.noMusician.push(`${it.name} (${date}) — entertainer: ${col(it, "email_1")}`);

    const start = parseTimeRange(col(it, "hour")) ;
    const end = parseTimeRange(col(it, "hour9"));
    const startTime = start?.start ?? "14:00";
    const startAt = fromZonedTime(`${date}T${startTime}:00`, DEFAULT_TZ);
    let duration = 60;
    if (start && end) {
      const [sh, sm] = start.start.split(":").map(Number);
      const [eh, em] = end.start.split(":").map(Number);
      const d = eh * 60 + em - (sh * 60 + sm);
      if (d > 0 && d <= 8 * 60) duration = d;
    }
    // Already represented (carried into the new tracker and imported from there)?
    const dup = await prisma.eventRequest.findFirst({
      where: { facilityId: facility.id, startAt: { gte: new Date(startAt.getTime() - 12 * 3_600_000), lte: new Date(startAt.getTime() + 12 * 3_600_000) }, ...(musician ? { matches: { some: { selected: true, musicianId: musician.id } } } : {}) },
      select: { id: true },
    });
    if (dup) {
      report.gigs.existing++;
      if (!DRY) await prisma.mondayLink.create({ data: { boardId, itemId: it.id, entityType: "EventRequest", entityId: dup.id, pulledAt: new Date() } });
      continue;
    }

    const agreements = [
      ["Client agreement sent", col(it, "status0")], ["Client agreement received", col(it, "status06")],
      ["Musician agreement sent", col(it, "status9")], ["Musician agreement received", col(it, "status8")],
    ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
    const notes = [col(it, "text9") && `Event type/theme: ${col(it, "text9")}`, agreements, updatesText(it)].filter(Boolean).join("\n\n") || null;
    const fee = Number(col(it, "numbers4")) || null;
    const charged = Number(col(it, "numbers1")) || null;

    if (DRY) {
      report.gigs.created++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const reference = await nextEventReference(tx);
      const e = await tx.eventRequest.create({
        data: {
          reference, facilityId: facility.id, startAt, durationMinutes: duration, timezone: DEFAULT_TZ, serviceType: "LIVE_ENTERTAINMENT", programTags: [],
          hardRequirements: {}, notes, source: "LEGACY", timeText: [col(it, "hour"), col(it, "hour9")].filter(Boolean).join(" - ") || null,
          entertainerFee: fee, amountCharged: charged, facilityBilled: col(it, "status7") || null, entertainerPaid: col(it, "status5") || null,
          agreementStatus: agreements || null, status: "CLOSED", closeReason: "Imported from the retired Monday Gig Tracker", closedAt: startAt, submittedAt: new Date(it.created_at),
        },
      });
      if (musician) {
        const run = await tx.matchRun.create({ data: { eventRequestId: e.id, weightsSnapshot: { source: "LEGACY" }, thresholdsSnapshot: {}, totalMusicians: 1, eligibleCount: 1, exclusionSummary: {}, durationMs: 0 } });
        const past = startAt < new Date();
        await tx.match.create({ data: { matchRunId: run.id, eventRequestId: e.id, facilityId: facility.id, musicianId: musician.id, eligible: true, rank: 1, selected: true, isOverride: true, overrideReason: "Booked in the retired Monday Gig Tracker", status: past ? "COMPLETED" : "CONFIRMED", musicianResponse: "ACCEPTED", facilityResponse: "ACCEPTED", confirmedAt: new Date(it.created_at), completedAt: past ? new Date(startAt.getTime() + duration * 60_000) : null } });
        touched.add(musician.id);
      }
      await tx.mondayLink.create({ data: { boardId, itemId: it.id, entityType: "EventRequest", entityId: e.id, pulledAt: new Date() } });
      await tx.mondaySyncLog.create({ data: { direction: "PULL", boardId, itemId: it.id, entityType: "EventRequest", entityId: e.id, action: "created", detail: { legacy: true } } });
      await audit(MONDAY_ACTOR, { action: "monday.legacy_imported", entityType: "EventRequest", entityId: e.id, eventRequestId: e.id, after: { itemId: it.id, musicianId: musician?.id ?? null } }, tx);
    });
    report.gigs.created++;
  }
  for (const id of touched) await recomputeMusicianStats(id);
}

// ───────────────────────── Applications / agreements → notes ─────────────────────────

async function appendNote(kind: "Musician" | "EventRequest", id: string, marker: string, note: string) {
  if (DRY) return;
  if (kind === "Musician") {
    const m = await prisma.musician.findUniqueOrThrow({ where: { id }, select: { privateNotes: true } });
    if (m.privateNotes?.includes(marker)) return;
    await prisma.musician.update({ where: { id }, data: { privateNotes: [m.privateNotes, `${marker}\n${note}`].filter(Boolean).join("\n\n") } });
  } else {
    const e = await prisma.eventRequest.findUniqueOrThrow({ where: { id }, select: { notes: true } });
    if (e.notes?.includes(marker)) return;
    await prisma.eventRequest.update({ where: { id }, data: { notes: [e.notes, `${marker}\n${note}`].filter(Boolean).join("\n\n") } });
  }
}

async function importApplications(file: ExportFile) {
  for (const it of file.items) {
    report.applications.seen++;
    const who = `${col(it, "short_text")} ${col(it, "email")}`.trim();
    const m = findMusician(`${col(it, "short_text4") || col(it, "short_text")} - ${col(it, "email")}`) ?? findMusician(`${col(it, "short_text")} - ${col(it, "email")}`);
    if (!m) {
      report.applications.unmatched.push(`${who || it.name} (${col(it, "date__1") || it.created_at.slice(0, 10)}) — approved: ${col(it, "approved_mkm5ax16") || "?"}`);
      continue;
    }
    const marker = `[legacy application ${it.id}]`;
    const existing = await prisma.musician.findUnique({ where: { id: m.id }, select: { privateNotes: true } });
    if (existing?.privateNotes?.includes(marker)) {
      report.applications.already++;
      continue;
    }
    const lines = [
      `Legacy application ${col(it, "date__1") || it.created_at.slice(0, 10)}; approved: ${col(it, "approved_mkm5ax16") || "?"}`,
      col(it, "contacted_by_krissy__mkm557b3") && `Contacted: ${col(it, "contacted_by_krissy__mkm557b3")}`,
      col(it, "short_text70") && `Travel: ${col(it, "short_text70")}`,
      col(it, "short_text6") && `Expected pay: ${col(it, "short_text6")}`,
      col(it, "long_text") && `Genre: ${col(it, "long_text")}`,
      col(it, "long_text6") && `Experience: ${col(it, "long_text6")}`,
      updatesText(it),
    ].filter(Boolean).join("\n");
    await appendNote("Musician", m.id, marker, lines);
    report.applications.noted++;
  }
}

async function importAgreements(file: ExportFile, kind: "client" | "musician") {
  for (const it of file.items) {
    report.agreements.seen++;
    const date = col(it, "date").match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const label = kind === "client" ? `${col(it, "short_text")} / ${col(it, "short_text9")}` : `${col(it, "short_text")} @ ${col(it, "short_text1")}`;
    if (!date) {
      report.agreements.unmatched.push(`${label} — no date`);
      continue;
    }
    const musician = kind === "client" ? findMusician(col(it, "short_text9")) : findMusician(`${col(it, "short_text")} - ${col(it, "email")}`);
    const facility = kind === "client" ? findFacility(col(it, "short_text"), col(it, "email")) : findFacility(col(it, "short_text1"), "");
    const day = fromZonedTime(`${date}T00:00:00`, DEFAULT_TZ);
    const ev = await prisma.eventRequest.findFirst({
      where: {
        startAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) },
        ...(facility ? { facilityId: facility.id } : {}),
        ...(musician ? { matches: { some: { selected: true, musicianId: musician.id } } } : {}),
      },
      select: { id: true },
    });
    if (!ev || (!facility && !musician)) {
      report.agreements.unmatched.push(`${label} (${date})`);
      continue;
    }
    const marker = `[legacy ${kind} agreement ${it.id}]`;
    const existing = await prisma.eventRequest.findUnique({ where: { id: ev.id }, select: { notes: true } });
    if (existing?.notes?.includes(marker)) {
      report.agreements.already++;
      continue;
    }
    const lines = [
      `${kind === "client" ? "Client" : "Musician"} service agreement signed ${it.created_at.slice(0, 10)}${col(it, "signature") ? " (signature on file in Monday export)" : ""}`,
      col(it, kind === "client" ? "long_text3" : "long_text") && `Service: ${col(it, kind === "client" ? "long_text3" : "long_text")}`,
      col(it, kind === "client" ? "long_text4" : "long_text2") && `Instructions: ${col(it, kind === "client" ? "long_text4" : "long_text2")}`,
      col(it, "number") && `${kind === "client" ? "Total cost" : "Compensation"}: $${col(it, "number")}`,
    ].filter(Boolean).join("\n");
    await appendNote("EventRequest", ev.id, marker, lines);
    report.agreements.noted++;
  }
}

// ───────────────────────── Main ─────────────────────────

async function main() {
  const root = join(process.cwd(), "exports", "monday-legacy");
  const dir = opt("dir") ? join(process.cwd(), opt("dir")!) : join(root, readdirSync(root).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().at(-1) ?? "");
  if (!existsSync(dir)) throw new Error(`No export found under ${root}; run npm run monday:export-legacy first`);
  console.log(`${DRY ? "DRY RUN — " : ""}importing from ${dir}`);

  musicians = await prisma.musician.findMany({ select: { id: true, firstName: true, lastName: true, stageName: true, email: true } });
  facilities = await prisma.facility.findMany({ select: { id: true, name: true, primaryContactEmail: true } });

  const gigs = loadBoard(dir, LEGACY_BOARDS.gigs);
  if (gigs) await importGigs(gigs);
  const apps = loadBoard(dir, LEGACY_BOARDS.applications);
  if (apps) await importApplications(apps);
  const clientAgr = loadBoard(dir, LEGACY_BOARDS.clientAgreements);
  if (clientAgr) await importAgreements(clientAgr, "client");
  const musAgr = loadBoard(dir, LEGACY_BOARDS.musicianAgreements);
  if (musAgr) await importAgreements(musAgr, "musician");

  const g = report.gigs, a = report.applications, s = report.agreements;
  const md = [
    `# Legacy import report — ${new Date().toISOString().slice(0, 16)}${DRY ? " (dry run)" : ""}`,
    "",
    `## Gig Tracker (old): ${g.seen} rows`,
    `- ${g.skippedMoved} already carried to the new Gig Tracker (skipped)`,
    `- ${g.created} imported as completed history`,
    `- ${g.existing} already in the app (matched an existing event or previously imported)`,
    `- ${g.noDate} with no date (skipped)`,
    `- ${g.noFacility.length} with no matching facility (skipped, listed below)`,
    `- ${g.noMusician.length} imported without an entertainer link (listed below)`,
    "",
    `## Musician Applications (old): ${a.seen} rows`,
    `- ${a.noted} added as notes on the matching musician, ${a.already} already noted, ${a.unmatched.length} unmatched (listed below)`,
    "",
    `## Service Agreements (old): ${s.seen} rows`,
    `- ${s.noted} added as notes on the matching event, ${s.already} already noted, ${s.unmatched.length} unmatched (listed below)`,
    "",
    "## Needs a person",
    "",
    "### Gigs with no matching facility",
    ...(g.noFacility.length ? g.noFacility.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Gigs whose entertainer could not be matched",
    ...(g.noMusician.length ? g.noMusician.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Applications with no matching musician (not imported)",
    ...(a.unmatched.length ? a.unmatched.map((x) => `- ${x}`) : ["- none"]),
    "",
    "### Agreements with no matching event",
    ...(s.unmatched.length ? s.unmatched.map((x) => `- ${x}`) : ["- none"]),
    "",
  ].join("\n");
  writeFileSync(join(dir, DRY ? "import-report.dry-run.md" : "import-report.md"), md);
  console.log(md.split("\n## Needs a person")[0]);
  console.log(`Full report: ${join(dir, DRY ? "import-report.dry-run.md" : "import-report.md")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
