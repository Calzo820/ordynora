import test from "node:test";
import assert from "node:assert/strict";
import { integrationJobLabel, isSelectedIntegrationActive } from "../src/lib/integrationState.js";

test("il primo render della pagina gestionali gestisce valori null", () => {
  assert.equal(isSelectedIntegrationActive(null, null), false);
  assert.equal(isSelectedIntegrationActive(null, { id: "tilby" }), false);
  assert.equal(isSelectedIntegrationActive({ provider: "tilby", status: "draft" }, null), false);
});

test("le revisioni sostituite non vengono presentate come invii reali al gestionale", () => {
  assert.match(integrationJobLabel({ status: "succeeded", responseMeta: { action: "superseded" } }), /sostituito/);
  assert.match(integrationJobLabel({ status: "succeeded", responseMeta: { action: "cancelled_before_export" } }), /prima dell'invio/);
  assert.equal(integrationJobLabel({ status: "succeeded", responseMeta: { action: "created" } }), "Sincronizzato");
  assert.equal(integrationJobLabel(null), "Stato da verificare");
});

test("un gestionale è attivo solo se coincide ed è abilitato", () => {
  assert.equal(
    isSelectedIntegrationActive({ provider: "tilby", status: "connected" }, { id: "tilby" }),
    true
  );
  assert.equal(
    isSelectedIntegrationActive({ provider: "tilby", status: "disabled" }, { id: "tilby" }),
    false
  );
  assert.equal(
    isSelectedIntegrationActive({ provider: "tilby", status: "connected" }, { id: "cassa-in-cloud" }),
    false
  );
});
