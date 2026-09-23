import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicOrderPayload } from "../middleware/validate.js";

function validate(body) {
  const req = { body };
  let response = null;
  const res = {
    status(status) {
      return {
        json(payload) {
          response = { status, payload };
          return response;
        },
      };
    },
  };
  let nextCalled = false;
  validatePublicOrderPayload(req, res, () => {
    nextCalled = true;
  });
  return { req, response, nextCalled };
}

test("validazione ordine conserva la portata scelta dal cliente", () => {
  const result = validate({
    restaurantSlug: "demo",
    tableToken: "token",
    items: [{ menuItemId: "dish-1", quantity: 1, notes: "senza sale", courseNumber: 3 }],
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.response, null);
  assert.equal(result.req.body.items[0].courseNumber, 3);
});

test("validazione ordine limita le portate all'intervallo 1-4", () => {
  const result = validate({
    restaurantSlug: "demo",
    tableToken: "token",
    items: [{ menuItemId: "dish-1", quantity: 1, courseNumber: 99 }],
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.body.items[0].courseNumber, 4);
});
