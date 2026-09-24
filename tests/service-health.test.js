import test from "node:test";
import assert from "node:assert/strict";
import {
  getConnectionFailureMessage,
  getRecoveryDelayMs,
  isServiceReady,
  isTemporaryServiceFailure,
  recoveryLabel,
} from "../src/lib/serviceHealth.js";

test("un errore transitorio preserva la sessione", () => {
  assert.equal(isTemporaryServiceFailure({ transient: true, message: "Errore generico" }), true);
});

test("gli errori server e rate limit sono temporanei", () => {
  assert.equal(isTemporaryServiceFailure({ status: 503 }), true);
  assert.equal(isTemporaryServiceFailure({ status: 429 }), true);
  assert.equal(isTemporaryServiceFailure({ status: 401 }), false);
});

test("il messaggio offline indica rete e sessione salvata", () => {
  const message = getConnectionFailureMessage({ online: false });
  assert.match(message, /offline/i);
  assert.match(message, /sessione resta salvata/i);
});

test("il timeout non accusa le credenziali", () => {
  const message = getConnectionFailureMessage({ online: true, timedOut: true });
  assert.match(message, /più del previsto/i);
  assert.doesNotMatch(message, /password|credenziali/i);
});

test("ready richiede backend e database connesso", () => {
  assert.equal(isServiceReady({ ok: true, database: "connected" }), true);
  assert.equal(isServiceReady({ ok: true, database: "disconnected" }), false);
  assert.equal(isServiceReady({ ok: false, database: "connected" }), false);
});

test("health semplice senza campo database resta valido", () => {
  assert.equal(isServiceReady({ ok: true }), true);
});

test("il recupero usa attese progressive con limite", () => {
  assert.equal(getRecoveryDelayMs(1), 2000);
  assert.ok(getRecoveryDelayMs(3) > getRecoveryDelayMs(2));
  assert.equal(getRecoveryDelayMs(99), 10000);
});

test("le etichette di recupero sono comprensibili", () => {
  assert.match(recoveryLabel("waiting", 4), /4 secondi/i);
  assert.match(recoveryLabel("ready"), /disponibili/i);
  assert.match(recoveryLabel("offline"), /connessione assente/i);
});
