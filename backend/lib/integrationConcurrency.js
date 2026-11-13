import crypto from "node:crypto";

export const INTEGRATION_LEASE_MS = 2 * 60 * 1000;

export class IntegrationStateError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "IntegrationStateError";
    this.code = code;
    this.retryable = false;
  }
}

function configOf(integration) {
  return integration?.config && typeof integration.config === "object" && !Array.isArray(integration.config)
    ? integration.config : {};
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function sameIntegrationConfiguration(left, right) {
  return Boolean(left && right && left.id === right.id
    && left.provider === right.provider
    && left.encryptedCredentials === right.encryptedCredentials
    && JSON.stringify(stableValue(configOf(left))) === JSON.stringify(stableValue(configOf(right))));
}

// Every claimant and every configuration writer locks this same row first.
// No provider HTTP request is performed while this transaction is open.
export async function lockIntegration(client, integrationId) {
  await client.$queryRaw`SELECT "id" FROM "PosIntegration" WHERE "id" = ${integrationId} FOR UPDATE`;
  return client.posIntegration.findUnique({ where: { id: integrationId } });
}

export async function assertIntegrationSnapshot(client, expected) {
  const current = await lockIntegration(client, expected.id);
  if (!sameIntegrationConfiguration(current, expected)) {
    throw new IntegrationStateError(
      "La configurazione è cambiata da un altro dispositivo. Ricarica la pagina e riprova.",
      "INTEGRATION_CONFIGURATION_CHANGED"
    );
  }
  return current;
}

export async function assertIntegrationEditable(client, expected, { requirePaused = false } = {}) {
  const current = await assertIntegrationSnapshot(client, expected);
  if (requirePaused && configOf(current).syncMode === "active") {
    throw new IntegrationStateError(
      "Metti prima in pausa la sincronizzazione per modificare gli abbinamenti o importare il catalogo.",
      "INTEGRATION_PAUSE_REQUIRED"
    );
  }
  const processing = await client.posIntegrationJob.count({
    where: { integrationId: expected.id, status: "processing" },
  });
  if (processing) {
    throw new IntegrationStateError(
      "Un invio al gestionale è ancora in corso. Attendi qualche secondo e riprova.",
      "INTEGRATION_SYNC_IN_PROGRESS"
    );
  }
  return current;
}

export async function claimIntegrationJob(client, candidate) {
  try {
    return await client.$transaction(async (tx) => {
      const current = await lockIntegration(tx, candidate.integrationId);
      if (!current || !["connected", "degraded"].includes(current.status)
        || configOf(current).syncMode !== "active") return null;
      const token = crypto.randomUUID();
      const claimed = await tx.posIntegrationJob.updateMany({
        where: {
          id: candidate.id,
          integrationId: current.id,
          status: { in: ["pending", "retrying"] },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
        data: {
          status: "processing",
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lockToken: token,
          lastError: null,
        },
      });
      return claimed.count === 1 ? { id: candidate.id, lockToken: token } : null;
    });
  } catch (error) {
    // The partial unique index permits only one processing job per entity,
    // across Render instances. A competing claimant has not used an attempt.
    if (error?.code === "P2002") return null;
    throw error;
  }
}

export async function renewIntegrationLease(client, job) {
  const renewed = await client.posIntegrationJob.updateMany({
    where: { id: job.id, status: "processing", lockToken: job.lockToken },
    data: { lockedAt: new Date() },
  });
  if (renewed.count !== 1) {
    throw new IntegrationStateError(
      "Questo invio è stato recuperato da un altro worker. Il vecchio invio viene interrotto.",
      "INTEGRATION_LEASE_LOST"
    );
  }
}

export async function lockIntegrationEntity(client, job) {
  const rows = job.entityType === "table_session"
    ? await client.$queryRaw`SELECT "integrationRevision", "integrationSyncedRevision", "integrationSyncStatus" FROM "TableSession" WHERE "id" = ${job.entityId} FOR UPDATE`
    : await client.$queryRaw`SELECT "integrationRevision", "integrationSyncedRevision", "integrationSyncStatus" FROM "Order" WHERE "id" = ${job.entityId} FOR UPDATE`;
  return rows[0] || null;
}
