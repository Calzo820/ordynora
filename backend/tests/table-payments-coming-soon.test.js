import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublicStripeCheckout,
  createStripeConnectDashboard,
  createStripeConnectOnboarding,
  getStripeConnectStatus,
} from "../controllers/payment.controller.js";

const originalFeatureFlag = process.env.PUBLIC_TABLE_PAYMENTS_ENABLED;

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.beforeEach(() => {
  process.env.PUBLIC_TABLE_PAYMENTS_ENABLED = "false";
});

test.after(() => {
  if (originalFeatureFlag === undefined) delete process.env.PUBLIC_TABLE_PAYMENTS_ENABLED;
  else process.env.PUBLIC_TABLE_PAYMENTS_ENABLED = originalFeatureFlag;
});

test("reports Stripe Connect as coming soon without contacting Stripe or the database", async () => {
  const res = responseRecorder();
  await getStripeConnectStatus({ user: { restaurantId: "test-restaurant" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.available, false);
  assert.equal(res.body.connected, false);
  assert.equal(res.body.code, "TABLE_PAYMENTS_COMING_SOON");
});

for (const [name, controller] of [
  ["Stripe Connect onboarding", createStripeConnectOnboarding],
  ["Stripe Connect dashboard", createStripeConnectDashboard],
  ["public table checkout", createPublicStripeCheckout],
]) {
  test(`blocks ${name} while table payments are unavailable`, async () => {
    const res = responseRecorder();
    await controller({ user: { restaurantId: "test-restaurant" }, params: {}, body: {} }, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.available, false);
    assert.equal(res.body.code, "TABLE_PAYMENTS_COMING_SOON");
  });
}
