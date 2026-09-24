import test from "node:test";
import assert from "node:assert/strict";
import {
  beginSupportSession,
  hasPlatformSession,
  restorePlatformSession,
} from "../src/lib/superAdminSession.js";

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const supportPayload = {
  token: "support-token",
  user: { id: "platform-user", role: "owner", isImpersonating: true },
  restaurant: { id: "restaurant-42", name: "Ristorante 42", slug: "ristorante-42" },
};

test("opening support stores the platform session and activates the selected restaurant", () => {
  const storage = createStorage({
    auth_token: "platform-token",
    auth_user: JSON.stringify({ id: "platform-user", role: "superadmin" }),
  });

  beginSupportSession(supportPayload, storage);

  assert.equal(storage.getItem("auth_token"), "support-token");
  assert.equal(storage.getItem("restaurant_id"), "restaurant-42");
  assert.equal(storage.getItem("ristorante_attivo"), "Ristorante 42");
  assert.equal(storage.getItem("superadmin_mode"), "1");
  assert.equal(hasPlatformSession(storage), true);
});

test("returning to the platform restores the original token and clears tenant context", () => {
  const storage = createStorage({
    auth_token: "platform-token",
    auth_user: JSON.stringify({ id: "platform-user", role: "superadmin" }),
  });
  beginSupportSession(supportPayload, storage);

  assert.equal(restorePlatformSession(storage), true);
  assert.equal(storage.getItem("auth_token"), "platform-token");
  assert.equal(JSON.parse(storage.getItem("auth_user")).role, "superadmin");
  assert.equal(storage.getItem("auth_restaurant"), null);
  assert.equal(storage.getItem("restaurant_id"), null);
  assert.equal(storage.getItem("superadmin_platform_session"), null);
  assert.equal(storage.getItem("superadmin_mode"), null);
});

test("an invalid support response cannot overwrite the platform session", () => {
  const storage = createStorage({ auth_token: "platform-token" });

  assert.throws(
    () => beginSupportSession({ token: "support-token", restaurant: {} }, storage),
    /Risposta assistenza non valida/
  );
  assert.equal(storage.getItem("auth_token"), "platform-token");
  assert.equal(hasPlatformSession(storage), false);
});

test("a missing snapshot clears the broken support context for cookie recovery", () => {
  const storage = createStorage({
    auth_token: "orphan-support-token",
    auth_user: JSON.stringify({ role: "owner", isImpersonating: true }),
    restaurant_id: "restaurant-42",
    superadmin_mode: "1",
  });

  assert.equal(restorePlatformSession(storage), false);
  assert.equal(storage.getItem("auth_token"), null);
  assert.equal(storage.getItem("auth_user"), null);
  assert.equal(storage.getItem("restaurant_id"), null);
  assert.equal(storage.getItem("superadmin_mode"), null);
});
