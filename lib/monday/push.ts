/**
 * App → Monday. Writes the app's view of a record back to its linked Monday item, creating the item when the
 * record has no link yet (opt-in per record type, see `allowCreate`).
 *
 * Guards that keep this from looping with the pull side:
 *  - every payload is hashed and stored on the MondayLink; an unchanged hash is not written again, so a record
 *    whose updatedAt moved for an app-only reason (stats recompute, notes) costs nothing. The pull seeds that hash
 *    (`markInSync`) so freshly pulled records are never push candidates;
 *  - every column written is recorded in MondayEcho and the link's mondayUpdatedAt is refreshed after the write,
 *    so the webhook Monday fires for our own change is recognised and dropped.
 *
 * Conflict rule during the transition: the most recent edit wins. If Monday's item changed after the app record
 * did, the push is skipped and the next pull brings Monday's value in.
 */
import { createHash } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { decimalToNumber } from "@/lib/utils";
import { MONDAY_ACTOR } from "./actor";
import { BOARDS, CLIENT, ENTERTAINER, GIG, type BoardKey } from "./boards";
import { fetchItems, mondayQuery } from "./client";

export interface PushOptions {
  dryRun?: boolean;
  /** Create Monday items for app records that have no link yet. Off by default so demo data never reaches the live boards. */
  allowCreate?: boolean;
  log?: (line: string) => void;
}
export interface PushReport {
  ranAt: string;
  dryRun: boolean;
  musicians: Counts;
  facilities: Counts;
  events: Counts;
}
interface Counts {
  candidates: number;
  written: number;
  created: number;
  unchanged: number;
  skippedNewer: number;
  errors: string[];
}
const counts = (): Counts => ({ candidates: 0, written: 0, created: 0, unchanged: 0, skippedNewer: 0, errors: [] });

type EntityType = "Musician" | "Facility" | "EventRequest";
type ColumnValues = Record<string, unknown>;
type Link = { id: string; itemId: string; mondayUpdatedAt: Date | null; pushedHash: string | null };

interface Payload {
  boardKey: BoardKey;
  name: string;
  values: ColumnValues;
  groupId: string | null;
  appUpdatedAt: Date;
  /** Whether this record may be created in Monday when it has no item yet (given allowCreate). */
  creatable: boolean;
}

const hashOf = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const payloadHash = (p: Payload) => hashOf({ name: p.name, values: p.values, groupId: p.groupId });

// ───────────────────────── Monday write primitives ─────────────────────────

async function writeColumns(boardId: string, itemId: string, values: ColumnValues) {
  await mondayQuery(
    `mutation($board: ID!, $item: ID!, $values: JSON!) { change_multiple_column_values(board_id: $board, item_id: $item, column_values: $values, create_labels_if_missing: true) { id } }`,
    { board: boardId, item: itemId, values: JSON.stringify(values) },
  );
}

async function createItem(boardId: string, name: string, values: ColumnValues, groupId?: string): Promise<string> {
  const data = await mondayQuery<{ create_item: { id: string } }>(
    `mutation($board: ID!, $name: String!, $values: JSON!, $group: String) { create_item(board_id: $board, item_name: $name, column_values: $values, group_id: $group, create_labels_if_missing: true) { id } }`,
    { board: boardId, name, values: JSON.stringify(values), group: groupId ?? null },
  );
  return data.create_item.id;
}

async function moveToGroup(itemId: string, groupId: string) {
  await mondayQuery(`mutation($item: ID!, $group: String!) { move_item_to_group(item_id: $item, group_id: $group) { id } }`, { item: itemId, group: groupId });
}

const groupCache = new Map<string, { id: string; title: string }[]>();
async function boardGroups(boardId: string) {
  if (!groupCache.has(boardId)) {
    const data = await mondayQuery<{ boards: { groups: { id: string; title: string }[] }[] }>(`query($id: [ID!]) { boards(ids: $id) { groups { id title } } }`, { id: [boardId] });
    groupCache.set(boardId, data.boards[0]?.groups ?? []);
  }
  return groupCache.get(boardId)!;
}

async function findGroup(boardId: string, test: (title: string) => boolean) {
  return (await boardGroups(boardId)).find((g) => test(g.title.toLowerCase()))?.id ?? null;
}

// ───────────────────────── Value builders ─────────────────────────

