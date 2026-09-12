-- CreateEnum
CREATE TYPE "CalendarOwnerType" AS ENUM ('MUSICIAN', 'FACILITY');

-- CreateTable
CREATE TABLE "CalendarToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ownerType" "CalendarOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarToken_tokenHash_key" ON "CalendarToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CalendarToken_ownerType_ownerId_idx" ON "CalendarToken"("ownerType", "ownerId");
