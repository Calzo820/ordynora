import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const eventTarget = new EventTarget();
globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener: (...args) => eventTarget.addEventListener(...args),
  removeEventListener: (...args) => eventTarget.removeEventListener(...args),
  dispatchEvent: (...args) => eventTarget.dispatchEvent(...args),
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { onLine: true },
});

const originalFetch = globalThis.fetch;
const {
  enqueuePublicOrder,
  flushPendingPublicOrders,
  getPendingPublicOrders,
  retryFailedPublicOrders,
} = await import("../src/lib/offlineOrders.js");

test.beforeEach(() => {
  localStorage.clear();
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("a rejected offline order remains visible instead of being deleted", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Articolo non disponibile" }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });

  enqueuePublicOrder({
    clientRequestId: "offline-test-1",
    restaurantSlug: "demo",
    tableToken: "table-1",
    items: [{ menuItemId: "item-1", quantity: 1 }],
  });

  const result = await flushPendingPublicOrders();
  const queue = getPendingPublicOrders();
  assert.equal(result.pending, 1);
  assert.equal(result.failed, 1);
  assert.equal(queue[0].status, "failed");
  assert.match(queue[0].lastError, /Articolo non disponibile/);
});

test("a failed order can be retried manually and is removed only after confirmation", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Non disponibile" }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });
  enqueuePublicOrder({
    clientRequestId: "offline-test-2",
    restaurantSlug: "demo",
    tableToken: "table-1",
    items: [{ menuItemId: "item-1", quantity: 1 }],
  });
  await flushPendingPublicOrders();

  globalThis.fetch = async () => new Response(JSON.stringify({
    order: { id: "order-1", publicToken: "public-1", status: "pending" },
  }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });

  const result = await retryFailedPublicOrders();
  assert.equal(result.sent, 1);
  assert.equal(result.pending, 0);
  assert.deepEqual(getPendingPublicOrders(), []);
});