const status = (label: string) => ({ label });
const email = (v: string | null | undefined) => (v ? { email: v, text: v } : { email: "", text: "" });
const phone = (v: string | null | undefined) => (v ? { phone: v.replace(/\D/g, ""), countryShortName: "US" } : { phone: "", countryShortName: "US" });
const text = (v: string | null | undefined) => v ?? "";
const longText = (v: string | null | undefined) => ({ text: v ?? "" });
const num = (v: unknown) => {
  const n = decimalToNumber(v);
  return n == null ? "" : String(n);
};
const date = (d: Date | null | undefined, tz: string) => (d ? { date: formatInTimeZone(d, tz, "yyyy-MM-dd") } : { date: "" });
const relation = (ids: string[]) => ({ item_ids: ids });
const dropdown = (labels: string[]) => ({ labels });

const MUSICIAN_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", APPROVED: "Active", INACTIVE: "Not Active", SUSPENDED: "DO NOT USE", REVIEW: "Need Info", SUBMITTED: "Need Info" };
const FACILITY_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", PENDING_REVIEW: "Prospect" };
const PREFERRED_CONTACT_LABEL: Record<string, string> = { text: "Text", email: "Email", phone: "Phone Call" };

// ───────────────────────── Payloads ─────────────────────────

async function musicianPayload(id: string): Promise<Payload> {
  const m = await prisma.musician.findUniqueOrThrow({ where: { id } });
  return {
    boardKey: "entertainers",
    name: `${m.firstName} ${m.lastName}`.trim(),
    groupId: null,
    appUpdatedAt: m.updatedAt,
    creatable: ["APPROVED", "ACTIVE"].includes(m.status),
    values: {
      [ENTERTAINER.status]: status(MUSICIAN_STATUS_LABEL[m.status] ?? "Need Info"),
      [ENTERTAINER.phone]: text(m.phone),
      [ENTERTAINER.email]: email(m.email),
      [ENTERTAINER.address]: text(m.addressLine1),
      [ENTERTAINER.city]: text(m.city),
      [ENTERTAINER.state]: text(m.state),
      [ENTERTAINER.zip]: text(m.postalCode),
      [ENTERTAINER.groupName]: text(m.stageName),
      [ENTERTAINER.groupSize]: num(m.groupSize),
      [ENTERTAINER.emergencyName]: text(m.emergencyContactName),
      [ENTERTAINER.emergencyPhone]: text(m.emergencyContactPhone),
      ...(m.preferredContact && PREFERRED_CONTACT_LABEL[m.preferredContact] ? { [ENTERTAINER.preferredContact]: dropdown([PREFERRED_CONTACT_LABEL[m.preferredContact]]) } : {}),
      ...(m.themes.length ? { [ENTERTAINER.themes]: dropdown(m.themes) } : {}),
    },
  };
}

async function facilityPayload(id: string): Promise<Payload> {
  const f = await prisma.facility.findUniqueOrThrow({ where: { id } });
  return {
    boardKey: "clients",
    name: f.name,
    groupId: null,
    appUpdatedAt: f.updatedAt,
    creatable: f.status !== "PENDING_REVIEW",
    values: {
      [CLIENT.status]: status(FACILITY_STATUS_LABEL[f.status] ?? "Active"),
      [CLIENT.contactName]: text(f.primaryContactName),
      [CLIENT.contactPhone]: text(f.primaryContactPhone),
      [CLIENT.email]: email(f.primaryContactEmail),
      [CLIENT.address]: text(f.addressLine1),
      [CLIENT.city]: text(f.city),
      [CLIENT.state]: text(f.state),
      [CLIENT.zip]: text(f.postalCode),
      [CLIENT.facilityPhone]: phone(f.facilityPhone),
    },
  };
}

