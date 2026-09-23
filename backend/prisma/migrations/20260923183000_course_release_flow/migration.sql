ALTER TABLE "OrderItem"
ADD COLUMN "releasedAt" TIMESTAMP(3);

-- Gli ordini già presenti erano tutti visibili ai reparti: manteniamo quel
-- comportamento durante il deploy, senza nascondere comande in corso.
UPDATE "OrderItem"
SET "releasedAt" = "createdAt"
WHERE "releasedAt" IS NULL;

CREATE INDEX "OrderItem_orderId_status_courseNumber_releasedAt_idx"
ON "OrderItem"("orderId", "status", "courseNumber", "releasedAt");
