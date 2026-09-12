import "dotenv/config";
import { spawnSync } from "node:child_process";
import { prisma } from "../lib/db";

/**
 * First-boot helper for hosted demos (Railway): when DEMO_MODE=true and the
 * database has no users yet, run the full demo seed once. Safe to run on
 * every start; it does nothing once data exists.
 */
async function main() {
  if (process.env.DEMO_MODE !== "true") return;
  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`seed-if-empty: ${users} user(s) present, skipping seed.`);
    return;
  }
  console.log("seed-if-empty: empty database, running demo seed…");
  const r = spawnSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit", shell: true });
  if (r.status !== 0) throw new Error(`seed exited with ${r.status}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
