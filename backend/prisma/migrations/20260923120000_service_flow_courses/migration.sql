ALTER TABLE "OrderItem"
ADD COLUMN "courseNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "preparationStartedAt" TIMESTAMP(3),
ADD COLUMN "preparationReadyAt" TIMESTAMP(3);

CREATE INDEX "OrderItem_preparationArea_preparationReadyAt_idx"
ON "OrderItem"("preparationArea", "preparationReadyAt");
