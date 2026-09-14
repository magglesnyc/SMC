/**
 * Thin Monday.com GraphQL client. No SDK: one fetch with retry on rate limits and transient errors.
 * The token belongs to whichever Monday user set the sync up (see docs/MONDAY.md); never log it.
 */

const API_URL = "https://api.monday.com/v2";
const API_VERSION = "2025-01";

export class MondayError extends Error {
  constructor(message: string, public readonly errors?: unknown[], public readonly status?: number) {
    super(message);
    this.name = "MondayError";
  }
}

export function mondayEnabled(): boolean {
  return Boolean(process.env.MONDAY_API_TOKEN);
}

function token(): string {
  const t = process.env.MONDAY_API_TOKEN;
  if (!t) throw new MondayError("MONDAY_API_TOKEN is not set");
  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one GraphQL operation. Retries 429 / complexity limits / 5xx with backoff, up to 5 attempts. */
export async function mondayQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token(), "API-Version": API_VERSION },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt * 2;
        lastErr = new MondayError(`Monday API HTTP ${res.status}`, undefined, res.status);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new MondayError("Monday API rejected the token (401/403). Regenerate MONDAY_API_TOKEN and re-run the webhook setup.", undefined, res.status);
      const json = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string; retry_in_seconds?: number } }[] };
      if (json.errors?.length) {
        const limited = json.errors.find((e) => /complexity|rate limit/i.test(e.message) || e.extensions?.code === "ComplexityException");
        if (limited) {
          lastErr = new MondayError(limited.message, json.errors);
          await sleep((limited.extensions?.retry_in_seconds ?? 2 ** attempt * 5) * 1000);
          continue;
        }
        throw new MondayError(json.errors.map((e) => e.message).join("; "), json.errors);
      }
      if (!json.data) throw new MondayError("Monday API returned no data");
      return json.data;
    } catch (e) {
      if (e instanceof MondayError && e.status !== undefined && e.status < 500 && e.status !== 429) throw e;
      if (e instanceof MondayError && e.errors && !/complexity|rate limit/i.test(e.message)) throw e;
      lastErr = e;
      await sleep(2 ** attempt * 1000);
    }
  }
  throw lastErr instanceof Error ? lastErr : new MondayError(String(lastErr));
}

// ───────────────────────── Items ─────────────────────────

export interface MondayColumnValue {
  id: string;
  type: string;
  text: string | null;
  /** Raw JSON string of the column value; shape depends on `type`. */
  value: string | null;
  /** Mirror and board-relation columns: the rendered text. `text` is empty for these. */
  display_value?: string | null;
  linked_item_ids?: string[];
}

export interface MondayItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  group: { id: string; title: string };
  column_values: MondayColumnValue[];
}

const ITEM_FIELDS = `
  id name created_at updated_at
  group { id title }
  column_values {
    id type text value
    ... on MirrorValue { display_value }
    ... on BoardRelationValue { display_value linked_item_ids }
  }
`;

/** Stream every item on a board, 100 at a time. */
export async function* iterateBoardItems(boardId: string, pageSize = 100): AsyncGenerator<MondayItem> {
  type Page = { cursor: string | null; items: MondayItem[] };
  const first = await mondayQuery<{ boards: { items_page: Page }[] }>(
    `query($board: [ID!], $limit: Int!) { boards(ids: $board) { items_page(limit: $limit) { cursor items { ${ITEM_FIELDS} } } } }`,
    { board: [boardId], limit: pageSize },
  );
  let page: Page | undefined = first.boards[0]?.items_page;
  while (page) {
    for (const item of page.items) yield item;
    if (!page.cursor) break;
    const next: { next_items_page: Page } = await mondayQuery(
      `query($cursor: String!, $limit: Int!) { next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${ITEM_FIELDS} } } }`,
      { cursor: page.cursor, limit: pageSize },
    );
    page = next.next_items_page;
  }
}

export async function fetchBoardItems(boardId: string): Promise<MondayItem[]> {
  const out: MondayItem[] = [];
  for await (const item of iterateBoardItems(boardId)) out.push(item);
  return out;
}

