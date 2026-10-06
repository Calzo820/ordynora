-- Ordynora can run as the complete management system or as the operational
-- layer in front of an external POS. Existing restaurants stay in full mode,
-- except restaurants with an already active POS integration.
CREATE TYPE "RestaurantOperationMode" AS ENUM ('full', 'integrated');
CREATE TYPE "SettlementSource" AS ENUM ('ordynora', 'external_pos');

ALTER TABLE "Restaurant"
ADD COLUMN "operationMode" "RestaurantOperationMode" NOT NULL DEFAULT 'full';

ALTER TABLE "Order"
ADD COLUMN "billRequestedAt" TIMESTAMP(3),
ADD COLUMN "settlementSource" "SettlementSource" NOT NULL DEFAULT 'ordynora';

UPDATE "Restaurant" AS restaurant
SET "operationMode" = 'integrated'
FROM "PosIntegration" AS integration
WHERE integration."restaurantId" = restaurant."id"
  AND integration."status" <> 'disabled';

CREATE INDEX "Restaurant_operationMode_idx" ON "Restaurant"("operationMode");
CREATE INDEX "Order_restaurantId_settlementSource_closedAt_idx"
ON "Order"("restaurantId", "settlementSource", "closedAt");
