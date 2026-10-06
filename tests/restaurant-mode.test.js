import test from "node:test";
import assert from "node:assert/strict";
import {
  RESTAURANT_MODES,
  isIntegratedMode,
  normalizeRestaurantMode,
  operationModeCopy,
} from "../src/lib/restaurantMode.js";

test("frontend defaults safely to complete mode", () => {
  assert.equal(normalizeRestaurantMode(null), RESTAURANT_MODES.FULL);
  assert.equal(isIntegratedMode("full"), false);
});

test("integrated copy explains the responsibility boundary", () => {
  const copy = operationModeCopy("integrated");
  assert.equal(isIntegratedMode("integrated"), true);
  assert.match(copy.description, /pagamenti/i);
  assert.match(copy.description, /gestionale collegato/i);
});
