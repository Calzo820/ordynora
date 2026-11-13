import test from "node:test";
import assert from "node:assert/strict";
import { getOrOpenTableSession, lockRestaurantTable } from "../lib/tableSessionLock.js";

test("a table lock always scopes the row to its restaurant", async () => {
  const values = [];
  const client = { $queryRaw: async (sql, ...params) => {
    assert.match(sql.join("?"), /FOR UPDATE/);
    values.push(...params);
    return [{ id: "table-1", isActive: true }];
  } };
  await lockRestaurantTable(client, "restaurant-1", "table-1", { requireActive: true });
  assert.deepEqual(values, ["table-1", "restaurant-1"]);
});

test("QR ordering cannot use a missing or deactivated table", async () => {
  for (const rows of [[], [{ id: "table-1", isActive: false }]]) {
    await assert.rejects(() => lockRestaurantTable({ $queryRaw: async () => rows }, "restaurant-1", "table-1", { requireActive: true }),
      (error) => error.code === "TABLE_NOT_AVAILABLE");
  }
});

test("staff can complete a legacy bill even if its table has been deactivated", async () => {
  await lockRestaurantTable({ $queryRaw: async () => [{ id: "table-1", isActive: false }] }, "restaurant-1", "table-1");
});

test("the existing open session is reused instead of charging a second cover", async () => {
  const existing = { id: "session-1", status: "open" };
  const client = { tableSession: {
    findMany: async () => [existing],
    create: async () => { assert.fail("A second session must not be created"); },
  } };
  const session = await getOrOpenTableSession(client, { restaurantId: "restaurant-1", tableId: "table-1" });
  assert.equal(session, existing);
});

test("a requested bill blocks a second QR session until staff completes the table", async () => {
  let created = false;
  const client = { tableSession: {
    findMany: async () => [{ id: "session-1", status: "closing" }],
    create: async () => { created = true; },
  } };
  await assert.rejects(() => getOrOpenTableSession(client, { restaurantId: "restaurant-1", tableId: "table-1" }),
    (error) => error.code === "TABLE_BILL_IN_PROGRESS");
  assert.equal(created, false);
});

test("legacy duplicate open sessions are reported without silently merging bills", async () => {
  const client = { tableSession: { findMany: async () => [{ id: "session-1" }, { id: "session-2" }] } };
  await assert.rejects(() => getOrOpenTableSession(client, { restaurantId: "restaurant-1", tableId: "table-1" }),
    (error) => error.code === "TABLE_SESSION_CONFLICT");
});
