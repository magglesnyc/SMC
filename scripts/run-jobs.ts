import "dotenv/config";
import { prisma } from "../lib/db";
import { runDueJobs } from "../lib/services/jobs";

runDueJobs()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
