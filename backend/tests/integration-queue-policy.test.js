import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOrderCanBeCancelled,
  assertOrderContentCanChange,
  enqueueOrderSync,
  lockOrderForContentChange,
  shouldQueueProviderTrigger,
} from "../services/integrationQueue.service.js";

test("Tilby synchronizes operational changes throughout service", () => {
  for (const trigger of ["created", "status_changed", "item_changed", "extra_added", "cancelled", "bill_requested", "service_completed", "manual"]) {
    assert.equal(shouldQueueProviderTrigger("tilby", trigger), true, trigger);
  }
});

test("Cassa in Cloud exports only a consolidated order", () => {
  for (const trigger of ["bill_requested", "service_completed", "manual"]) {
    assert.equal(shouldQueueProviderTrigger("teamsystem_cassa_in_cloud", trigger), true, trigger);
  }
  for (const trigger of ["created", "status_changed", "item_changed", "extra_added", "cancelled"]) {
    assert.equal(shouldQueueProviderTrigger("teamsystem_cassa_in_cloud", trigger), false, trigger);
  }
});

test("unknown providers never create synchronization jobs", () => {
  assert.equal(shouldQueueProviderTrigger("unknown", "manual"), false);
});

test("pausing Cassa in Cloud never unlocks an already exported bill", async () => {
  const order = { id: "order-1", restaurantId: "restaurant-1", billRequestedAt: new Date() };
  const client = { posIntegration: { findUnique: async () => ({
    provider: "teamsystem_cassa_in_cloud", status: "connected", config: { syncMode: "paused" }, mappings: [{ id: "mapping-1" }],
  }) } };
  await assert.rejects(() => assertOrderContentCanChange(order, client), (error) => error.code === "EXTERNAL_ORDER_LOCKED");
  await assert.rejects(() => assertOrderCanBeCancelled(order, client), (error) => error.code === "EXTERNAL_ORDER_CANCEL_IN_POS");
});

test("a bill requested after the first screen read is rechecked under the table lock", async () => {
  const snapshot = { id: "order-1", restaurantId: "restaurant-1", tableId: "table-1", billRequestedAt: null };
  let locked = false;
  const client = {
    $queryRaw: async () => { locked = true; return [{ id: "table-1", isActive: true }]; },
    order: { findUnique: async () => {
      assert.equal(locked, true);
      return { ...snapshot, billRequestedAt: new Date() };
    } },
    posIntegration: { findUnique: async () => ({
      provider: "teamsystem_cassa_in_cloud", status: "connected", config: { syncMode: "active" }, mappings: [],
    }) },
  };
  await assert.rejects(() => lockOrderForContentChange(client, snapshot), (error) => error.code === "EXTERNAL_ORDER_LOCKED");
});

function queueClient(status = "pending") {
  const writes = [];
  const client = {
    writes,
    posIntegration: { findUnique: async () => ({ id: "pos-1", provider: "tilby", status: "connected", config: { syncMode: "active" } }) },
    order: {
      findUnique: async () => ({ id: "order-1", tableSessionId: null, status }),
      update: async () => ({ integrationRevision: 2 }),
    },
    posIntegrationJob: {
      create: async ({ data }) => { writes.push({ create: data }); return { id: "job-2", ...data }; },
      updateMany: async (args) => { writes.push({ coalesce: args }); return { count: 1 }; },
    },
  };
  return client;
}

test("enqueuing coalesces only unattempted pending revisions, never uncertain writes", async () => {
  const client = queueClient();
  await enqueueOrderSync(client, { restaurantId: "restaurant-1", orderId: "order-1", trigger: "created" });
  const coalesce = client.writes[1].coalesce;
  assert.equal(coalesce.where.status, "pending");
  assert.equal(coalesce.where.attempts, 0);
  assert.equal(coalesce.where.entityId, "order-1");
  assert.equal(coalesce.where.integrationId, "pos-1");
  assert.equal(coalesce.where.id.not, "job-2");
  assert.equal(coalesce.data.responseMeta.action, "superseded");
});

test("a cancelled legacy order without a session queues a deletion, not an upsert", async () => {
  const client = queueClient("cancelled");
  await enqueueOrderSync(client, { restaurantId: "restaurant-1", orderId: "order-1", trigger: "cancelled" });
  assert.equal(client.writes[0].create.operation, "delete_order");
});
