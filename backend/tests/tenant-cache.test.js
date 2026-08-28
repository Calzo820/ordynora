import assert from "node:assert/strict";
import test from "node:test";
import { clearTenantCache, getTenantCached, invalidateTenantCache } from "../lib/tenantCache.js";

test("cache tenant riusa il risultato e separa i ristoranti", async () => {
  clearTenantCache();
  let calls = 0;
  const loader = async () => ({ call: ++calls });

  const first = await getTenantCached("public-menu", "restaurant-a", loader);
  const second = await getTenantCached("public-menu", "restaurant-a", loader);
  const other = await getTenantCached("public-menu", "restaurant-b", loader);

  assert.deepEqual(first, second);
  assert.equal(other.call, 2);
  assert.equal(calls, 2);
});

test("invalidazione colpisce solo namespace e tenant richiesti", async () => {
  clearTenantCache();
  let calls = 0;
  const loader = async () => ++calls;

  await getTenantCached("public-menu", "restaurant-a", loader);
  await getTenantCached("settings", "restaurant-a", loader);
  invalidateTenantCache("restaurant-a", "public-menu");

  assert.equal(await getTenantCached("public-menu", "restaurant-a", loader), 3);
  assert.equal(await getTenantCached("settings", "restaurant-a", loader), 2);
});
