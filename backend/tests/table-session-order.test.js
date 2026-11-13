import test from "node:test";
import assert from "node:assert/strict";
import { buildTableSessionOrder, tableSessionOrderIds } from "../lib/tableSessionOrder.js";

const session = {
  id: "session-1",
  restaurantId: "restaurant-1",
  tableId: "table-1",
  openedAt: new Date("2026-10-18T18:00:00.000Z"),
  integrationRevision: 4,
  integrationSyncStatus: "queued",
  orders: [
    {
      id: "order-1",
      orderNumber: 10,
      status: "served",
      createdAt: new Date("2026-10-18T18:01:00.000Z"),
      updatedAt: new Date("2026-10-18T18:10:00.000Z"),
      guestCount: 2,
      coverCharge: 2,
      coverChargePerGuest: true,
      discountPercent: 0,
      discountAmount: 0,
      extraAmount: 0,
      items: [{ id: "item-1", menuItemId: "pizza", quantity: 1, priceSnapshot: 10, status: "active" }],
      payments: [],
    },
    {
      id: "order-2",
      orderNumber: 11,
      status: "pending",
      createdAt: new Date("2026-10-18T18:20:00.000Z"),
      updatedAt: new Date("2026-10-18T18:21:00.000Z"),
      billConfiguredAt: new Date("2026-10-18T18:22:00.000Z"),
      guestCount: 2,
      // Simula anche dati storici che avevano duplicato il coperto.
      coverCharge: 2,
      coverChargePerGuest: true,
      discountPercent: 10,
      discountAmount: 1,
      extraAmount: 2,
      items: [{ id: "item-2", menuItemId: "acqua", quantity: 2, priceSnapshot: 3, status: "active" }],
      payments: [{ id: "payment-1", status: "paid", amount: 5 }],
    },
  ],
};

test("a table session becomes one bill without duplicating cover charges", () => {
  const bill = buildTableSessionOrder(session, { preferredOrderId: "order-2" });
  assert.equal(bill.id, "order-2");
  assert.deepEqual(tableSessionOrderIds(bill), ["order-1", "order-2"]);
  assert.equal(bill.orderCount, 2);
  assert.equal(bill.status, "pending");
  assert.equal(bill.coverCharge, 2);
  assert.equal(bill.items.filter((item) => item.virtualSessionExtra).length, 1);
  // 10 + 6 + 2 extra + 4 coperto = 22; sconto 10% = 19,80.
  assert.equal(bill.totalAmount, 19.8);
  assert.equal(bill.discountAmount, 2.2);
  assert.equal(bill.paymentStatus, "pending");
});

test("the POS identity is stable for all orders in the same session", () => {
  const first = buildTableSessionOrder(session, { preferredOrderId: "order-1", externalIdentity: true });
  const second = buildTableSessionOrder(session, { preferredOrderId: "order-2", externalIdentity: true });
  assert.equal(first.id, "session-1");
  assert.equal(second.id, "session-1");
  assert.equal(first.integrationRevision, 4);
});
