import "dotenv/config";
import { prisma } from "../lib/db";
import { pushDirty } from "../lib/monday/push";
import { whoAmI } from "../lib/monday/client";

/**
 * App → Monday push of everything changed since it was last pushed.
 *   npm run monday:push -- --dry-run       show what would be written
 *   npm run monday:push                    write updates to already-linked items
 *   npm run monday:push -- --create        also create Monday items for app records that have none (approved
 *                                          musicians, active facilities, app-originated events)
 */
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);

async function main() {
  const me = await whoAmI();
  console.log(`Monday: ${me.account} as ${me.name} <${me.email}>`);
  const report = await pushDirty({ dryRun: flag("dry-run"), allowCreate: flag("create"), log: (l) => console.log(l) });
  console.log(`\n${report.dryRun ? "DRY RUN — nothing written" : "Done"} at ${report.ranAt}`);
  const errors = [...report.musicians.errors, ...report.facilities.errors, ...report.events.errors];
  if (errors.length) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
