-- Indici multi-tenant per mantenere rapide le query operative con 100+ ristoranti.
-- CONCURRENTLY non viene usato perche Prisma esegue le migration in transazione.

CREATE INDEX IF NOT EXISTS "User_restaurantId_isActive_role_idx"
  ON "User"("restaurantId", "isActive", "role");

CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_isDeleted_isAvailable_sortOrder_idx"
  ON "MenuItem"("restaurantId", "isDeleted", "isAvailable", "sortOrder");
CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_category_sortOrder_idx"
  ON "MenuItem"("restaurantId", "category", "sortOrder");

CREATE INDEX IF NOT EXISTS "Table_restaurantId_isActive_sortOrder_idx"
  ON "Table"("restaurantId", "isActive", "sortOrder");

CREATE INDEX IF NOT EXISTS "Reservation_restaurantId_status_date_idx"
  ON "Reservation"("restaurantId", "status", "date");

CREATE INDEX IF NOT EXISTS "TableSession_restaurantId_status_openedAt_idx"
  ON "TableSession"("restaurantId", "status", "openedAt");
CREATE INDEX IF NOT EXISTS "TableSession_tableId_status_openedAt_idx"
  ON "TableSession"("tableId", "status", "openedAt");

CREATE INDEX IF NOT EXISTS "Order_restaurantId_createdAt_idx"
  ON "Order"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_restaurantId_status_closedAt_createdAt_idx"
  ON "Order"("restaurantId", "status", "closedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_restaurantId_paymentStatus_createdAt_idx"
  ON "Order"("restaurantId", "paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_tableId_closedAt_status_createdAt_idx"
  ON "Order"("tableId", "closedAt", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_tableSessionId_status_idx"
  ON "Order"("tableSessionId", "status");

CREATE INDEX IF NOT EXISTS "OrderItem_orderId_status_preparationArea_preparationStatus_idx"
  ON "OrderItem"("orderId", "status", "preparationArea", "preparationStatus");
CREATE INDEX IF NOT EXISTS "OrderItem_menuItemId_createdAt_idx"
  ON "OrderItem"("menuItemId", "createdAt");

CREATE INDEX IF NOT EXISTS "PaymentTransaction_restaurantId_status_createdAt_idx"
  ON "PaymentTransaction"("restaurantId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "OrderStatusHistory_orderId_createdAt_idx"
  ON "OrderStatusHistory"("orderId", "createdAt");

CREATE INDEX IF NOT EXISTS "SaaSSubscription_status_currentPeriodEnd_idx"
  ON "SaaSSubscription"("status", "currentPeriodEnd");

CREATE INDEX IF NOT EXISTS "ErrorLog_restaurantId_resolvedAt_createdAt_idx"
  ON "ErrorLog"("restaurantId", "resolvedAt", "createdAt");
