-- Add resilient per-order synchronization state.
ALTER TABLE "Order"
  ADD COLUMN "integrationRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "integrationSyncedRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "integrationSyncStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN "integrationLastError" TEXT,
  ADD COLUMN "integrationSyncedAt" TIMESTAMP(3);

-- Add a recoverable lease to integration jobs. A crashed Render instance can
-- safely release stale jobs without creating a second provider order.
ALTER TABLE "PosIntegrationJob"
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockToken" TEXT;

CREATE INDEX "Order_restaurantId_integrationSyncStatus_updatedAt_idx"
  ON "Order"("restaurantId", "integrationSyncStatus", "updatedAt");

CREATE INDEX "PosIntegrationJob_status_lockedAt_idx"
  ON "PosIntegrationJob"("status", "lockedAt");
