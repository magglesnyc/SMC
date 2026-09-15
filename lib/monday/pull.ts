/**
 * Monday → app. Reads the live boards and mirrors them into Musician / Facility / EventRequest / Match /
 * Feedback. Idempotent: every Monday item is linked to its app record through MondayLink, and an item whose
 * updated_at has not moved since the last pull is skipped.
 *
 * Records created here carry source = "MONDAY" and never trigger the app's own emails: during the transition
 * staff send agreements, reminders and feedback forms from Monday (see docs/MONDAY.md).
 */
import { fromZonedTime } from "date-fns-tz";
import { prisma, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { MONDAY_ACTOR } from "./actor";
import { markInSync } from "./push";
import { getGeoProvider, formatAddress } from "@/lib/geo";
import { DEFAULT_TZ } from "@/lib/utils";
import { findFacilityDuplicates, findMusicianDuplicates } from "@/lib/services/duplicates";
import { nextEventReference } from "@/lib/services/references";
import { recomputeMusicianStats } from "@/lib/services/musicians";
import { APPLICATION, BOARDS, CLIENT, ENTERTAINER, ENTERTAINER_FEEDBACK, FACILITY_FEEDBACK, GIG, REQUEST, type BoardKey } from "./boards";
import { colDate, colFiles, colLinkedIds, colList, colNumber, colText, fetchBoardItems, fetchItems, type MondayItem } from "./client";
import {
  extractGenres, firstEmail, mapApplicationStatus, mapAudienceTag, mapClientStatus, mapEntertainerStatus, mapFacilityType, mapParticipation,
  mapPreferredContact, mapServiceType, normalisePhoneText, normaliseState, parseAttendance, parseMoney, parseTimeRange, parseTravelMiles,
  splitInstruments, splitLabels, splitName,
} from "./parse";

export { MONDAY_ACTOR };

export interface BoardReport {
  seen: number;
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  errors: string[];
}
export interface PullReport {
  ranAt: string;
  dryRun: boolean;
  boards: Partial<Record<BoardKey, BoardReport>>;
}
export interface PullOptions {
  dryRun?: boolean;
  boards?: BoardKey[];
  /** Skip items whose updated_at has not changed since the last pull (default true). */
  incremental?: boolean;
  log?: (line: string) => void;
}

const PULL_ORDER: BoardKey[] = ["entertainers", "clients", "gigs", "bookingRequests", "facilityFeedback", "entertainerFeedback", "applications"];

export async function pullFromMonday(opts: PullOptions = {}): Promise<PullReport> {
  const report: PullReport = { ranAt: new Date().toISOString(), dryRun: Boolean(opts.dryRun), boards: {} };
  const log = opts.log ?? (() => {});
  const wanted = new Set(opts.boards ?? PULL_ORDER);
  const ctx: Ctx = { dryRun: Boolean(opts.dryRun), incremental: opts.incremental ?? true, log, report };

  for (const key of PULL_ORDER) {
    if (!wanted.has(key)) continue;
    const br: BoardReport = { seen: 0, created: 0, updated: 0, linked: 0, skipped: 0, errors: [] };
    report.boards[key] = br;
    log(`▶ ${key}`);
    try {
      const items = await fetchBoardItems(BOARDS[key]);
      br.seen = items.length;
      const handler = HANDLERS[key];
      if (!handler) {
        log(`  (no importer for ${key}; read-only board)`);
        continue;
      }
      await handler(ctx, items, br);
      if (!ctx.dryRun) await prisma.mondaySyncCursor.upsert({ where: { boardId: BOARDS[key] }, create: { boardId: BOARDS[key], lastPulledAt: new Date() }, update: { lastPulledAt: new Date(), lastError: null } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      br.errors.push(msg);
      log(`  ✗ ${msg}`);
      if (!ctx.dryRun) await prisma.mondaySyncCursor.upsert({ where: { boardId: BOARDS[key] }, create: { boardId: BOARDS[key], lastError: msg }, update: { lastError: msg } });
    }
    log(`  seen ${br.seen} · created ${br.created} · updated ${br.updated} · linked ${br.linked} · skipped ${br.skipped} · errors ${br.errors.length}`);
  }
  return report;
}

/** Import specific items (webhook path). Always re-reads them, ignoring the updated_at watermark. */
export async function pullItems(key: BoardKey, items: MondayItem[], opts: Pick<PullOptions, "dryRun" | "log"> = {}): Promise<BoardReport> {
  const br: BoardReport = { seen: items.length, created: 0, updated: 0, linked: 0, skipped: 0, errors: [] };
  const handler = HANDLERS[key];
  if (!handler) return br;
  const ctx: Ctx = { dryRun: Boolean(opts.dryRun), incremental: false, log: opts.log ?? (() => {}), report: { ranAt: new Date().toISOString(), dryRun: Boolean(opts.dryRun), boards: { [key]: br } } };
  await handler(ctx, items, br);
  return br;
}

// ───────────────────────── Shared plumbing ─────────────────────────

interface Ctx {
  dryRun: boolean;
  incremental: boolean;
  log: (line: string) => void;
  report: PullReport;
}

type EntityType = "Musician" | "Facility" | "EventRequest" | "Feedback";

async function findLink(boardId: string, itemId: string, entityType: EntityType) {
  return prisma.mondayLink.findFirst({ where: { boardId, itemId, entityType } });
}

async function entityIdFor(boardId: string, itemId: string | undefined, entityType: EntityType): Promise<string | null> {
  if (!itemId) return null;
  return (await findLink(boardId, itemId, entityType))?.entityId ?? null;
}

async function upsertLink(db: Tx | typeof prisma, boardId: string, item: MondayItem, entityType: EntityType, entityId: string) {
  await db.mondayLink.upsert({
    where: { itemId_entityType_entityId: { itemId: item.id, entityType, entityId } },
    create: { boardId, itemId: item.id, entityType, entityId, mondayUpdatedAt: new Date(item.updated_at), pulledAt: new Date() },
    update: { boardId, mondayUpdatedAt: new Date(item.updated_at), pulledAt: new Date() },
  });
}

async function logSync(db: Tx | typeof prisma, boardId: string, item: MondayItem | null, action: string, entity?: { type: EntityType; id: string }, detail?: unknown, error?: string) {
  await db.mondaySyncLog.create({
    data: { direction: "PULL", boardId, itemId: item?.id ?? null, entityType: entity?.type ?? null, entityId: entity?.id ?? null, action, detail: detail === undefined ? undefined : (JSON.parse(JSON.stringify(detail)) as object), error: error ?? null },
  });
}

/** True when the item has not changed on Monday since we last pulled it. */
function unchanged(ctx: Ctx, link: { mondayUpdatedAt: Date | null } | null, item: MondayItem) {
  return ctx.incremental && link?.mondayUpdatedAt != null && link.mondayUpdatedAt.getTime() === new Date(item.updated_at).getTime();
}

async function forEachItem(ctx: Ctx, boardId: string, items: MondayItem[], br: BoardReport, fn: (item: MondayItem) => Promise<"created" | "updated" | "linked" | "skipped">) {
  for (const item of items) {
    try {
      const outcome = await fn(item);
      br[outcome]++;
    } catch (e) {
      const msg = `${item.name} (${item.id}): ${e instanceof Error ? e.message : String(e)}`;
      br.errors.push(msg);
      ctx.log(`  ✗ ${msg}`);
      if (!ctx.dryRun) await logSync(prisma, boardId, item, "error", undefined, undefined, msg).catch(() => {});
    }
  }
}

async function geocodeIfNeeded(existing: { lat: number | null; lng: number | null } | null, address: { addressLine1: string; city: string; state: string; postalCode: string }, ctx: Ctx) {
  if (existing?.lat != null && existing?.lng != null) return { lat: existing.lat, lng: existing.lng };
  if (ctx.dryRun || !address.addressLine1 || !address.city) return { lat: null, lng: null };
  try {
    const geo = await getGeoProvider().geocode(formatAddress(address));
    return geo ? { lat: geo.lat, lng: geo.lng } : { lat: null, lng: null };
  } catch (e) {
    ctx.log(`  geocode failed for ${formatAddress(address)}: ${e instanceof Error ? e.message : e}`);
    return { lat: null, lng: null };
  }
}

const HANDLERS: Partial<Record<BoardKey, (ctx: Ctx, items: MondayItem[], br: BoardReport) => Promise<void>>> = {
  entertainers: pullEntertainers,
  clients: pullClients,
  gigs: pullGigs,
  bookingRequests: pullOrphanRequests,
  facilityFeedback: (ctx, items, br) => pullFeedback(ctx, items, br, "CLIENT"),
  entertainerFeedback: (ctx, items, br) => pullFeedback(ctx, items, br, "MUSICIAN"),
  applications: pullApplications,
};

// ───────────────────────── Partner Entertainer List → Musician ─────────────────────────

function entertainerData(item: MondayItem, cols: typeof ENTERTAINER | typeof APPLICATION) {
  const { firstName, lastName } = splitName(item.name);
  const groupName = colText(item, cols.groupName);
  const pay = parseMoney(colText(item, cols.pay));
  const genreNotes = colText(item, cols.genre);
  const audiences = colList(item, cols.audiences).map(mapAudienceTag).filter((t): t is string => Boolean(t));
  const participation = colList(item, cols.participation);
  return {
    firstName: firstName || item.name,
    lastName,
    stageName: groupName && groupName.toLowerCase() !== item.name.toLowerCase() ? groupName : null,
    email: firstEmail(colText(item, cols.email)),
    phone: normalisePhoneText(colText(item, cols.phone)),
    addressLine1: colText(item, cols.address),
    city: colText(item, cols.city),
    state: normaliseState(colText(item, cols.state)),
    postalCode: colText(item, cols.zip).slice(0, 10),
    entertainmentTypes: mapParticipation(participation),
    offersInteractive: participation.some((p) => /therap/i.test(p)),
    genres: extractGenres(genreNotes),
    instruments: splitInstruments(colText(item, cols.instruments)),
    audienceExperience: audiences,
    themes: splitLabels(colText(item, cols.themes)),
    preferredContact: mapPreferredContact(colText(item, cols.preferredContact)),
    region: colText(item, cols.region) || null,
    birthdayMonth: colText(item, cols.birthdayMonth) || null,
    emergencyContactName: colText(item, cols.emergencyName) || null,
    emergencyContactPhone: colText(item, cols.emergencyPhone) || null,
    groupSize: colNumber(item, cols.groupSize),
    equipmentNotes: colText(item, cols.equipment) || null,
    bio: colText(item, cols.bio) || null,
    rateNotes: colText(item, cols.pay) || null,
    travelNotes: colText(item, cols.travel) || null,
    genreNotes: genreNotes || null,
    mediaUrls: [...colFiles(item, cols.headshot), ...colFiles(item, cols.promo)],
    // Structured equivalents; only written when the text parses so a hand-corrected value is not clobbered.
    ...(pay ? { standardRate: pay.amount, rateStructure: pay.structure } : {}),
    ...(parseTravelMiles(colText(item, cols.travel)) != null ? { maxTravelMiles: parseTravelMiles(colText(item, cols.travel))! } : {}),
    experience: colText(item, cols.experience) || null,
  };
}

async function upsertMusician(ctx: Ctx, boardId: string, item: MondayItem, data: ReturnType<typeof entertainerData>, status: ReturnType<typeof mapEntertainerStatus>, br: BoardReport, note?: string) {
  const link = await findLink(boardId, item.id, "Musician");
  if (unchanged(ctx, link, item)) return "skipped" as const;
  const { experience, ...fields } = data;

  let musicianId = link?.entityId ?? null;
  let outcome: "created" | "updated" | "linked" = "updated";
  if (!musicianId) {
    // The same person may already exist (seeded, entered in the app, or on the other Monday board). Staff sometimes
    // put their own address on an act that has none, so an SMC address never counts as identifying.
    const identifyingEmail = fields.email && !isPlaceholderEmail(fields.email) ? fields.email : "none@invalid";
    const dupes = identifyingEmail !== "none@invalid" || fields.phone ? await findMusicianDuplicates({ firstName: fields.firstName, lastName: fields.lastName, email: identifyingEmail, phone: fields.phone }) : [];
    const hit = dupes.find((d) => d.confidence >= 0.6);
    if (hit) {
      musicianId = hit.id;
      outcome = "linked";
    }
  }
  if (ctx.dryRun) {
    ctx.log(`  ${musicianId ? outcome : "create"} musician ${item.name}${fields.email ? ` <${fields.email}>` : ""} → ${status}`);
    return musicianId ? outcome : ("created" as const);
  }

  const existing = musicianId ? await prisma.musician.findUnique({ where: { id: musicianId } }) : null;
  const coords = await geocodeIfNeeded(existing, fields, ctx);
  await prisma.$transaction(async (tx) => {
    if (existing) {
      // Monday owns these fields during the transition; app-only fields (availability, insurance, stats) are untouched.
      const u = await tx.musician.update({
        where: { id: existing.id },
        data: {
          ...fields,
          ...coords,
          status,
          privateNotes: existing.privateNotes || [experience, note].filter(Boolean).join("\n") || null,
          approvedAt: ["ACTIVE", "APPROVED"].includes(status) ? (existing.approvedAt ?? new Date()) : existing.approvedAt,
        },
      });
      await audit(MONDAY_ACTOR, { action: "monday.pulled", entityType: "Musician", entityId: u.id, before: { status: existing.status }, after: { status, itemId: item.id } }, tx);
      await logSync(tx, boardId, item, outcome, { type: "Musician", id: u.id });
      await upsertLink(tx, boardId, item, "Musician", u.id);
      musicianId = u.id;
    } else {
      const c = await tx.musician.create({
        data: {
          ...fields,
          ...coords,
          standardRate: fields.standardRate ?? 0,
          status,
          privateNotes: [experience, note].filter(Boolean).join("\n") || null,
          approvedAt: ["ACTIVE", "APPROVED"].includes(status) ? new Date() : null,
          weeklyAvailability: [],
          blackouts: [],
        },
      });
      outcome = "created";
      await audit(MONDAY_ACTOR, { action: "monday.pulled", entityType: "Musician", entityId: c.id, after: { status, itemId: item.id } }, tx);
      await logSync(tx, boardId, item, "created", { type: "Musician", id: c.id });
      await upsertLink(tx, boardId, item, "Musician", c.id);
      musicianId = c.id;
    }
  });
  // What we just pulled is, by definition, what Monday has: seed the push hash so it is not pushed straight back.
  if (boardId === BOARDS.entertainers && musicianId) await markInSync("Musician", musicianId, item.id);
  void br;
  return outcome;
}

async function pullEntertainers(ctx: Ctx, items: MondayItem[], br: BoardReport) {
  await forEachItem(ctx, BOARDS.entertainers, items, br, (item) => upsertMusician(ctx, BOARDS.entertainers, item, entertainerData(item, ENTERTAINER), mapEntertainerStatus(colText(item, ENTERTAINER.status)), br));
}

// ───────────────────────── Entertainer Applications → Musician (intake) ─────────────────────────

async function pullApplications(ctx: Ctx, items: MondayItem[], br: BoardReport) {
  await forEachItem(ctx, BOARDS.applications, items, br, async (item) => {
    const data = entertainerData(item, APPLICATION);
    const label = colText(item, APPLICATION.reviewStatus);
    const status = mapApplicationStatus(label);
    // An approved applicant who is already on the Partner Entertainer List is the same musician: link, don't downgrade.
    const link = await findLink(BOARDS.applications, item.id, "Musician");
    if (!link && data.email) {
      const existing = await prisma.musician.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } } });
      if (existing) {
        if (!ctx.dryRun) await upsertLink(prisma, BOARDS.applications, item, "Musician", existing.id);
        return "linked";
      }
    }
    // Once someone is on the Partner Entertainer List, that board owns their record; the application is history.
    if (link) {
      const onList = await prisma.mondayLink.findFirst({ where: { boardId: BOARDS.entertainers, entityType: "Musician", entityId: link.entityId } });
      if (onList) return "skipped";
    }
    return upsertMusician(ctx, BOARDS.applications, item, data, status, br, label === "Denied" ? `Application denied in Monday (${colDate(item, APPLICATION.date) ?? ""})` : undefined);
  });
}

