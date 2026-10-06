import test from "node:test";
import assert from "node:assert/strict";
import {
  RESTAURANT_MODES,
  normalizeRestaurantMode,
  restaurantCapabilities,
  integratedModeError,
} from "../lib/restaurantMode.js";

test("unknown and legacy restaurants stay in full mode", () => {
  assert.equal(normalizeRestaurantMode(undefined), RESTAURANT_MODES.FULL);
  assert.equal(normalizeRestaurantMode("unexpected"), RESTAURANT_MODES.FULL);
});

test("integrated mode has one owner for cash and fiscal work", () => {
  const capabilities = restaurantCapabilities(RESTAURANT_MODES.INTEGRATED);
  assert.equal(capabilities.operationalFlow, true);
  assert.equal(capabilities.kitchen, true);
  assert.equal(capabilities.internalCashDesk, false);
  assert.equal(capabilities.internalPayments, false);
  assert.equal(capabilities.cashClosure, false);
  assert.equal(capabilities.externalSettlement, true);
});

test("full mode keeps the standalone restaurant workflow", () => {
  const capabilities = restaurantCapabilities(RESTAURANT_MODES.FULL);
  assert.equal(capabilities.internalCashDesk, true);
  assert.equal(capabilities.internalPayments, true);
  assert.equal(capabilities.cashClosure, true);
  assert.equal(capabilities.externalSettlement, false);
});

test("mode conflicts are explicit client errors", () => {
  const error = integratedModeError("La cassa");
  assert.equal(error.code, "EXTERNAL_POS_OWNS_FEATURE");
  assert.equal(error.statusCode, 409);
  assert.match(error.message, /gestion[a-z]+ collegato/i);
});
