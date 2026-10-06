import test from "node:test";
import assert from "node:assert/strict";
import {
  CONNECTOR_ENDPOINTS,
  PosConnectionError,
  testProviderConnection,
} from "../integrations/connectors.js";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test("Cassa in Cloud connection exchanges the API key for a short-lived token", async () => {
  let request;
  const result = await testProviderConnection("teamsystem_cassa_in_cloud", {
    credentials: { apiKey: "cic-secret" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse(200, { access_token: "temporary-token", expires_in: 3600, token_type: "Bearer" });
    },
  });
  assert.equal(request.url, CONNECTOR_ENDPOINTS.teamsystem_cassa_in_cloud);
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), { apiKey: "cic-secret" });
  assert.equal(result.outcome, "connected");
  assert.equal(JSON.stringify(result).includes("temporary-token"), false);
});

test("Tilby connection uses a bearer token and never returns it", async () => {
  let authorization;
  const result = await testProviderConnection("tilby", {
    credentials: { accessToken: "tilby-secret" },
    config: { environment: "sandbox" },
    fetchImpl: async (url, options) => {
      assert.equal(url, CONNECTOR_ENDPOINTS.tilby);
      authorization = options.headers.Authorization;
      return jsonResponse(200, { shopId: "shop-1" });
    },
  });
  assert.equal(authorization, "Bearer tilby-secret");
  assert.equal(result.remote.shopDetected, true);
  assert.equal(JSON.stringify(result).includes("tilby-secret"), false);
});

test("connector translates rejected credentials to a safe actionable error", async () => {
  await assert.rejects(
    () => testProviderConnection("teamsystem_cassa_in_cloud", {
      credentials: { apiKey: "wrong-secret" },
      fetchImpl: async () => jsonResponse(401, { debug: "do-not-expose" }),
    }),
    (error) => {
      assert.equal(error instanceof PosConnectionError, true);
      assert.equal(error.code, "POS_CREDENTIALS_REJECTED");
      assert.equal(error.message.includes("do-not-expose"), false);
      assert.equal(error.message.includes("wrong-secret"), false);
      return true;
    }
  );
});

test("Passepartout remains an honest assisted path and makes no network call", async () => {
  let called = false;
  const result = await testProviderConnection("passepartout_menu", {
    config: { installationName: "Installazione Roma" },
    fetchImpl: async () => { called = true; },
  });
  assert.equal(called, false);
  assert.equal(result.outcome, "assisted_required");
  assert.equal(result.remote.installationProvided, true);
});
