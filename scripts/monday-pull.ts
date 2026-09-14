import "dotenv/config";
import { prisma } from "../lib/db";
import { pullFromMonday } from "../lib/monday/pull";
import { whoAmI } from "../lib/monday/client";
import type { BoardKey } from "../lib/monday/boards";

/**
 * Monday → app pull.
 *   npm run monday:pull -- --dry-run            preview every change without writing
 *   npm run monday:pull -- --boards=entertainers,clients
 *   npm run monday:pull -- --full               ignore the updated_at watermark and re-read every item
 */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  const me = await whoAmI();
  console.log(`Monday: ${me.account} as ${me.name} <${me.email}>`);
  const report = await pullFromMonday({
    dryRun: flag("dry-run"),
    incremental: !flag("full"),
    boards: opt("boards")?.split(",").map((s) => s.trim() as BoardKey),
    log: (line) => console.log(line),
  });
  console.log(`\n${report.dryRun ? "DRY RUN — nothing written" : "Done"} at ${report.ranAt}`);
  const errors = Object.values(report.boards).flatMap((b) => b?.errors ?? []);
  if (errors.length) {
    console.log(`\n${errors.length} item(s) could not be imported:`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
