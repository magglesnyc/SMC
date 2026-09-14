-- CreateEnum
CREATE TYPE "MondaySyncDirection" AS ENUM ('PULL', 'PUSH', 'WEBHOOK');

-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN     "agreementStatus" TEXT,
ADD COLUMN     "amountCharged" DECIMAL(10,2),
ADD COLUMN     "arrivalInstructions" TEXT,
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "earlyArrivalNotes" TEXT,
ADD COLUMN     "entertainerFee" DECIMAL(10,2),
ADD COLUMN     "entertainerPaid" TEXT,
ADD COLUMN     "facilityBilled" TEXT,
ADD COLUMN     "occasion" TEXT,
ADD COLUMN     "performanceLocation" TEXT,
ADD COLUMN     "requestedEntertainer" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'APP',
ADD COLUMN     "timeText" TEXT;

-- AlterTable
ALTER TABLE "Facility" ADD COLUMN     "audienceSizeNotes" TEXT,
ADD COLUMN     "facilityPhone" TEXT;

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "testimonialOk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wouldRecommend" TEXT;

-- AlterTable
ALTER TABLE "Musician" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "birthdayMonth" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "equipmentNotes" TEXT,
ADD COLUMN     "genreNotes" TEXT,
ADD COLUMN     "groupSize" INTEGER,
ADD COLUMN     "mediaUrls" TEXT[],
ADD COLUMN     "preferredContact" TEXT,
ADD COLUMN     "rateNotes" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "themes" TEXT[],
ADD COLUMN     "travelNotes" TEXT;

-- CreateTable
CREATE TABLE "MondayLink" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "mondayUpdatedAt" TIMESTAMP(3),
    "pulledAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MondayLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MondaySyncLog" (
    "id" TEXT NOT NULL,
    "direction" "MondaySyncDirection" NOT NULL,
    "boardId" TEXT NOT NULL,
    "itemId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MondaySyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MondayEcho" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MondayEcho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MondaySyncCursor" (
    "boardId" TEXT NOT NULL,
    "lastPulledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MondaySyncCursor_pkey" PRIMARY KEY ("boardId")
);

-- CreateIndex
CREATE INDEX "MondayLink_boardId_itemId_idx" ON "MondayLink"("boardId", "itemId");

-- CreateIndex
CREATE INDEX "MondayLink_entityType_entityId_idx" ON "MondayLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "MondayLink_itemId_entityType_entityId_key" ON "MondayLink"("itemId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "MondaySyncLog_itemId_idx" ON "MondaySyncLog"("itemId");

-- CreateIndex
CREATE INDEX "MondaySyncLog_createdAt_idx" ON "MondaySyncLog"("createdAt");

-- CreateIndex
CREATE INDEX "MondayEcho_itemId_columnId_idx" ON "MondayEcho"("itemId", "columnId");

-- CreateIndex
CREATE INDEX "MondayEcho_createdAt_idx" ON "MondayEcho"("createdAt");
