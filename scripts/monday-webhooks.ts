import "dotenv/config";
import { BOARDS, BOARD_LABELS, type BoardKey } from "../lib/monday/boards";
import { mondayQuery, whoAmI } from "../lib/monday/client";

/**
 * Register (or re-register) Monday webhooks that point at this app. Webhooks belong to the token that created
 * them, so run this again after swapping MONDAY_API_TOKEN to a new user.
 *
 *   npm run monday:webhooks -- --list
 *   npm run monday:webhooks -- --url https://<app>/api/monday/webhook      (uses MONDAY_WEBHOOK_SECRET from env)
 *   npm run monday:webhooks -- --remove                                     (remove every webhook pointing at APP_BASE_URL)
 */
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");

const SYNCED: BoardKey[] = ["entertainers", "clients", "bookingRequests", "gigs", "facilityFeedback", "entertainerFeedback", "applications"];
const EVENTS = ["create_item", "change_column_value", "change_name", "item_moved_to_any_group", "item_archived", "item_deleted"] as const;

interface Webhook { id: string; event: string; board_id: string; config: string | null }

async function listWebhooks(boardId: string): Promise<Webhook[]> {
  const d = await mondayQuery<{ webhooks: Webhook[] }>(`query($b: ID!) { webhooks(board_id: $b) { id event board_id config } }`, { b: boardId });
  return d.webhooks;
}

async function main() {
  const me = await whoAmI();
  console.log(`Monday: ${me.account} as ${me.name} <${me.email}>`);
  const url = opt("url");
  const baseUrl = process.env.APP_BASE_URL ?? "";

  if (flag("list")) {
    for (const key of SYNCED) {
      const hooks = await listWebhooks(BOARDS[key]);
      console.log(`${BOARD_LABELS[key]} (${BOARDS[key]}): ${hooks.length ? "" : "no webhooks"}`);
      for (const h of hooks) console.log(`  #${h.id} ${h.event}`);
    }
    return;
  }

  if (flag("remove")) {
    let n = 0;
    for (const key of SYNCED) {
      for (const h of await listWebhooks(BOARDS[key])) {
        await mondayQuery(`mutation($id: ID!) { delete_webhook(id: $id) { id } }`, { id: h.id });
        n++;
      }
    }
    console.log(`Removed ${n} webhook(s) from ${SYNCED.length} boards.`);
    return;
  }

  if (!url) {
    console.error("Pass --url=https://<app>/api/monday/webhook, --list or --remove");
    process.exit(1);
  }
  const secret = process.env.MONDAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error(`MONDAY_WEBHOOK_SECRET is not set; generate one (node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"), set it on the app and here, then re-run.`);
    process.exit(1);
  }
  const target = `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(secret)}`;
  if (!/^https:\/\//.test(target) && !target.startsWith("http://localhost")) console.warn("Warning: Monday requires an https URL it can reach.");
  void baseUrl;

  for (const key of SYNCED) {
    const boardId = BOARDS[key];
    // Replace anything this token already registered on the board so the set is exact.
    for (const h of await listWebhooks(boardId)) await mondayQuery(`mutation($id: ID!) { delete_webhook(id: $id) { id } }`, { id: h.id });
    const made: string[] = [];
    for (const event of EVENTS) {
      try {
        const d = await mondayQuery<{ create_webhook: { id: string } }>(`mutation($b: ID!, $u: String!, $e: WebhookEventType!) { create_webhook(board_id: $b, url: $u, event: $e) { id } }`, { b: boardId, u: target, e: event });
        made.push(`${event}#${d.create_webhook.id}`);
      } catch (e) {
        console.error(`  ${BOARD_LABELS[key]}: ${event} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`${BOARD_LABELS[key]}: ${made.length}/${EVENTS.length} webhooks → ${made.join(", ")}`);
  }
  console.log("\nDone. The app must have MONDAY_SYNC_ENABLED=true for events to be processed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
