-- Portal logins: a User may be bound to exactly one Musician or one Facility.
ALTER TYPE "UserRole" ADD VALUE 'MUSICIAN';
ALTER TYPE "UserRole" ADD VALUE 'FACILITY';

ALTER TABLE "User" ADD COLUMN "musicianId" TEXT;
ALTER TABLE "User" ADD COLUMN "facilityId" TEXT;

CREATE UNIQUE INDEX "User_musicianId_key" ON "User"("musicianId");
CREATE UNIQUE INDEX "User_facilityId_key" ON "User"("facilityId");

ALTER TABLE "User" ADD CONSTRAINT "User_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
