import test from "node:test";
import assert from "node:assert/strict";
import { getQuickGuide, quickGuideStorageKey } from "../src/lib/uxGuidance.js";

for (const role of ["owner", "admin", "waiter", "kitchen", "bar", "cashier"]) {
  test(`guida rapida completa per ${role}`, () => {
    const guide = getQuickGuide(role);
    assert.ok(guide.title);
    assert.ok(guide.intro);
    assert.equal(guide.steps.length, 3);
    guide.steps.forEach((step) => {
      assert.ok(step.title);
      assert.ok(step.text);
      assert.match(step.to, /^\//);
    });
    assert.match(quickGuideStorageKey(role), new RegExp(role));
  });
}

test("un ruolo sconosciuto riceve una guida sicura", () => {
  assert.equal(getQuickGuide("unknown").steps.length, 3);
});