// ───────────────────────── Client List → Facility ─────────────────────────

async function pullClients(ctx: Ctx, items: MondayItem[], br: BoardReport) {
  await forEachItem(ctx, BOARDS.clients, items, br, async (item) => {
    const link = await findLink(BOARDS.clients, item.id, "Facility");
    if (unchanged(ctx, link, item)) return "skipped";
    const audienceLabels = colList(item, CLIENT.audienceType);
    const fields = {
      name: item.name.trim(),
      facilityType: mapFacilityType(audienceLabels),
      addressLine1: colText(item, CLIENT.address),
      city: colText(item, CLIENT.city),
      state: normaliseState(colText(item, CLIENT.state)),
      postalCode: colText(item, CLIENT.zip).slice(0, 10),
      status: mapClientStatus(colText(item, CLIENT.status)),
      primaryContactName: colText(item, CLIENT.contactName),
      primaryContactEmail: firstEmail(colText(item, CLIENT.email)),
      primaryContactPhone: normalisePhoneText(colText(item, CLIENT.contactPhone)) || null,
      facilityPhone: normalisePhoneText(colText(item, CLIENT.facilityPhone)) || null,
      audienceTags: audienceLabels.map(mapAudienceTag).filter((t): t is string => Boolean(t)),
      audienceSizeNotes: colText(item, CLIENT.audienceSize) || null,
      typicalGroupSize: parseAttendance(colText(item, CLIENT.audienceSize)),
    };
    const notes = colText(item, CLIENT.notes);
    // Secondary addresses in the email cell are worth keeping.
    const extraEmails = splitEmailsBeyondFirst(colText(item, CLIENT.email));

    let facilityId = link?.entityId ?? null;
    let outcome: "created" | "updated" | "linked" = "updated";
    if (!facilityId) {
      const dupes = await findFacilityDuplicates({ name: fields.name, addressLine1: fields.addressLine1, postalCode: fields.postalCode, contactEmail: fields.primaryContactEmail || undefined });
      const hit = dupes.find((d) => d.confidence >= 0.8);
      if (hit) {
        facilityId = hit.id;
        outcome = "linked";
      }
    }
    if (ctx.dryRun) {
      ctx.log(`  ${facilityId ? outcome : "create"} facility ${fields.name} (${fields.city}) → ${fields.status}`);
      return facilityId ? outcome : "created";
    }
    const existing = facilityId ? await prisma.facility.findUnique({ where: { id: facilityId } }) : null;
    const coords = await geocodeIfNeeded(existing, fields, ctx);
    await prisma.$transaction(async (tx) => {
      const privateNotes = [notes, extraEmails.length ? `Other contacts: ${extraEmails.join(", ")}` : ""].filter(Boolean).join("\n") || null;
      if (existing) {
        const u = await tx.facility.update({ where: { id: existing.id }, data: { ...fields, ...coords, privateNotes: existing.privateNotes || privateNotes } });
        await audit(MONDAY_ACTOR, { action: "monday.pulled", entityType: "Facility", entityId: u.id, before: { status: existing.status }, after: { status: fields.status, itemId: item.id } }, tx);
        await logSync(tx, BOARDS.clients, item, outcome, { type: "Facility", id: u.id });
        await upsertLink(tx, BOARDS.clients, item, "Facility", u.id);
      } else {
        const c = await tx.facility.create({ data: { ...fields, ...coords, privateNotes } });
        outcome = "created";
        await audit(MONDAY_ACTOR, { action: "monday.pulled", entityType: "Facility", entityId: c.id, after: { status: fields.status, itemId: item.id } }, tx);
        await logSync(tx, BOARDS.clients, item, "created", { type: "Facility", id: c.id });
        await upsertLink(tx, BOARDS.clients, item, "Facility", c.id);
      }
    });
    await markInSync("Facility", (await findLink(BOARDS.clients, item.id, "Facility"))!.entityId, item.id);
    return outcome;
  });
}