async function eventPayload(id: string, opts: PushOptions): Promise<Payload> {
  const e = await prisma.eventRequest.findUniqueOrThrow({ where: { id }, include: { facility: true, matches: { where: { selected: true }, include: { musician: true }, take: 1 } } });
  const sel = e.matches[0] ?? null;

  // Relations need the counterpart items to exist in Monday.
  const clientLink = e.facilityId ? await prisma.mondayLink.findFirst({ where: { boardId: BOARDS.clients, entityType: "Facility", entityId: e.facilityId } }) : null;
  let entertainerLink = sel ? await prisma.mondayLink.findFirst({ where: { boardId: BOARDS.entertainers, entityType: "Musician", entityId: sel.musicianId } }) : null;
  if (sel && !entertainerLink && opts.allowCreate && !opts.dryRun) {
    await pushMusician(sel.musicianId, opts);
    entertainerLink = await prisma.mondayLink.findFirst({ where: { boardId: BOARDS.entertainers, entityType: "Musician", entityId: sel.musicianId } });
  }

  const cancelled = sel?.exceptionStatus === "CANCELLED";
  const lifecycle = cancelled ? "cancel" : sel?.status === "COMPLETED" ? "completed" : sel?.status === "CONFIRMED" ? "booked" : "to be booked";
  const groupId = await findGroup(BOARDS.gigs, (t) => (lifecycle === "cancel" ? t.includes("cancel") : lifecycle === "completed" ? t.includes("completed") : lifecycle === "booked" ? t.startsWith("booked") : t.includes("to be booked")));
  const intake = (e.intakeFacility ?? {}) as Record<string, string>;
  return {
    boardKey: "gigs",
    name: e.facility?.name ?? intake.facilityName ?? e.reference,
    groupId,
    appUpdatedAt: new Date(Math.max(e.updatedAt.getTime(), sel?.updatedAt.getTime() ?? 0)),
    creatable: e.source === "APP",
    values: {
      [GIG.confirmDate]: date(e.startAt, e.timezone),
      ...(clientLink ? { [GIG.client]: relation([clientLink.itemId]) } : {}),
      ...(entertainerLink ? { [GIG.entertainer]: relation([entertainerLink.itemId]) } : {}),
      [GIG.entertainerEmail]: email(sel?.musician.email),
      [GIG.facilityEmail]: email(e.facility?.primaryContactEmail ?? intake.contactEmail),
      [GIG.facilityBudget]: num(e.budgetCeiling),
      [GIG.entertainerFee]: num(e.entertainerFee ?? (sel ? sel.musician.standardRate : null)),
      [GIG.special]: longText(e.notes),
      [GIG.cancel]: status(cancelled ? "Yes" : "No"),
      ...(cancelled ? { [GIG.cancelledBy]: status(e.cancelledBy ?? (sel?.exceptionReason?.startsWith("MUSICIAN") ? "Entertainer" : "Client")), [GIG.cancelReason]: text(e.cancelledBy ? e.closeReason : sel?.exceptionReason) } : {}),
    },
  };
}

const PAYLOAD: Record<EntityType, (id: string, opts: PushOptions) => Promise<Payload>> = { Musician: musicianPayload, Facility: facilityPayload, EventRequest: eventPayload };

/**
 * Called by the pull after it writes a record: what the app now holds *is* Monday's state, so store the payload
 * hash and treat the record as pushed. Without this every pulled record would be a push candidate.
 */
export async function markInSync(entityType: EntityType, entityId: string, itemId: string) {
  try {
    const p = await PAYLOAD[entityType](entityId, {});
    // Every link the record has on this board (duplicate Monday rows for one person share the state).
    await prisma.mondayLink.updateMany({ where: { boardId: BOARDS[p.boardKey], entityType, entityId }, data: { pushedHash: payloadHash(p), pushedAt: new Date() } });
    void itemId;
  } catch (e) {
    console.warn(`markInSync ${entityType} ${entityId}:`, e instanceof Error ? e.message : e);
  }
}

// ───────────────────────── Core ─────────────────────────

/** Record what we wrote so the resulting webhook is recognised as our own, and refresh the watermark. */
async function recordWrite(existing: boolean, boardId: string, itemId: string, entityType: EntityType, entityId: string, values: ColumnValues, hash: string) {
  const [item] = await fetchItems([itemId]).catch(() => []);
  const mondayUpdatedAt = item ? new Date(item.updated_at) : null;
  await prisma.$transaction(async (tx) => {
    await tx.mondayEcho.createMany({ data: Object.entries(values).map(([columnId, v]) => ({ itemId, columnId, valueHash: hashOf(v) })) });
    await tx.mondayLink.upsert({
      where: { itemId_entityType_entityId: { itemId, entityType, entityId } },
      create: { boardId, itemId, entityType, entityId, pushedAt: new Date(), pushedHash: hash, mondayUpdatedAt, pulledAt: mondayUpdatedAt ? new Date() : null },
      update: { pushedAt: new Date(), pushedHash: hash, ...(mondayUpdatedAt ? { mondayUpdatedAt, pulledAt: new Date() } : {}) },
    });
    await tx.mondaySyncLog.create({ data: { direction: "PUSH", boardId, itemId, entityType, entityId, action: existing ? "updated" : "created", detail: { columns: Object.keys(values) } } });
    await audit(MONDAY_ACTOR, { action: "monday.pushed", entityType, entityId, after: { itemId, columns: Object.keys(values) } }, tx);
  });
}