/** Fetch specific items by id (webhooks deliver ids, not payloads). */
export async function fetchItems(ids: string[]): Promise<MondayItem[]> {
  if (!ids.length) return [];
  const data = await mondayQuery<{ items: MondayItem[] }>(`query($ids: [ID!]) { items(ids: $ids) { ${ITEM_FIELDS} } }`, { ids });
  return data.items;
}

export interface MondayBoardMeta {
  id: string;
  name: string;
  state: string;
  items_count: number;
  workspace: { id: string; name: string } | null;
  groups: { id: string; title: string }[];
  columns: { id: string; title: string; type: string; settings_str: string }[];
}

export async function fetchBoardMeta(boardIds: string[]): Promise<MondayBoardMeta[]> {
  const data = await mondayQuery<{ boards: MondayBoardMeta[] }>(
    `query($ids: [ID!]) { boards(ids: $ids) { id name state items_count workspace { id name } groups { id title } columns { id title type settings_str } } }`,
    { ids: boardIds },
  );
  return data.boards;
}

export async function fetchWorkspaceBoards(workspaceId: string): Promise<MondayBoardMeta[]> {
  const data = await mondayQuery<{ boards: MondayBoardMeta[] }>(
    `query($ws: [ID!]) { boards(workspace_ids: $ws, limit: 100, state: all) { id name state items_count workspace { id name } groups { id title } columns { id title type settings_str } } }`,
    { ws: [workspaceId] },
  );
  return data.boards;
}

/** Item updates (the comment thread on each item). Used by the legacy export so nothing is lost. */
export async function fetchItemUpdates(itemIds: string[]): Promise<Record<string, { id: string; body: string; text_body: string; created_at: string; creator: { name: string } | null }[]>> {
  const out: Record<string, { id: string; body: string; text_body: string; created_at: string; creator: { name: string } | null }[]> = {};
  for (let i = 0; i < itemIds.length; i += 50) {
    const chunk = itemIds.slice(i, i + 50);
    const data = await mondayQuery<{ items: { id: string; updates: { id: string; body: string; text_body: string; created_at: string; creator: { name: string } | null }[] }[] }>(
      `query($ids: [ID!]) { items(ids: $ids) { id updates(limit: 100) { id body text_body created_at creator { name } } } }`,
      { ids: chunk },
    );
    for (const it of data.items) if (it.updates.length) out[it.id] = it.updates;
  }
  return out;
}

export async function whoAmI(): Promise<{ name: string; email: string; account: string }> {
  const data = await mondayQuery<{ me: { name: string; email: string; account: { name: string } } }>(`{ me { name email account { name } } }`);
  return { name: data.me.name, email: data.me.email, account: data.me.account.name };
}

// ───────────────────────── Column value helpers ─────────────────────────

export function colText(item: MondayItem, columnId: string): string {
  const c = item.column_values.find((v) => v.id === columnId);
  if (!c) return "";
  return (c.display_value ?? c.text ?? "").trim();
}

export function colValue<T = unknown>(item: MondayItem, columnId: string): T | null {
  const c = item.column_values.find((v) => v.id === columnId);
  if (!c?.value) return null;
  try {
    return JSON.parse(c.value) as T;
  } catch {
    return null;
  }
}

export function colLinkedIds(item: MondayItem, columnId: string): string[] {
  const c = item.column_values.find((v) => v.id === columnId);
  if (c?.linked_item_ids?.length) return c.linked_item_ids.map(String);
  const v = colValue<{ linkedPulseIds?: { linkedPulseId: number }[] }>(item, columnId);
  return (v?.linkedPulseIds ?? []).map((l) => String(l.linkedPulseId));
}

/** Date column → "YYYY-MM-DD" or null. */
export function colDate(item: MondayItem, columnId: string): string | null {
  const v = colValue<{ date?: string }>(item, columnId);
  if (v?.date) return v.date;
  const t = colText(item, columnId);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

export function colNumber(item: MondayItem, columnId: string): number | null {
  const t = colText(item, columnId).replace(/[$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Dropdown / multi-select → labels. */
export function colList(item: MondayItem, columnId: string): string[] {
  return colText(item, columnId)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** File column → URLs. */
export function colFiles(item: MondayItem, columnId: string): string[] {
  return colText(item, columnId)
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
}
