import assert from "node:assert/strict";
import test from "node:test";
import { publicOrderRateLimitKey } from "../lib/rateLimit.js";

test("public orders on the same restaurant Wi-Fi are isolated by table", () => {
  const base = { ip: "10.0.0.8", body: { restaurantSlug: "bistrot-roma" } };
  const tableOne = publicOrderRateLimitKey({ ...base, body: { ...base.body, tableToken: "table-one" } });
  const tableTwo = publicOrderRateLimitKey({ ...base, body: { ...base.body, tableToken: "table-two" } });

  assert.notEqual(tableOne, tableTwo);
  assert.match(tableOne, /bistrot-roma:table-one$/);
});

test("the same table and IP always resolve to the same rate-limit bucket", () => {
  const request = {
    ip: "10.0.0.8",
    body: { restaurantSlug: "Bistrot-Roma", tableToken: "TABLE-ONE" },
  };

  assert.equal(publicOrderRateLimitKey(request), publicOrderRateLimitKey(request));
  assert.equal(publicOrderRateLimitKey(request), "10.0.0.8:bistrot-roma:table-one");
});