async function pushOne(entityType: EntityType, entityId: string, p: Payload, link: Link | null, opts: PushOptions, c: Counts, mondayUpdatedNow?: Date | null) {
  const log = opts.log ?? (() => {});
  const boardId = BOARDS[p.boardKey];
  const hash = payloadHash(p);
  c.candidates++;
  if (!link && !(opts.allowCreate && p.creatable)) return "skipped" as const;
  if (link?.pushedHash === hash) {
    c.unchanged++;
    return "unchanged" as const;
  }
  // Most recent edit wins.
  if (link) {
    const mondayAt = mondayUpdatedNow === undefined ? (await fetchItems([link.itemId]))[0]?.updated_at : mondayUpdatedNow;
    const at = mondayAt ? new Date(mondayAt) : null;
    if (at && at > p.appUpdatedAt && (!link.mondayUpdatedAt || at > link.mondayUpdatedAt)) {
      c.skippedNewer++;
      log(`  ↓ ${entityType} ${p.name}: Monday changed more recently; pull will win`);
      return "skippedNewer" as const;
    }
  }
  if (opts.dryRun) {
    log(`  ${link ? "update" : "create"} ${p.boardKey} item for ${entityType} ${p.name}: ${Object.keys(p.values).join(", ")}${p.groupId ? ` → group ${p.groupId}` : ""}`);
    if (link) c.written++;
    else c.created++;
    return link ? ("written" as const) : ("created" as const);
  }
  if (link) {
    await writeColumns(boardId, link.itemId, { ...p.values, name: p.name });
    if (p.groupId) await moveToGroup(link.itemId, p.groupId);
    await recordWrite(true, boardId, link.itemId, entityType, entityId, p.values, hash);
    c.written++;
    return "written" as const;
  }
  const itemId = await createItem(boardId, p.name, p.values, p.groupId ?? undefined);
  await recordWrite(false, boardId, itemId, entityType, entityId, p.values, hash);
  c.created++;
  return "created" as const;
}

async function linkFor(entityType: EntityType, entityId: string, boardKey: BoardKey) {
  return prisma.mondayLink.findFirst({ where: { boardId: BOARDS[boardKey], entityType, entityId }, select: { id: true, itemId: true, mondayUpdatedAt: true, pushedHash: true } });
}

export async function pushMusician(id: string, opts: PushOptions = {}, c: Counts = counts(), mondayUpdatedNow?: Date | null) {
  return pushOne("Musician", id, await musicianPayload(id), await linkFor("Musician", id, "entertainers"), opts, c, mondayUpdatedNow);
}
export async function pushFacility(id: string, opts: PushOptions = {}, c: Counts = counts(), mondayUpdatedNow?: Date | null) {
  return pushOne("Facility", id, await facilityPayload(id), await linkFor("Facility", id, "clients"), opts, c, mondayUpdatedNow);
}
export async function pushEvent(id: string, opts: PushOptions = {}, c: Counts = counts(), mondayUpdatedNow?: Date | null) {
  return pushOne("EventRequest", id, await eventPayload(id, opts), await linkFor("EventRequest", id, "gigs"), opts, c, mondayUpdatedNow);
}

/**
 * Push every record that changed since it was last pushed (or has never been pushed and is allowed to be created).
 * Cheap to run every few minutes: unchanged payloads cost one hash comparison and no API call; the
 * "is Monday newer?" check for the rest is batched 100 items per query.
 */
