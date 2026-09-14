import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toCsv } from "../lib/utils";
import { LEGACY_BOARDS, LEGACY_WORKSPACE_ID } from "../lib/monday/boards";
import { fetchBoardItems, fetchBoardMeta, fetchItemUpdates, fetchWorkspaceBoards, whoAmI, type MondayItem } from "../lib/monday/client";

/**
 * Full export of the retired Monday workspace so it can be archived without losing anything:
 * every board's columns, groups, items (all column values, raw and rendered), and item updates
 * (the comment threads). Writes JSON per board plus a flat CSV, under exports/monday-legacy/<date>/.
 *
 *   npm run monday:export-legacy
 *   npm run monday:export-legacy -- --boards=5834314429,5940969562   (specific boards)
 *   MONDAY_LEGACY_WORKSPACE_ID=<id> npm run monday:export-legacy      (every board in a workspace)
 */
const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  const me = await whoAmI();
  console.log(`Monday: ${me.account} as ${me.name}`);
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = join(process.cwd(), "exports", "monday-legacy", stamp);
  mkdirSync(outDir, { recursive: true });

  const boardIds = opt("boards")?.split(",") ?? (LEGACY_WORKSPACE_ID ? (await fetchWorkspaceBoards(LEGACY_WORKSPACE_ID)).map((b) => b.id) : Object.values(LEGACY_BOARDS));
  const metas = await fetchBoardMeta(boardIds);
  const summary: { board: string; id: string; items: number; updates: number; file: string }[] = [];

  for (const meta of metas) {
    process.stdout.write(`${meta.name} (${meta.id}) … `);
    const items = await fetchBoardItems(meta.id);
    const updates = await fetchItemUpdates(items.map((i) => i.id));
    const slug = `${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${meta.id}`;
    const columnsById = Object.fromEntries(meta.columns.map((c) => [c.id, c]));

    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify({ exportedAt: new Date().toISOString(), board: meta, items: items.map((it) => ({ ...it, updates: updates[it.id] ?? [] })) }, null, 2));

    // Flat CSV: one row per item, one column per board column (rendered text), plus the updates joined.
    const rows = items.map((it) => flatten(it, meta.columns, updates[it.id] ?? []));
    writeFileSync(join(outDir, `${slug}.csv`), toCsv(rows, ["item_id", "name", "group", "created_at", "updated_at", ...meta.columns.filter((c) => c.id !== "name").map((c) => c.title), "updates"]));

    const updateCount = Object.values(updates).reduce((n, u) => n + u.length, 0);
    summary.push({ board: meta.name, id: meta.id, items: items.length, updates: updateCount, file: `${slug}.json` });
    console.log(`${items.length} items, ${updateCount} updates`);
    void columnsById;
  }

  writeFileSync(join(outDir, "README.md"), readme(me.account, summary));
  console.log(`\nExported ${summary.length} board(s) to ${outDir}`);
}

function flatten(item: MondayItem, columns: { id: string; title: string }[], updates: { text_body: string; created_at: string; creator: { name: string } | null }[]) {
  const row: Record<string, unknown> = { item_id: item.id, name: item.name, group: item.group.title, created_at: item.created_at, updated_at: item.updated_at };
  for (const c of columns) {
    if (c.id === "name") continue;
    const v = item.column_values.find((cv) => cv.id === c.id);
    row[c.title] = v?.display_value ?? v?.text ?? "";
  }
  row.updates = updates.map((u) => `[${u.created_at.slice(0, 10)} ${u.creator?.name ?? "?"}] ${u.text_body}`).join("\n---\n");
  return row;
}

function readme(account: string, summary: { board: string; id: string; items: number; updates: number; file: string }[]) {
  return [
    `# Monday export — ${account}`,
    "",
    `Exported ${new Date().toISOString()} from the retired "Senior Music Connection" workspace before it was archived.`,
    "Each board has a JSON file (complete: board schema, every item with raw and rendered column values, item updates)",
    "and a CSV (one row per item, rendered text only). File attachments are referenced by URL and still require a Monday login.",
    "",
    "| Board | Board id | Items | Updates | File |",
    "|---|---|---|---|---|",
    ...summary.map((s) => `| ${s.board} | ${s.id} | ${s.items} | ${s.updates} | ${s.file} |`),
    "",
  ].join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
