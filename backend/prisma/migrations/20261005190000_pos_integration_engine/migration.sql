-- CreateEnum
CREATE TYPE "PosProvider" AS ENUM ('tilby', 'teamsystem_cassa_in_cloud', 'passepartout_menu');

-- CreateEnum
CREATE TYPE "PosIntegrationStatus" AS ENUM ('draft', 'pending_partner', 'testing', 'connected', 'degraded', 'disabled');

-- CreateEnum
CREATE TYPE "IntegrationDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "IntegrationJobStatus" AS ENUM ('pending', 'processing', 'retrying', 'succeeded', 'failed', 'blocked');

-- CreateTable
CREATE TABLE "PosIntegration" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" "PosProvider" NOT NULL,
    "status" "PosIntegrationStatus" NOT NULL DEFAULT 'draft',
    "encryptedCredentials" TEXT,
    "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosIntegrationMapping" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosIntegrationMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosIntegrationJob" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "direction" "IntegrationDirection" NOT NULL DEFAULT 'outbound',
    "status" "IntegrationJobStatus" NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "externalId" TEXT,
    "payload" JSONB,
    "responseMeta" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosIntegrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosIntegration_restaurantId_key" ON "PosIntegration"("restaurantId");

-- CreateIndex
CREATE INDEX "PosIntegration_provider_status_idx" ON "PosIntegration"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PosIntegrationMapping_integrationId_entityType_localId_key" ON "PosIntegrationMapping"("integrationId", "entityType", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "PosIntegrationMapping_integrationId_entityType_externalId_key" ON "PosIntegrationMapping"("integrationId", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "PosIntegrationMapping_integrationId_entityType_idx" ON "PosIntegrationMapping"("integrationId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "PosIntegrationJob_idempotencyKey_key" ON "PosIntegrationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PosIntegrationJob_integrationId_status_nextAttemptAt_idx" ON "PosIntegrationJob"("integrationId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PosIntegrationJob_entityType_entityId_idx" ON "PosIntegrationJob"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "PosIntegration" ADD CONSTRAINT "PosIntegration_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosIntegrationMapping" ADD CONSTRAINT "PosIntegrationMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "PosIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosIntegrationJob" ADD CONSTRAINT "PosIntegrationJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "PosIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