export async function pushDirty(opts: PushOptions = {}): Promise<PushReport> {
  const report: PushReport = { ranAt: new Date().toISOString(), dryRun: Boolean(opts.dryRun), musicians: counts(), facilities: counts(), events: counts() };
  const log = opts.log ?? (() => {});

  type Dirty = { id: string; itemId: string | null };
  const dirtyIds = async (entityType: EntityType, boardId: string, updatedAtOf: (ids: string[]) => Promise<{ id: string; updatedAt: Date }[]>, unlinkedIds: (linked: string[]) => Promise<string[]>): Promise<Dirty[]> => {
    const links = await prisma.mondayLink.findMany({ where: { boardId, entityType } });
    const byEntity = new Map(links.map((l) => [l.entityId, l]));
    const rows = await updatedAtOf([...byEntity.keys()]);
    const dirty = rows.filter((r) => {
      const l = byEntity.get(r.id)!;
      return !l.pushedAt || r.updatedAt > l.pushedAt;
    }).map((r) => ({ id: r.id, itemId: byEntity.get(r.id)!.itemId }));
    const fresh = opts.allowCreate ? (await unlinkedIds([...byEntity.keys()])).map((id) => ({ id, itemId: null })) : [];
    return [...dirty, ...fresh];
  };

  const run = async (entityType: EntityType, list: Dirty[], fn: (id: string, mondayNow: Date | null) => Promise<unknown>, c: Counts) => {
    // One batched read of Monday's updated_at for every linked candidate.
    const mondayNow = new Map<string, Date>();
    const itemIds = list.map((d) => d.itemId).filter((x): x is string => Boolean(x));
    for (let i = 0; i < itemIds.length; i += 100) for (const it of await fetchItems(itemIds.slice(i, i + 100))) mondayNow.set(it.id, new Date(it.updated_at));
    for (const d of list) {
      try {
        await fn(d.id, d.itemId ? (mondayNow.get(d.itemId) ?? null) : null);
      } catch (e) {
        const msg = `${entityType} ${d.id}: ${e instanceof Error ? e.message : String(e)}`;
        c.errors.push(msg);
        log(`  ✗ ${msg}`);
        await prisma.mondaySyncLog.create({ data: { direction: "PUSH", boardId: "", entityType, entityId: d.id, action: "error", error: msg } }).catch(() => {});
      }
    }
  };

  log("▶ musicians");
  const musicians = await dirtyIds("Musician", BOARDS.entertainers,
    (ids) => prisma.musician.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true } }),
    (linked) => prisma.musician.findMany({ where: { id: { notIn: linked }, status: { in: ["APPROVED", "ACTIVE"] } }, select: { id: true } }).then((r) => r.map((x) => x.id)));
  await run("Musician", musicians, (id, now) => pushMusician(id, opts, report.musicians, now), report.musicians);

  log("▶ facilities");
  const facilities = await dirtyIds("Facility", BOARDS.clients,
    (ids) => prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true } }),
    (linked) => prisma.facility.findMany({ where: { id: { notIn: linked }, status: "ACTIVE" }, select: { id: true } }).then((r) => r.map((x) => x.id)));
  await run("Facility", facilities, (id, now) => pushFacility(id, opts, report.facilities, now), report.facilities);

  log("▶ events");
  // A booking's state lives on the selected Match, so its updatedAt counts too.
  const events = await dirtyIds("EventRequest", BOARDS.gigs,
    async (ids) => {
      const rows = await prisma.eventRequest.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true, matches: { where: { selected: true }, select: { updatedAt: true } } } });
      return rows.map((r) => ({ id: r.id, updatedAt: new Date(Math.max(r.updatedAt.getTime(), ...r.matches.map((m) => m.updatedAt.getTime()))) }));
    },
    (linked) => prisma.eventRequest.findMany({ where: { id: { notIn: linked }, source: "APP", status: { notIn: ["SUBMITTED", "NEEDS_INFORMATION"] } }, select: { id: true } }).then((r) => r.map((x) => x.id)));
  await run("EventRequest", events, (id, now) => pushEvent(id, opts, report.events, now), report.events);

  for (const [k, c] of Object.entries({ musicians: report.musicians, facilities: report.facilities, events: report.events })) {
    log(`  ${k}: ${c.candidates} candidates · ${c.written} written · ${c.created} created · ${c.unchanged} unchanged · ${c.skippedNewer} newer in Monday · ${c.errors.length} errors`);
  }
  return report;
}