function splitEmailsBeyondFirst(text: string): string[] {
  const all = text.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return Array.from(new Set(all)).slice(1);
}

// ───────────────────────── Gig Tracker (+ Booking Request Form) → EventRequest + Match ─────────────────────────

type Lifecycle = "TO_BE_BOOKED" | "BOOKED" | "COMPLETED" | "CANCELLED";

function lifecycleOf(item: MondayItem): Lifecycle {
  const g = item.group.title.toLowerCase();
  if (colText(item, GIG.cancel).toLowerCase() === "yes" || g.includes("cancel")) return "CANCELLED";
  if (g.includes("completed") || g.includes("past")) return "COMPLETED";
  if (g.includes("to be booked") || g.startsWith("to be")) return "TO_BE_BOOKED";
  if (g.includes("booked")) return "BOOKED";
  return "TO_BE_BOOKED";
}

/** Everything an event needs, drawn from the gig row and its source booking request. */
function gigData(gig: MondayItem, request: MondayItem | null) {
  const req = (id: string) => (request ? colText(request, id) : "");
  const date = colDate(gig, GIG.confirmDate) ?? (colText(gig, GIG.dateMirror).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null) ?? (request ? colDate(request, REQUEST.date) : null);
  const timeText = req(REQUEST.time) || colText(gig, GIG.timeMirror) || null;
  const time = parseTimeRange(timeText);
  const startAt = date ? fromZonedTime(`${date}T${time?.start ?? "14:00"}:00`, DEFAULT_TZ) : null;
  const attendanceText = colText(gig, GIG.attendance) || req(REQUEST.attendance);
  const audience = [colText(gig, GIG.audienceType), req(REQUEST.audienceType), ...(request ? colList(request, REQUEST.audienceCategory) : [])].filter(Boolean);
  const money = parseMoney(req(REQUEST.budget));
  const location = [req(REQUEST.location), req(REQUEST.locationOther)].filter((s) => s && s.toLowerCase() !== "other").join(": ") || null;
  const cancelledBy = colText(gig, GIG.cancelledBy);
  return {
    date,
    startAt,
    durationMinutes: time?.durationMinutes ?? 60,
    timeParsed: Boolean(time),
    timeText,
    serviceType: mapServiceType(req(REQUEST.serviceType)),
    programTags: request ? [req(REQUEST.performanceType), req(REQUEST.serviceOther)].filter(Boolean).map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-")) : [],
    audienceDescription: audience.length ? Array.from(new Set(audience)).join(", ") : null,
    audienceTags: audience.map(mapAudienceTag).filter((t): t is string => Boolean(t)),
    expectedAttendance: parseAttendance(attendanceText),
    budgetCeiling: colNumber(gig, GIG.facilityBudget) ?? money?.amount ?? null,
    entertainerFee: colNumber(gig, GIG.entertainerFee),
    amountCharged: colNumber(gig, GIG.amountCharged),
    facilityBilled: pickLabel(colText(gig, GIG.facilityBilled)),
    entertainerPaid: pickLabel(colText(gig, GIG.entertainerPaid)),
    agreementStatus: pickLabel(colText(gig, GIG.agreementStatus)),
    cancelledBy: cancelledBy && cancelledBy.toLowerCase() !== "select" ? cancelledBy : null,
    cancelReason: colText(gig, GIG.cancelReason) || null,
    notes: [colText(gig, GIG.special), req(REQUEST.special)].filter((s, i, a) => s && a.indexOf(s) === i).join("\n") || null,
    arrivalInstructions: req(REQUEST.arrival) || null,
    earlyArrivalNotes: colText(gig, GIG.earlyArrival) || req(REQUEST.earlyArrival) || null,
    occasion: req(REQUEST.occasion) || null,
    performanceLocation: location,
    requestedEntertainer: req(REQUEST.requestedEntertainer) || null,
    facilityEmail: firstEmail(colText(gig, GIG.facilityEmail)) || firstEmail(req(REQUEST.contactEmail)),
    entertainerEmail: firstEmail(colText(gig, GIG.entertainerEmail)),
    intake: request
      ? {
          facilityName: request.name.trim(),
          facilityType: mapFacilityType(audience),
          contactName: req(REQUEST.contactName),
          contactRole: "",
          contactEmail: firstEmail(req(REQUEST.contactEmail)),
          contactPhone: normalisePhoneText(req(REQUEST.contactPhone)),
          addressLine1: req(REQUEST.address),
          city: req(REQUEST.city),
          state: normaliseState(req(REQUEST.state)),
          postalCode: req(REQUEST.zip).slice(0, 10),
        }
      : null,
  };
}

