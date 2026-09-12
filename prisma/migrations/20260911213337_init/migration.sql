-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "MusicianStatus" AS ENUM ('SUBMITTED', 'REVIEW', 'APPROVED', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BackgroundCheckStatus" AS ENUM ('NONE', 'PENDING', 'CLEARED', 'FAILED');

-- CreateEnum
CREATE TYPE "RateStructure" AS ENUM ('PER_EVENT', 'PER_HOUR');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PreferenceKind" AS ENUM ('PREFERRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EventRequestStatus" AS ENUM ('SUBMITTED', 'NEEDS_INFORMATION', 'READY_TO_MATCH', 'MATCHING', 'AWAITING_APPROVAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('RECOMMENDED', 'APPROVED', 'OFFERED', 'PARTIALLY_ACCEPTED', 'CONFIRMED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('DECLINED', 'CHANGE_REQUESTED', 'REMATCH_REQUIRED', 'CANCELLED', 'NO_SHOW', 'CONFLICT');

-- CreateEnum
CREATE TYPE "PartyResponse" AS ENUM ('ACCEPTED', 'DECLINED', 'CHANGE_REQUESTED');

-- CreateEnum
CREATE TYPE "RecipientRole" AS ENUM ('MUSICIAN', 'FACILITY');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('OFFER_RESPONSE', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('CLIENT', 'MUSICIAN');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('SCHEDULED', 'SENT', 'SUBMITTED', 'FOLLOW_UP_REQUIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'MUSICIAN', 'FACILITY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Musician" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "stageName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'America/Phoenix',
    "entertainmentTypes" TEXT[],
    "genres" TEXT[],
    "instruments" TEXT[],
    "offersInteractive" BOOLEAN NOT NULL DEFAULT false,
    "therapeuticQualifications" TEXT[],
    "audienceExperience" TEXT[],
    "facilityTypeExperience" TEXT[],
    "certifications" TEXT[],
    "insuranceCarrier" TEXT,
    "insurancePolicyNumber" TEXT,
    "insuranceExpiresAt" TIMESTAMP(3),
    "backgroundCheckStatus" "BackgroundCheckStatus" NOT NULL DEFAULT 'NONE',
    "backgroundCheckDate" TIMESTAMP(3),
    "programRequirementsMet" TEXT[],
    "standardRate" DECIMAL(10,2) NOT NULL,
    "rateStructure" "RateStructure" NOT NULL DEFAULT 'PER_EVENT',
    "minBookingMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxTravelMiles" INTEGER NOT NULL DEFAULT 30,
    "travelFeeApplies" BOOLEAN NOT NULL DEFAULT false,
    "weeklyAvailability" JSONB NOT NULL DEFAULT '[]',
    "blackouts" JSONB NOT NULL DEFAULT '[]',
    "completedEvents" INTEGER NOT NULL DEFAULT 0,
    "cancellations" INTEGER NOT NULL DEFAULT 0,
    "noShows" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "avgResponseHours" DOUBLE PRECISION,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "status" "MusicianStatus" NOT NULL DEFAULT 'SUBMITTED',
    "adminRestriction" TEXT,
    "restrictedUntil" TIMESTAMP(3),
    "privateNotes" TEXT,
    "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Musician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facilityType" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'America/Phoenix',
    "status" "FacilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "primaryContactName" TEXT NOT NULL,
    "primaryContactRole" TEXT,
    "primaryContactEmail" TEXT NOT NULL,
    "primaryContactPhone" TEXT,
    "secondaryContactName" TEXT,
    "secondaryContactRole" TEXT,
    "secondaryContactEmail" TEXT,
    "secondaryContactPhone" TEXT,
    "residentPopulation" TEXT,
    "typicalGroupSize" INTEGER,
    "audienceTags" TEXT[],
    "roomType" TEXT,
    "equipment" TEXT[],
    "hasPower" BOOLEAN NOT NULL DEFAULT true,
    "hasPiano" BOOLEAN NOT NULL DEFAULT false,
    "parkingNotes" TEXT,
    "loadInNotes" TEXT,
    "preferredGenres" TEXT[],
    "budgetMin" DECIMAL(10,2),
    "budgetMax" DECIMAL(10,2),
    "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "privateNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityMusicianPreference" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "musicianId" TEXT NOT NULL,
    "kind" "PreferenceKind" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityMusicianPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "facilityId" TEXT,
    "intakeFacility" JSONB,
    "startAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "setupBufferMinutes" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'America/Phoenix',
    "serviceType" TEXT NOT NULL,
    "programTags" TEXT[],
    "audienceDescription" TEXT,
    "expectedAttendance" INTEGER,
    "budgetCeiling" DECIMAL(10,2),
    "locationAddressLine1" TEXT,
    "locationCity" TEXT,
    "locationState" TEXT,
    "locationPostalCode" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "hardRequirements" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "status" "EventRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "missingFields" TEXT[],
    "ownerId" TEXT,
    "heldAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "recommendedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRun" (
    "id" TEXT NOT NULL,
    "eventRequestId" TEXT NOT NULL,
    "triggeredById" TEXT,
    "weightsSnapshot" JSONB NOT NULL,
    "thresholdsSnapshot" JSONB NOT NULL,
    "relaxations" JSONB NOT NULL DEFAULT '{}',
    "totalMusicians" INTEGER NOT NULL,
    "eligibleCount" INTEGER NOT NULL,
    "exclusionSummary" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "matchRunId" TEXT NOT NULL,
    "eventRequestId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "musicianId" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "failedFilter" TEXT,
    "score" DOUBLE PRECISION,
    "rank" INTEGER,
    "subScores" JSONB NOT NULL DEFAULT '{}',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "distanceMiles" DOUBLE PRECISION,
    "travelMinutes" INTEGER,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "musicianResponse" "PartyResponse",
    "musicianRespondedAt" TIMESTAMP(3),
    "musicianResponseNote" TEXT,
    "facilityResponse" "PartyResponse",
    "facilityRespondedAt" TIMESTAMP(3),
    "facilityResponseNote" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "exceptionStatus" "ExceptionStatus",
    "exceptionReason" TEXT,
    "offeredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "recipientRole" "RecipientRole" NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "matchId" TEXT NOT NULL,
    "eventRequestId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "musicianId" TEXT NOT NULL,
    "rating" INTEGER,
    "secondaryRatings" JSONB NOT NULL DEFAULT '{}',
    "comments" TEXT,
    "issues" TEXT[],
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNotes" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "payload" JSONB,
    "matchId" TEXT,
    "eventRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "eventRequestId" TEXT,
    "matchId" TEXT,
    "musicianId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventRequestId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "weights" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MatchingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "submissionId" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("submissionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Musician_email_idx" ON "Musician"("email");

-- CreateIndex
CREATE INDEX "Musician_status_idx" ON "Musician"("status");

-- CreateIndex
CREATE INDEX "Facility_name_idx" ON "Facility"("name");

-- CreateIndex
CREATE INDEX "Facility_primaryContactEmail_idx" ON "Facility"("primaryContactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityMusicianPreference_facilityId_musicianId_key" ON "FacilityMusicianPreference"("facilityId", "musicianId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRequest_reference_key" ON "EventRequest"("reference");

-- CreateIndex
CREATE INDEX "EventRequest_status_idx" ON "EventRequest"("status");

-- CreateIndex
CREATE INDEX "EventRequest_startAt_idx" ON "EventRequest"("startAt");

-- CreateIndex
CREATE INDEX "EventRequest_facilityId_idx" ON "EventRequest"("facilityId");

-- CreateIndex
CREATE INDEX "MatchRun_eventRequestId_idx" ON "MatchRun"("eventRequestId");

-- CreateIndex
CREATE INDEX "Match_eventRequestId_idx" ON "Match"("eventRequestId");

-- CreateIndex
CREATE INDEX "Match_musicianId_idx" ON "Match"("musicianId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Match_matchRunId_musicianId_key" ON "Match"("matchRunId", "musicianId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseToken_tokenHash_key" ON "ResponseToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ResponseToken_matchId_idx" ON "ResponseToken"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_matchId_kind_key" ON "Feedback"("matchId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_idempotencyKey_key" ON "NotificationLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationLog_eventRequestId_idx" ON "NotificationLog"("eventRequestId");

-- CreateIndex
CREATE INDEX "Alert_resolvedAt_idx" ON "Alert"("resolvedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_eventRequestId_idx" ON "AuditLog"("eventRequestId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Musician" ADD CONSTRAINT "Musician_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityMusicianPreference" ADD CONSTRAINT "FacilityMusicianPreference_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityMusicianPreference" ADD CONSTRAINT "FacilityMusicianPreference_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRun" ADD CONSTRAINT "MatchRun_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRun" ADD CONSTRAINT "MatchRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_matchRunId_fkey" FOREIGN KEY ("matchRunId") REFERENCES "MatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseToken" ADD CONSTRAINT "ResponseToken_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_eventRequestId_fkey" FOREIGN KEY ("eventRequestId") REFERENCES "EventRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingConfig" ADD CONSTRAINT "MatchingConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
