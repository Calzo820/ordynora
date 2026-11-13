-- One external sale/order represents the complete table session, not a single
-- QR submission. This keeps additions from multiple phones on the same table
-- inside the same idempotent POS entity.
ALTER TABLE "TableSession"
  ADD COLUMN "integrationRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "integrationSyncedRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "integrationSyncStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN "integrationLastError" TEXT,
  ADD COLUMN "integrationSyncedAt" TIMESTAMP(3);

CREATE INDEX "TableSession_restaurantId_integrationSyncStatus_updatedAt_idx"
  ON "TableSession"("restaurantId", "integrationSyncStatus", "updatedAt");
