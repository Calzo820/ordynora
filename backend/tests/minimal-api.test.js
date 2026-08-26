import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-change-me-32-characters";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/test";

const { app, server } = await import("../server.js");

test.after(() => {
  server.closeAllConnections?.();
  server.close?.();
});

test("health endpoint responds", async () => {
  const res = await request(app).get("/health").expect(200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, "ordynora-backend");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.match(res.headers["content-security-policy"], /frame-ancestors 'none'/);
});

test("malformed JSON returns a client error instead of a generic 500", async () => {
  const res = await request(app)
    .post("/auth/login")
    .set("Content-Type", "application/json")
    .send('{"email":')
    .expect(400);
  assert.match(res.body.message, /JSON non valido/);
});

test("unknown API routes stay JSON and never fall through to the SPA", async () => {
  const res = await request(app).get("/orders/does-not-exist").expect(404);
  assert.match(res.headers["content-type"], /json/);
  assert.equal(res.body.message, "Rotta API non trovata");
  assert.ok(res.body.requestId);
});

test("login rejects malformed email before DB lookup", async () => {
  const res = await request(app).post("/auth/login").send({ email: "not-an-email", password: "secret" }).expect(400);
  assert.match(res.body.message, /Email non valida/);
});

test("public order validates required fields", async () => {
  const res = await request(app).post("/orders/public").send({}).expect(400);
  assert.match(res.body.message, /restaurantSlug e tableToken/);
});

test("order status update requires auth", async () => {
  const res = await request(app).patch("/orders/order_123/status").send({ status: "ready" }).expect(401);
  assert.match(res.body.message, /Token/);
});

test("stripe webhook is disabled without STRIPE_SECRET_KEY", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const res = await request(app)
    .post("/payments/webhook")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ type: "checkout.session.completed", data: { object: {} } }))
    .expect(501);
  assert.match(res.body.message, /Stripe non configurato/);
});
