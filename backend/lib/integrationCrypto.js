import crypto from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("ordynora:pos-integration:v1", "utf8");

export class IntegrationEncryptionError extends Error {
  constructor(message, code = "INTEGRATION_ENCRYPTION_ERROR") {
    super(message);
    this.name = "IntegrationEncryptionError";
    this.code = code;
  }
}

function decodeConfiguredKey(rawValue = process.env.INTEGRATION_ENCRYPTION_KEY) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    throw new IntegrationEncryptionError(
      "Cifratura integrazioni non configurata sul server",
      "INTEGRATION_ENCRYPTION_NOT_CONFIGURED"
    );
  }

  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    key = Buffer.from(normalized, "base64");
  }

  if (key.length !== 32) {
    throw new IntegrationEncryptionError(
      "INTEGRATION_ENCRYPTION_KEY deve contenere esattamente 32 byte",
      "INTEGRATION_ENCRYPTION_INVALID"
    );
  }

  return key;
}

export function isIntegrationEncryptionConfigured() {
  try {
    decodeConfiguredKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptIntegrationCredentials(credentials) {
  const key = decodeConfiguredKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);
  const plaintext = Buffer.from(JSON.stringify(credentials || {}), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptIntegrationCredentials(payload) {
  const key = decodeConfiguredKey();
  const [version, ivValue, tagValue, encryptedValue, ...extra] = String(payload || "").split(":");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || extra.length) {
    throw new IntegrationEncryptionError("Formato credenziali non valido", "INTEGRATION_CREDENTIALS_INVALID");
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, "base64url"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    return parsed;
  } catch {
    throw new IntegrationEncryptionError(
      "Impossibile decifrare le credenziali del gestionale",
      "INTEGRATION_CREDENTIALS_DECRYPT_FAILED"
    );
  }
}
