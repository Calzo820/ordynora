import test from "node:test";
import assert from "node:assert/strict";
import {
  getPublicProviderCatalog,
  sanitizeProviderConfig,
  sanitizeProviderCredentials,
} from "../integrations/catalog.js";

test("catalog exposes the three supported Italian management-system paths", () => {
  const catalog = getPublicProviderCatalog();
  assert.deepEqual(catalog.map((provider) => provider.id), [
    "tilby",
    "teamsystem_cassa_in_cloud",
    "passepartout_menu",
  ]);
  assert.equal(catalog.every((provider) => provider.officialDocs.startsWith("https://")), true);
});

test("provider configuration keeps only allow-listed fields", () => {
  const config = sanitizeProviderConfig("teamsystem_cassa_in_cloud", {
    salesPointId: "12345",
    baseUrl: "http://attacker.invalid",
  });
  assert.deepEqual(config, { salesPointId: "12345" });
  assert.throws(
    () => sanitizeProviderConfig("teamsystem_cassa_in_cloud", { salesPointId: "123-not-valid" }),
    /solo numeri/
  );
});

test("blank credential input preserves an existing secret without exposing it", () => {
  const credentials = sanitizeProviderCredentials(
    "tilby",
    { accessToken: "" },
    { accessToken: "existing-token" }
  );
  assert.deepEqual(credentials, { accessToken: "existing-token" });
  assert.throws(() => sanitizeProviderCredentials("tilby", {}, {}), /campo obbligatorio/);
});

test("Passepartout validates assisted setup without asking for an invented API key", () => {
  const config = sanitizeProviderConfig("passepartout_menu", {
    installationName: "Menu installazione 7",
    resellerContact: "Partner locale",
  });
  const credentials = sanitizeProviderCredentials("passepartout_menu", {}, {});
  assert.equal(config.installationName, "Menu installazione 7");
  assert.deepEqual(credentials, {});
});
