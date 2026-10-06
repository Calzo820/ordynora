import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  IntegrationEncryptionError,
  isIntegrationEncryptionConfigured,
} from "../lib/integrationCrypto.js";

const VALID_KEY = "0123456789abcdef".repeat(4);

test("integration credentials use authenticated encryption and round-trip safely", () => {
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = VALID_KEY;
  try {
    const encrypted = encryptIntegrationCredentials({ apiKey: "super-secret", shop: "42" });
    assert.match(encrypted, /^v1:/);
    assert.equal(encrypted.includes("super-secret"), false);
    assert.deepEqual(decryptIntegrationCredentials(encrypted), { apiKey: "super-secret", shop: "42" });
    assert.equal(isIntegrationEncryptionConfigured(), true);
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = previous;
  }
});

test("tampered integration credentials are rejected", () => {
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = VALID_KEY;
  try {
    const encrypted = encryptIntegrationCredentials({ accessToken: "token" });
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    assert.throws(
      () => decryptIntegrationCredentials(tampered),
      (error) => error instanceof IntegrationEncryptionError && error.code === "INTEGRATION_CREDENTIALS_DECRYPT_FAILED"
    );
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = previous;
  }
});

test("missing or invalid integration key blocks credential storage", () => {
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  try {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    assert.equal(isIntegrationEncryptionConfigured(), false);
    assert.throws(
      () => encryptIntegrationCredentials({ apiKey: "secret" }),
      (error) => error.code === "INTEGRATION_ENCRYPTION_NOT_CONFIGURED"
    );
    process.env.INTEGRATION_ENCRYPTION_KEY = "too-short";
    assert.throws(
      () => encryptIntegrationCredentials({ apiKey: "secret" }),
      (error) => error.code === "INTEGRATION_ENCRYPTION_INVALID"
    );
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = previous;
  }
});
