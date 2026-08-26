import test from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "../middleware/auth.js";

function runMiddleware(middleware, req) {
  let nextCalled = false;
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test("a role header cannot grant access without an authenticated JWT user", () => {
  const result = runMiddleware(requireRole("owner"), {
    headers: { role: "owner" },
    user: null,
  });
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
});

test("the compatibility middleware accepts a single verified role", () => {
  const result = runMiddleware(requireRole("cashier"), {
    headers: {},
    user: { role: "cashier" },
  });
  assert.equal(result.nextCalled, true);
});

test("superadmin access remains controlled by the verified token claim", () => {
  const result = runMiddleware(requireRole(["owner"]), {
    headers: {},
    user: { role: "superadmin", isSuperAdmin: true },
  });
  assert.equal(result.nextCalled, true);
});
