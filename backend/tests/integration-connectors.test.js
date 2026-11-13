import test from "node:test";
import assert from "node:assert/strict";
import {
  CONNECTOR_ENDPOINTS,
  PosConnectionError,
  requestProviderJson,
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
  const requests = [];
  const result = await testProviderConnection("teamsystem_cassa_in_cloud", {
    credentials: { apiKey: "cic-secret" },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/apikey/token")) {
        return jsonResponse(200, { access_token: "temporary-token", expires_in: 3600, token_type: "Bearer" });
      }
      if (url.includes("/salespoint?")) {
        assert.equal(options.headers.Authorization, "Bearer temporary-token");
        assert.equal(options.headers["X-Version"], "1.0.0");
        return jsonResponse(200, { salesPoints: [{ id: 123, description: "Milano Centro" }] });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(requests[0].url, CONNECTOR_ENDPOINTS.teamsystem_cassa_in_cloud);
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), { apiKey: "cic-secret" });
  assert.equal(result.outcome, "connected");
  assert.deepEqual(result.remote.suggestedConfig, { salesPointId: "123" });
  assert.equal(JSON.stringify(result).includes("temporary-token"), false);
});

test("Cassa in Cloud rejects a sales point outside the API key scope", async () => {
  await assert.rejects(
    () => testProviderConnection("teamsystem_cassa_in_cloud", {
      credentials: { apiKey: "cic-secret" },
      config: { salesPointId: "999" },
      fetchImpl: async (url) => {
        if (url.endsWith("/apikey/token")) {
          return jsonResponse(200, { access_token: "temporary-token", expires_in: 3600 });
        }
        if (url.includes("/salespoint?")) {
          return jsonResponse(200, { salesPoint: [{ id: 123, description: "Milano Centro" }] });
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    }),
    (error) => {
      assert.equal(error.code, "POS_SALES_POINT_NOT_ALLOWED");
      assert.match(error.message, /non è accessibile/);
      return true;
    }
  );
});

test("Tilby connection uses a bearer token and never returns it", async () => {
  let authorization;
  const result = await testProviderConnection("tilby", {
    credentials: { accessToken: "tilby-secret" },
    config: { environment: "sandbox" },
    fetchImpl: async (url, options) => {
      assert.equal(url, CONNECTOR_ENDPOINTS.tilby);
      authorization = options.headers.Authorization;
      return jsonResponse(200, {
        shop: { id: 12, uuid: "shop-uuid", name: "Sandbox Milano", tilby_sales_enabled: true },
      });
    },
  });
  assert.equal(authorization, "Bearer tilby-secret");
  assert.equal(result.remote.shopDetected, true);
  assert.equal(result.remote.shopId, 12);
  assert.equal(result.remote.shopName, "Sandbox Milano");
  assert.equal(JSON.stringify(result).includes("tilby-secret"), false);
});

test("Tilby connection blocks activation when sale access is disabled", async () => {
  await assert.rejects(
    () => testProviderConnection("tilby", {
      credentials: { accessToken: "tilby-secret" },
      fetchImpl: async () => jsonResponse(200, {
        shop: { id: 12, name: "Sandbox", tilby_sales_enabled: false },
      }),
    }),
    (error) => {
      assert.equal(error.code, "POS_SALES_NOT_ENABLED");
      assert.match(error.message, /vendite non è abilitato/);
      return true;
    }
  );
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

test("connector keeps a safe provider validation code for diagnostics", async () => {
  await assert.rejects(
    () => testProviderConnection("teamsystem_cassa_in_cloud", {
      credentials: { apiKey: "private-api-key" },
      fetchImpl: async () => jsonResponse(400, { NAME: "INVALIDVALUE", apiKey: "private-api-key" }),
    }),
    (error) => {
      assert.equal(error.code, "POS_REQUEST_REJECTED");
      assert.match(error.message, /INVALIDVALUE/);
      assert.equal(error.message.includes("private-api-key"), false);
      return true;
    }
  );
});

test("provider errors cannot echo an API key or bearer token", async () => {
  await assert.rejects(() => requestProviderJson("https://provider.invalid/api", {
    method: "POST", headers: { Authorization: "Bearer private-bearer-token" },
    body: JSON.stringify({ apiKey: "private-api-key" }),
  }, {
    providerName: "Test POS",
    fetchImpl: async () => jsonResponse(400, { message: "Invalid private-api-key and private-bearer-token" }),
  }), (error) => {
    assert.equal(error.message.includes("private-api-key"), false);
    assert.equal(error.message.includes("private-bearer-token"), false);
    assert.match(error.message, /REDACTED/);
    return true;
  });
});

test("Tilby cannot be marked connected without an identified shop", async () => {
  await assert.rejects(() => testProviderConnection("tilby", {
    credentials: { accessToken: "secret" },
    fetchImpl: async () => jsonResponse(200, {}),
  }), (error) => error.code === "POS_SHOP_MISSING");
});

test("an HTML or invalid JSON success response is not accepted as a provider success", async () => {
  await assert.rejects(() => requestProviderJson("https://provider.invalid/api", {}, {
    providerName: "Test POS",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("HTML"); } }),
  }), (error) => error.code === "POS_INVALID_RESPONSE" && error.retryable === true);
});

test("an empty 204 deletion response remains valid", async () => {
  const response = await requestProviderJson("https://provider.invalid/api", { method: "DELETE" }, {
    providerName: "Test POS", fetchImpl: async () => jsonResponse(204, null),
  });
  assert.equal(response.status, 204);
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
