import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCourseFlow } from "../src/lib/courseFlow.js";

test("course flow trova la prossima portata trattenuta", () => {
  const flow = summarizeCourseFlow([
    { status: "active", courseNumber: 1, quantity: 2, releasedAt: "2026-09-23T10:00:00Z", preparationStatus: "ready" },
    { status: "active", courseNumber: 2, quantity: 1, releasedAt: null, preparationStatus: "pending" },
    { status: "active", courseNumber: 3, quantity: 1, releasedAt: null, preparationStatus: "pending" },
  ]);

  assert.equal(flow.hasMultipleCourses, true);
  assert.equal(flow.nextHeldCourse.courseNumber, 2);
  assert.equal(flow.courses[0].status, "ready");
});

test("course flow ignora le righe annullate", () => {
  const flow = summarizeCourseFlow([
    { status: "active", courseNumber: 1, releasedAt: "2026-09-23T10:00:00Z" },
    { status: "voided", courseNumber: 2, releasedAt: null },
  ]);

  assert.equal(flow.courses.length, 1);
  assert.equal(flow.hasMultipleCourses, false);
  assert.equal(flow.nextHeldCourse, null);
});