const PLACEHOLDER_EMAIL_DOMAINS = ["seniormusicconnection.com", "krissy.com", "ccc.com"];
function isPlaceholderEmail(email: string) {
  const d = email.toLowerCase().split("@")[1] ?? "";
  return PLACEHOLDER_EMAIL_DOMAINS.includes(d);
}

/** Placeholder labels ("Select Status", "Signed Contract?") mean "not set". */
function pickLabel(label: string): string | null {
  const t = label.trim();
  if (!t || /^select|\?$|^enter /i.test(t)) return null;
  return t;
}

async function pullGigs(ctx: Ctx, gigs: MondayItem[], br: BoardReport) {
  // Every gig reads its source booking request for the fields the tracker only mirrors.
  const requests = new Map<string, MondayItem>();
  const requestIds = Array.from(new Set(gigs.map((g) => colLinkedIds(g, GIG.sourceRequest)[0]).filter((id): id is string => Boolean(id))));
  for (let i = 0; i < requestIds.length; i += 100) for (const r of await fetchItems(requestIds.slice(i, i + 100))) requests.set(r.id, r);

  await forEachItem(ctx, BOARDS.gigs, gigs, br, async (gig) => {
    const link = await findLink(BOARDS.gigs, gig.id, "EventRequest");
    if (unchanged(ctx, link, gig)) return "skipped";
    const requestId = colLinkedIds(gig, GIG.sourceRequest)[0];
    const request = requestId ? (requests.get(requestId) ?? null) : null;
    const d = gigData(gig, request);
    if (!d.startAt) throw new Error("no performance date on the gig or its booking request");
    const lifecycle = lifecycleOf(gig);

    // Facility: the gig's client link, else the request's, else an email match, else an intake blob for review.
    const clientItemId = colLinkedIds(gig, GIG.client)[0] ?? (request ? (colLinkedIds(request, REQUEST.client)[0] ?? colLinkedIds(request, REQUEST.clientAlt)[0]) : undefined);
    let facilityId = await entityIdFor(BOARDS.clients, clientItemId, "Facility");
    if (!facilityId && d.facilityEmail) facilityId = (await prisma.facility.findFirst({ where: { primaryContactEmail: { equals: d.facilityEmail, mode: "insensitive" } }, select: { id: true } }))?.id ?? null;
    if (!facilityId && request) {
      const dupes = await findFacilityDuplicates({ name: request.name, addressLine1: d.intake!.addressLine1, postalCode: d.intake!.postalCode, contactEmail: d.intake!.contactEmail || undefined });
      if (dupes[0] && dupes[0].confidence >= 0.8) facilityId = dupes[0].id;
    }
    // Musician: the gig's entertainer link, else its email.
    const entertainerItemId = colLinkedIds(gig, GIG.entertainer)[0];
    let musicianId = await entityIdFor(BOARDS.entertainers, entertainerItemId, "Musician");
    if (!musicianId && d.entertainerEmail) musicianId = (await prisma.musician.findFirst({ where: { email: { equals: d.entertainerEmail, mode: "insensitive" } }, select: { id: true } }))?.id ?? null;

    const facility = facilityId ? await prisma.facility.findUnique({ where: { id: facilityId } }) : null;
    const address = facility ?? d.intake;

    // One request-form row can back several events (one per date); reuse an event created from the form
    // alone only while it has no gig of its own.
    let eventId = link?.entityId ?? null;
    if (!eventId && requestId) {
      const fromForm = await prisma.mondayLink.findMany({ where: { boardId: BOARDS.bookingRequests, itemId: requestId, entityType: "EventRequest" } });
      for (const l of fromForm) {
        const hasGig = await prisma.mondayLink.findFirst({ where: { boardId: BOARDS.gigs, entityType: "EventRequest", entityId: l.entityId } });
        if (!hasGig) {
          eventId = l.entityId;
          break;
        }
      }
    }

    if (ctx.dryRun) {
      ctx.log(`  ${eventId ? "update" : "create"} event ${gig.name} ${d.date} ${d.timeText ?? ""} [${lifecycle}] facility=${facility?.name ?? (d.intake ? "intake:" + d.intake.facilityName : "none")} musician=${musicianId ?? d.entertainerEmail ?? "none"}`);
      return eventId ? "updated" : "created";
    }

    const status = lifecycle === "TO_BE_BOOKED" ? (facilityId ? "READY_TO_MATCH" : "NEEDS_INFORMATION") : "CLOSED";
    const closeReason = lifecycle === "CANCELLED" ? `Cancelled in Monday${d.cancelledBy ? ` by ${d.cancelledBy.toLowerCase()}` : ""}${d.cancelReason ? `: ${d.cancelReason}` : ""}` : lifecycle === "TO_BE_BOOKED" ? null : "Booking confirmed";
    const eventFields = {
      facilityId,
      intakeFacility: facilityId ? undefined : (d.intake ?? undefined),
      startAt: d.startAt,
      durationMinutes: d.durationMinutes,
      timezone: DEFAULT_TZ,
      serviceType: d.serviceType,
      programTags: d.programTags,
      audienceDescription: d.audienceDescription,
      expectedAttendance: d.expectedAttendance,
      budgetCeiling: d.budgetCeiling,
      locationAddressLine1: address?.addressLine1 || null,
      locationCity: address?.city || null,
      locationState: address?.state || null,
      locationPostalCode: address?.postalCode || null,
      lat: facility?.lat ?? null,
      lng: facility?.lng ?? null,
      hardRequirements: { therapeuticQualifications: [], certifications: [], backgroundCheckRequired: false, insuranceRequired: false, audienceTags: d.audienceTags, programRequirements: [] },
      notes: d.notes,
      source: "MONDAY",
      timeText: d.timeText,
      occasion: d.occasion,
      performanceLocation: d.performanceLocation,
      requestedEntertainer: d.requestedEntertainer,
      earlyArrivalNotes: d.earlyArrivalNotes,
      arrivalInstructions: d.arrivalInstructions,
      entertainerFee: d.entertainerFee,
      amountCharged: d.amountCharged,
      facilityBilled: d.facilityBilled,
      entertainerPaid: d.entertainerPaid,
      agreementStatus: d.agreementStatus,
      cancelledBy: d.cancelledBy,
      status,
      missingFields: status === "NEEDS_INFORMATION" ? ["linked facility"] : [],
      closedAt: status === "CLOSED" ? new Date() : null,
      closeReason,
    } as const;

    let outcome: "created" | "updated" = eventId ? "updated" : "created";
    await prisma.$transaction(async (tx) => {
      let ev;
      if (eventId) {
        const before = await tx.eventRequest.findUniqueOrThrow({ where: { id: eventId } });
        ev = await tx.eventRequest.update({ where: { id: eventId }, data: { ...eventFields, closedAt: before.closedAt ?? eventFields.closedAt, readyAt: before.readyAt ?? (status === "READY_TO_MATCH" ? new Date() : null) } });
        await audit(MONDAY_ACTOR, { action: "monday.pulled", entityType: "EventRequest", entityId: ev.id, eventRequestId: ev.id, before: { status: before.status }, after: { status, lifecycle, itemId: gig.id } }, tx);
      } else {
        const reference = await nextEventReference(tx);
        ev = await tx.eventRequest.create({ data: { reference, ...eventFields, submittedAt: new Date(gig.created_at), readyAt: status === "READY_TO_MATCH" ? new Date(gig.created_at) : null } });
        outcome = "created";
        await audit(MONDAY_ACTOR, { action: "monday.pulled", entityType: "EventRequest", entityId: ev.id, eventRequestId: ev.id, after: { status, lifecycle, itemId: gig.id } }, tx);
      }
      await upsertLink(tx, BOARDS.gigs, gig, "EventRequest", ev.id);
      if (request) await upsertLink(tx, BOARDS.bookingRequests, request, "EventRequest", ev.id);
      await logSync(tx, BOARDS.gigs, gig, outcome, { type: "EventRequest", id: ev.id }, { lifecycle, facilityId, musicianId });

      if (musicianId && facilityId) await syncSelectedMatch(tx, ev.id, facilityId, musicianId, lifecycle, d, gig);
      else if (musicianId && !facilityId) await logSync(tx, BOARDS.gigs, gig, "skipped", { type: "EventRequest", id: ev.id }, { reason: "entertainer known but facility not linked; no booking row created" });
    });
    if (musicianId && lifecycle === "COMPLETED") await recomputeMusicianStats(musicianId);
    await markInSync("EventRequest", (await findLink(BOARDS.gigs, gig.id, "EventRequest"))!.entityId, gig.id);
    return outcome;
  });
}

