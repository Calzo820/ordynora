import test from "node:test";
import assert from "node:assert/strict";
import {
  assertIntegrationEditable,
  assertIntegrationSnapshot,
  claimIntegrationJob,
  renewIntegrationLease,
  sameIntegrationConfiguration,
} from "../lib/integrationConcurrency.js";

const integration = {
  id: "pos-1", provider: "tilby", status: "connected",
  encryptedCredentials: "encrypted-credentials", config: { syncMode: "active", environment: "sandbox" },
};

function clientFor(current = integration, { processing = 0, claimed = 1, claimError = null } = {}) {
  const calls = [];
  const client = {
    calls,
    $queryRaw: async (sql, ...values) => { calls.push({ type: "lock", sql: sql.join("?"), values }); return [{ id: current?.id }]; },
    posIntegration: { findUnique: async () => current },
    posIntegrationJob: {
      count: async () => processing,
      updateMany: async (args) => {
        calls.push({ type: "update", args });
        if (claimError) throw claimError;
        return { count: claimed };
      },
    },
  };
  client.$transaction = async (run) => run(client);
  return client;
}

test("configuration snapshots ignore JSON key order but detect another account", () => {
  const reordered = { ...integration, config: { environment: "sandbox", syncMode: "active" } };
  assert.equal(sameIntegrationConfiguration(integration, reordered), true);
  for (const changed of [
    { ...integration, encryptedCredentials: "new-secret" },
    { ...integration, provider: "teamsystem_cassa_in_cloud" },
    { ...integration, config: { ...integration.config, salesPointId: "999" } },
    { ...integration, config: { ...integration.config, syncMode: "paused" } },
  ]) assert.equal(sameIntegrationConfiguration(integration, changed), false);
});

test("a stale connection test cannot restore an old configuration", async () => {
  const client = clientFor({ ...integration, encryptedCredentials: "replacement" });
  await assert.rejects(() => assertIntegrationSnapshot(client, integration),
    (error) => error.code === "INTEGRATION_CONFIGURATION_CHANGED");
  assert.equal(client.calls[0].type, "lock");
  assert.deepEqual(client.calls[0].values, [integration.id]);
});

test("mapping writes require paused synchronization", async () => {
  await assert.rejects(() => assertIntegrationEditable(clientFor(), integration, { requirePaused: true }),
    (error) => error.code === "INTEGRATION_PAUSE_REQUIRED");
});

test("configuration changes wait until the in-flight send completes", async () => {
  await assert.rejects(() => assertIntegrationEditable(clientFor(integration, { processing: 1 }), integration),
    (error) => error.code === "INTEGRATION_SYNC_IN_PROGRESS");
});

test("a worker claims a job only after locking its integration", async () => {
  const client = clientFor();
  const claimed = await claimIntegrationJob(client, { id: "job-1", integrationId: "pos-1" });
  assert.equal(claimed.id, "job-1");
  assert.match(claimed.lockToken, /^[0-9a-f-]{36}$/);
  assert.equal(client.calls[0].type, "lock");
  assert.equal(client.calls[1].args.data.status, "processing");
  assert.equal(client.calls[1].args.where.integrationId, "pos-1");
});

test("paused, disabled and unverified integrations never consume a job attempt", async () => {
  for (const current of [
    { ...integration, config: { syncMode: "paused" } },
    { ...integration, status: "disabled" },
    { ...integration, status: "draft" },
    null,
  ]) {
    const client = clientFor(current);
    assert.equal(await claimIntegrationJob(client, { id: "job-1", integrationId: "pos-1" }), null);
    assert.equal(client.calls.filter((call) => call.type === "update").length, 0);
  }
});

test("the database exclusive-entity conflict safely skips a competing worker", async () => {
  const client = clientFor(integration, { claimError: Object.assign(new Error("Unique constraint"), { code: "P2002" }) });
  assert.equal(await claimIntegrationJob(client, { id: "job-2", integrationId: "pos-1" }), null);
});

test("claim database errors other than an exclusive-entity conflict remain visible", async () => {
  const failure = Object.assign(new Error("Database unavailable"), { code: "P1001" });
  const client = clientFor(integration, { claimError: failure });
  await assert.rejects(() => claimIntegrationJob(client, { id: "job-1", integrationId: "pos-1" }), (error) => error === failure);
});

test("only the owning lease can renew a processing job", async () => {
  const client = clientFor(integration, { claimed: 0 });
  await assert.rejects(() => renewIntegrationLease(client, { id: "job-1", lockToken: "old-lease" }),
    (error) => error.code === "INTEGRATION_LEASE_LOST");
  assert.deepEqual(client.calls[0].args.where, { id: "job-1", status: "processing", lockToken: "old-lease" });
});
