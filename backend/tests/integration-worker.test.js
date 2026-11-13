import test from "node:test";
import assert from "node:assert/strict";
import { encryptIntegrationCredentials } from "../lib/integrationCrypto.js";
import { processIntegrationJob } from "../services/integrationWorker.service.js";

function setup(t, {
  revision = 1, currentRevision = revision, syncedRevision = 0, leaseLost = false, leaseLostAfterWrite = false,
} = {}) {
  const previousKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = "ab".repeat(32);
  t.after(() => {
    if (previousKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = previousKey;
  });
  const job = {
    id: "job-1", integrationId: "pos-1", entityType: "order", entityId: "order-1",
    status: "processing", lockToken: "lease-1", payload: { revision }, attempts: 1,
    operation: "upsert_order", createdAt: new Date("2026-11-06T09:00:00Z"),
    integration: {
      id: "pos-1", provider: "tilby", status: "connected", config: { syncMode: "active" },
      encryptedCredentials: encryptIntegrationCredentials({ accessToken: "test-secret" }),
    },
  };
  const order = {
    id: "order-1", restaurantId: "restaurant-1", tableId: "table-1", orderNumber: 1,
    createdAt: job.createdAt, guestCount: 1, totalAmount: 10, coverCharge: 0, discountAmount: 0,
    integrationRevision: revision, integrationSyncedRevision: syncedRevision,
    items: [{ id: "item-1", menuItemId: "menu-1", nameSnapshot: "Pizza", quantity: 1, priceSnapshot: 10 }],
  };
  const state = { entity: { integrationRevision: currentRevision, integrationSyncedRevision: syncedRevision, integrationSyncStatus: "queued" }, finalizations: [], mappings: [], providerCalls: 0 };
  const tx = {
    $queryRaw: async () => [state.entity],
    posIntegrationJob: {
      updateMany: async (args) => {
        state.finalizations.push(args);
        return { count: leaseLostAfterWrite ? 0 : 1 };
      },
      count: async () => 0,
    },
    order: { updateMany: async ({ data }) => { Object.assign(state.entity, data); return { count: 1 }; } },
    posIntegrationMapping: { upsert: async (args) => { state.mappings.push(args); } },
    posIntegration: { update: async () => ({}) },
  };
  const client = {
    $transaction: async (run) => run(tx),
    posIntegrationJob: {
      findUnique: async () => job,
      findFirst: async () => null,
      updateMany: async () => ({ count: leaseLost ? 0 : 1 }),
    },
    order: {
      findUnique: async () => ({ ...order, integrationRevision: currentRevision }),
      updateMany: async () => ({ count: 1 }),
    },
    posIntegrationMapping: { findUnique: async () => null, findMany: async () => [
    { entityType: "menu_item", localId: "menu-1", externalId: "10", metadata: { itemId: 10, department: { id: 3 }, vatPerc: 10 } },
    { entityType: "table", localId: "table-1", externalId: "7", metadata: { tableId: 7, tableName: "Tavolo 1", roomId: 5, roomName: "Sala" } },
    ] },
  };
  const fetchImpl = async (_url, options) => {
    state.providerCalls += 1;
    if (options.method === "POST") {
      // A new event can commit while this provider write is in flight.
      state.entity.integrationRevision = currentRevision;
      return { ok: true, status: 201, json: async () => ({ id: 91 }) };
    }
    return { ok: true, status: 200, json: async () => ({ results: [], pages: 1 }) };
  };
  return { job, order, state, fetchImpl, client };
}

test("retrying an obsolete revision never overwrites a more recent completed sale", async (t) => {
  const { state, fetchImpl, client } = setup(t, { revision: 1, currentRevision: 2, syncedRevision: 2 });
  const result = await processIntegrationJob("job-1", { fetchImpl, lockToken: "lease-1", client });
  assert.equal(result.reason, "superseded");
  assert.equal(state.providerCalls, 0);
  assert.equal(state.entity.integrationSyncStatus, "synced");
  assert.equal(state.finalizations[0].data.responseMeta.action, "superseded");
});

test("a lost lease makes zero provider requests", async (t) => {
  const { state, fetchImpl, client } = setup(t, { leaseLost: true });
  const result = await processIntegrationJob("job-1", { fetchImpl, lockToken: "lease-1", client });
  assert.equal(result.reason, "lease_lost_before_request");
  assert.equal(state.providerCalls, 0);
  assert.equal(state.finalizations.length, 0);
});

test("an in-flight older payload cannot mark a newer queued revision synced", async (t) => {
  const { state, fetchImpl, client } = setup(t);
  const result = await processIntegrationJob("job-1", {
    lockToken: "lease-1",
    client,
    fetchImpl: async (...args) => {
      const response = await fetchImpl(...args);
      if (args[1].method === "POST") state.entity.integrationRevision = 2;
      return response;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(state.entity.integrationSyncedRevision, 1);
  assert.equal(state.entity.integrationSyncStatus, "queued");
});

test("a provider response from a superseded lease cannot commit mappings or state", async (t) => {
  const { state, fetchImpl, client } = setup(t, { leaseLostAfterWrite: true });
  const result = await processIntegrationJob("job-1", { fetchImpl, lockToken: "lease-1", client });
  assert.equal(result.reason, "lease_lost_after_provider_write");
  assert.equal(state.mappings.length, 0);
  assert.equal(state.entity.integrationSyncedRevision, 0);
});