/**
 * Mirror the entertainer chosen in Monday as the event's selected Match. Monday holds no candidate list, so
 * the run is a one-candidate override; if the entertainer changes, the previous booking row is deselected.
 */
async function syncSelectedMatch(tx: Tx, eventRequestId: string, facilityId: string, musicianId: string, lifecycle: Lifecycle, d: ReturnType<typeof gigData>, gig: MondayItem) {
  const end = new Date(d.startAt!.getTime() + d.durationMinutes * 60_000);
  const matchStatus = lifecycle === "COMPLETED" && end < new Date() ? ("COMPLETED" as const) : ("CONFIRMED" as const);
  const exception = lifecycle === "CANCELLED" ? ("CANCELLED" as const) : null;
  const exceptionReason = lifecycle === "CANCELLED" ? [d.cancelledBy ? `${d.cancelledBy.toUpperCase()}` : "", d.cancelReason ?? ""].filter(Boolean).join(": ") || "Cancelled in Monday" : null;
  const confirmedAt = colDate(gig, GIG.confirmDate) ? fromZonedTime(`${colDate(gig, GIG.confirmDate)}T12:00:00`, DEFAULT_TZ) : new Date(gig.created_at);

  const selected = await tx.match.findFirst({ where: { eventRequestId, selected: true } });
  if (selected && selected.musicianId !== musicianId) {
    await tx.match.update({ where: { id: selected.id }, data: { selected: false, exceptionStatus: "REMATCH_REQUIRED", exceptionReason: "Entertainer changed in Monday" } });
  }
  const runId = selected?.matchRunId ?? (await tx.matchRun.create({ data: { eventRequestId, weightsSnapshot: { source: "MONDAY" }, thresholdsSnapshot: {}, totalMusicians: 1, eligibleCount: 1, exclusionSummary: {}, durationMs: 0 } })).id;
  const common = {
    status: matchStatus,
    exceptionStatus: exception,
    exceptionReason,
    selected: true,
    confirmedAt,
    completedAt: matchStatus === "COMPLETED" ? end : null,
    musicianResponse: "ACCEPTED" as const,
    facilityResponse: "ACCEPTED" as const,
  };
  if (selected && selected.musicianId === musicianId) {
    await tx.match.update({ where: { id: selected.id }, data: common });
    return;
  }
  const existingRow = await tx.match.findUnique({ where: { matchRunId_musicianId: { matchRunId: runId, musicianId } } });
  if (existingRow) {
    await tx.match.update({ where: { id: existingRow.id }, data: common });
    return;
  }
  await tx.match.create({
    data: {
      matchRunId: runId,
      eventRequestId,
      facilityId,
      musicianId,
      eligible: true,
      rank: 1,
      isOverride: true,
      overrideReason: "Booked in Monday",
      approvedAt: confirmedAt,
      offeredAt: confirmedAt,
      musicianRespondedAt: confirmedAt,
      facilityRespondedAt: confirmedAt,
      ...common,
    },
  });
}

