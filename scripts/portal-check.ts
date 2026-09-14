/**
 * Sanity check for the portal read models against the seeded portal logins.
 *   npx tsx scripts/portal-check.ts
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { facilityBrowseMusicians, facilityHome, musicianHome, musicianReviews, musicianVenues } from "../lib/services/portal";

async function main() {
  const users = await prisma.user.findMany({ where: { role: { in: ["FACILITY", "MUSICIAN"] } } });
  for (const u of users) {
    if (u.role === "FACILITY" && u.facilityId) {
      const h = await facilityHome(u.facilityId);
      const b = await facilityBrowseMusicians(u.facilityId);
      console.log(`FACILITY ${u.email} → ${h.facility.name}: upcoming=${h.upcoming.length} offersToConfirm=${h.upcoming.filter((x) => x.facilityResponse == null && x.status !== "CONFIRMED").length} past=${h.past.length} toRate=${h.toRate.length} openRequests=${h.requests.length} preferred=${h.preferences.length} browsable=${b.rows.length}`);
    }
    if (u.role === "MUSICIAN" && u.musicianId) {
      const h = await musicianHome(u.musicianId);
      const v = await musicianVenues(u.musicianId);
      const r = await musicianReviews(u.musicianId);
      console.log(`MUSICIAN ${u.email} → ${h.musician.firstName} ${h.musician.lastName}: offers=${h.offers.length} upcoming=${h.upcoming.length} past=${h.past.length} toRate=${h.toRate.length} venues=${v.length} ratingsReceived=${r.received.length} ratingsGiven=${r.given.length}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
