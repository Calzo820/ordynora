import test from "node:test";
import assert from "node:assert/strict";
import { getRefreshCookieOptions, getSessionDays, getSessionExpiry } from "../lib/session.js";

test("staff session duration is validated and capped", () => {
  assert.equal(getSessionDays("90", 14), 90);
  assert.equal(getSessionDays(undefined, 90), 90);
  assert.equal(getSessionDays("invalid", 30), 30);
  assert.equal(getSessionDays("9999", 14), 365);
  assert.equal(getSessionDays("0", 14), 14);
});

test("persistent and session-only refresh cookies have distinct lifetimes", () => {
  const persistent = getRefreshCookieOptions({ days: 90, persistent: true });
  const temporary = getRefreshCookieOptions({ days: 1, persistent: false });

  assert.equal(persistent.httpOnly, true);
  assert.equal(persistent.maxAge, 90 * 24 * 60 * 60 * 1000);
  assert.equal("maxAge" in temporary, false);
});

test("session expiry uses the requested duration", () => {
  const before = Date.now();
  const expiry = getSessionExpiry(90).getTime();
  const after = Date.now();
  const duration = 90 * 24 * 60 * 60 * 1000;

  assert.ok(expiry >= before + duration);
  assert.ok(expiry <= after + duration);
});