/** Booking-request rows that have no Gig Tracker row yet (still New / In Review) become pending events. */
async function pullOrphanRequests(ctx: Ctx, items: MondayItem[], br: BoardReport) {
  await forEachItem(ctx, BOARDS.bookingRequests, items, br, async (request) => {
    const review = colText(request, REQUEST.reviewStatus).toLowerCase();
    if (["duplicate", "test", "declined", "canceled", "cancelled", "placeholder"].includes(review)) return "skipped";
    const existing = await prisma.mondayLink.findFirst({ where: { boardId: BOARDS.bookingRequests, itemId: request.id, entityType: "EventRequest" } });
    if (existing) return "skipped"; // already represented (through a gig, or an earlier orphan import)
    if (!["new", "in review", ""].includes(review)) return "skipped"; // Approved/Past Booking without a gig: staff will make one in Monday
    const d = gigData(request, request); // the form row stands in for the gig
    const date = colDate(request, REQUEST.date);
    if (!date) return "skipped";
    const startAt = fromZonedTime(`${date}T${parseTimeRange(d.timeText)?.start ?? "14:00"}:00`, DEFAULT_TZ);
    const clientItemId = colLinkedIds(request, REQUEST.client)[0] ?? colLinkedIds(request, REQUEST.clientAlt)[0];
    let facilityId = await entityIdFor(BOARDS.clients, clientItemId, "Facility");
    if (!facilityId) {
      const dupes = await findFacilityDuplicates({ name: request.name, addressLine1: d.intake!.addressLine1, postalCode: d.intake!.postalCode, contactEmail: d.intake!.contactEmail || undefined });
      if (dupes[0] && dupes[0].confidence >= 0.8) facilityId = dupes[0].id;
    }
    if (ctx.dryRun) {
      ctx.log(`  create pending event from request ${request.name} ${date} (${review || "no status"})`);
      return "created";
    }
    const facility = facilityId ? await prisma.facility.findUnique({ where: { id: facilityId } }) : null;
    await prisma.$transaction(async (tx) => {
      const reference = await nextEventReference(tx);
      const ev = await tx.eventRequest.create({
        data: {
          reference,
          facilityId,
          intakeFacility: facilityId ? undefined : d.intake!,
          startAt,
          durationMinutes: d.durationMinutes,
          timezone: DEFAULT_TZ,
          serviceType: d.serviceType,
          programTags: d.programTags,
          audienceDescription: d.audienceDescription,
          expectedAttendance: d.expectedAttendance,
          budgetCeiling: d.budgetCeiling,
          locationAddressLine1: (facility ?? d.intake)?.addressLine1 || null,
          locationCity: (facility ?? d.intake)?.city || null,
          locationState: (facility ?? d.intake)?.state || null,
          locationPostalCode: (facility ?? d.intake)?.postalCode || null,
          lat: facility?.lat ?? null,
          lng: facility?.lng ?? null,
          hardRequirements: { therapeuticQualifications: [], certifications: [], backgroundCheckRequired: false, insuranceRequired: false, audienceTags: d.audienceTags, programRequirements: [] },
          notes: d.notes,
          source: "MONDAY",
          timeText: d.timeText,
          occasion: d.occasion,
          performanceLocation: d.performanceLocation,
          requestedEntertainer: d.requestedEntertainer,
          earlyArrivalNotes: d.earlyArrivalNotes,
          arrivalInstructions: d.arrivalInstructions,
          status: "SUBMITTED",
          submittedAt: new Date(request.created_at),
        },
      });
      await audit(MONDAY_ACTOR, { action: "monday.pulled", entityType: "EventRequest", entityId: ev.id, eventRequestId: ev.id, after: { status: "SUBMITTED", itemId: request.id } }, tx);
      await upsertLink(tx, BOARDS.bookingRequests, request, "EventRequest", ev.id);
      await logSync(tx, BOARDS.bookingRequests, request, "created", { type: "EventRequest", id: ev.id });
    });
    return "created";
  });
}

// ───────────────────────── Feedback forms → Feedback ─────────────────────────

async function pullFeedback(ctx: Ctx, items: MondayItem[], br: BoardReport, kind: "CLIENT" | "MUSICIAN") {
  const cols = kind === "CLIENT" ? FACILITY_FEEDBACK : ENTERTAINER_FEEDBACK;
  const boardId = kind === "CLIENT" ? BOARDS.facilityFeedback : BOARDS.entertainerFeedback;
  await forEachItem(ctx, boardId, items, br, async (item) => {
    const link = await findLink(boardId, item.id, "Feedback");
    if (unchanged(ctx, link, item)) return "skipped";
    const gigItemId = colText(item, cols.eventId).replace(/\D/g, "");
    const eventId = await entityIdFor(BOARDS.gigs, gigItemId || undefined, "EventRequest");
    if (!eventId) {
      if (!ctx.dryRun) await logSync(prisma, boardId, item, "skipped", undefined, { reason: gigItemId ? `gig ${gigItemId} not imported` : "no event_id on the form" });
      return "skipped";
    }
    const match = await prisma.match.findFirst({ where: { eventRequestId: eventId, selected: true } });
    if (!match) {
      if (!ctx.dryRun) await logSync(prisma, boardId, item, "skipped", { type: "EventRequest", id: eventId }, { reason: "event has no booked entertainer" });
      return "skipped";
    }
    const comments = [colText(item, cols.enjoyed), colText(item, cols.comments)].filter(Boolean).join("\n\n") || null;
    const rating = colNumber(item, cols.rating);
    const data = {
      rating: rating != null ? Math.round(rating) : null,
      comments,
      wouldRecommend: kind === "CLIENT" ? colText(item, (cols as typeof FACILITY_FEEDBACK).recommend) || null : null,
      testimonialOk: Boolean(colText(item, cols.testimonial)),
      followUpRequired: rating != null && rating <= 3,
      status: rating != null && rating <= 3 ? ("FOLLOW_UP_REQUIRED" as const) : ("SUBMITTED" as const),
      submittedAt: new Date(item.created_at),
    };
    if (ctx.dryRun) {
      ctx.log(`  ${link ? "update" : "create"} ${kind} feedback for gig ${gigItemId}: ${rating ?? "-"}★`);
      return link ? "updated" : "created";
    }
    let outcome: "created" | "updated" = "updated";
    await prisma.$transaction(async (tx) => {
      const existing = await tx.feedback.findUnique({ where: { matchId_kind: { matchId: match.id, kind } } });
      const row = existing
        ? await tx.feedback.update({ where: { id: existing.id }, data })
        : await tx.feedback.create({ data: { kind, matchId: match.id, eventRequestId: eventId, facilityId: match.facilityId, musicianId: match.musicianId, ...data } });
      outcome = existing ? "updated" : "created";
      await upsertLink(tx, boardId, item, "Feedback", row.id);
      await logSync(tx, boardId, item, outcome, { type: "Feedback", id: row.id });
    });
    await recomputeMusicianStats(match.musicianId);
    return outcome;
  });
}

export const _internal = { gigData, lifecycleOf, entertainerData };
