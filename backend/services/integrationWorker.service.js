import prisma from "../lib/prisma.js";
import { decryptIntegrationCredentials } from "../lib/integrationCrypto.js";
import { logError } from "../lib/logger.js";
import { IntegrationMappingError, executeProviderOrderOperation } from "../integrations/runtime.js";
import { buildTableSessionOrder } from "../lib/tableSessionOrder.js";
import {
  claimIntegrationJob,
  INTEGRATION_LEASE_MS,
  lockIntegrationEntity,
  renewIntegrationLease,
} from "../lib/integrationConcurrency.js";

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_ATTEMPTS = 8;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer = null;
let running = false;
let lastPollAt = null;
let lastSuccessAt = null;
let lastError = null;
let lastCleanupAt = null;

function envNumber(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function configOf(integration) {
  return integration?.config && typeof integration.config === "object" && !Array.isArray(integration.config)
    ? integration.config
    : {};
}

function errorMessage(error) {
  return String(error?.message || "Errore sincronizzazione sconosciuto").slice(0, 1000);
}

function retryDelayMs(attempts, requestedDelay = null) {
  if (Number.isFinite(Number(requestedDelay)) && Number(requestedDelay) > 0) {
    return Math.min(30 * 60 * 1000, Number(requestedDelay));
  }
  const base = Math.min(15 * 60 * 1000, 5000 * (2 ** Math.max(0, attempts - 1)));
  return base + Math.floor(Math.random() * Math.min(5000, base * 0.2));
}

function isSessionJob(job) {
  return job?.entityType === "table_session";
}

async function updateSyncEntity(client, job, data, { onlyWhenNotProcessing = false } = {}) {
  if (isSessionJob(job)) {
    const result = await client.tableSession.updateMany({
      where: {
        id: job.entityId,
        ...(onlyWhenNotProcessing ? { integrationSyncStatus: { not: "processing" } } : {}),
      },
      data,
    });
    if (result.count) {
      await client.order.updateMany({
        where: {
          tableSessionId: job.entityId,
          ...(onlyWhenNotProcessing ? { integrationSyncStatus: { not: "processing" } } : {}),
        },
        data: {
          ...(data.integrationSyncStatus ? { integrationSyncStatus: data.integrationSyncStatus } : {}),
          ...(Object.hasOwn(data, "integrationLastError") ? { integrationLastError: data.integrationLastError } : {}),
          ...(Object.hasOwn(data, "integrationSyncedAt") ? { integrationSyncedAt: data.integrationSyncedAt } : {}),
          ...(Object.hasOwn(data, "integrationSyncedRevision") ? { integrationSyncedRevision: data.integrationSyncedRevision } : {}),
        },
      });
    }
    return result;
  }
  return client.order.updateMany({
    where: {
      id: job.entityId,
      ...(onlyWhenNotProcessing ? { integrationSyncStatus: { not: "processing" } } : {}),
    },
    data,
  });
}

async function loadJobOrder(job, client = prisma) {
  if (isSessionJob(job)) {
    const session = await client.tableSession.findUnique({
      where: { id: job.entityId },
      include: {
        restaurant: true,
        table: true,
        orders: {
          orderBy: { createdAt: "asc" },
          include: {
            items: { include: { menuItem: true }, orderBy: { createdAt: "asc" } },
            payments: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    return session ? buildTableSessionOrder(session, { externalIdentity: true }) : null;
  }
  return client.order.findUnique({
    where: { id: job.entityId },
    include: {
      restaurant: true,
      table: true,
      items: { include: { menuItem: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

async function markSuccess(job, order, result, client = prisma) {
  const revision = Number(order.integrationRevision || job.payload?.revision || 0);
  const committed = await client.$transaction(async (tx) => {
    const finalized = await tx.posIntegrationJob.updateMany({
      where: { id: job.id, status: "processing", lockToken: job.lockToken },
      data: {
        status: "succeeded",
        externalId: result.externalId || job.externalId || null,
        responseMeta: {
          action: result.action || "synchronized",
          providerUuid: result.providerUuid || null,
          providerExternalId: result.providerExternalId || null,
        },
        processedAt: new Date(),
        nextAttemptAt: null,
        lockedAt: null,
        lockToken: null,
        lastError: null,
      },
    });
    if (finalized.count !== 1) return false;
    if (result.externalId) {
      await tx.posIntegrationMapping.upsert({
        where: {
          integrationId_entityType_localId: {
            integrationId: job.integrationId,
            entityType: job.entityType,
            localId: job.entityId,
          },
        },
        create: {
          integrationId: job.integrationId,
          entityType: job.entityType,
          localId: job.entityId,
          externalId: String(result.externalId),
          metadata: {
            providerUuid: result.providerUuid || null,
            providerExternalId: result.providerExternalId || null,
          },
        },
        update: {
          externalId: String(result.externalId),
          metadata: {
            providerUuid: result.providerUuid || null,
            providerExternalId: result.providerExternalId || null,
          },
        },
      });
    }
    const currentEntity = await lockIntegrationEntity(tx, job);
    const remaining = await tx.posIntegrationJob.count({
      where: {
        integrationId: job.integrationId,
        entityType: job.entityType,
        entityId: job.entityId,
        id: { not: job.id },
        status: { in: ["pending", "processing", "retrying"] },
      },
    });
    await updateSyncEntity(tx, job, {
      integrationSyncedRevision: Math.max(currentEntity?.integrationSyncedRevision || 0, revision),
      integrationSyncStatus: remaining || Number(currentEntity?.integrationRevision) > revision ? "queued" : "synced",
      integrationLastError: null,
      integrationSyncedAt: new Date(),
    });
    await tx.posIntegration.update({
      where: { id: job.integrationId },
      data: { status: "connected", lastSyncAt: new Date(), lastError: null },
    });
    return true;
  });
  if (!committed) return false;
  lastSuccessAt = new Date();
  lastError = null;
  return true;
}

async function markFailure(job, order, error, client = prisma) {
  const maxAttempts = envNumber("INTEGRATION_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS, 1, 20);
  const attempts = Number(job.attempts || 0);
  const mappingFailure = error instanceof IntegrationMappingError || error?.retryable === false;
  const retryable = !mappingFailure && error?.retryable !== false;
  const willRetry = retryable && attempts < maxAttempts;
  const nextAttemptAt = willRetry
    ? new Date(Date.now() + retryDelayMs(attempts, error?.retryAfterMs))
    : null;
  const message = errorMessage(error);
  const jobStatus = mappingFailure ? "blocked" : willRetry ? "retrying" : "failed";

  const committed = await client.$transaction(async (tx) => {
    const finalized = await tx.posIntegrationJob.updateMany({
      where: { id: job.id, status: "processing", lockToken: job.lockToken },
      data: {
        status: jobStatus,
        nextAttemptAt,
        lockedAt: null,
        lockToken: null,
        lastError: message,
        responseMeta: {
          code: error?.code || "INTEGRATION_SYNC_FAILED",
          providerStatus: error?.providerStatus || null,
          details: Array.isArray(error?.details) ? error.details.slice(0, 20) : [],
        },
      },
    });
    if (finalized.count !== 1) return false;
    await updateSyncEntity(tx, job, {
      integrationSyncStatus: willRetry ? "retrying" : jobStatus,
      integrationLastError: message,
    });
    await tx.posIntegration.update({
      where: { id: job.integrationId },
      data: {
        status: mappingFailure ? job.integration.status : "degraded",
        lastError: message,
      },
    });
    return true;
  });
  if (!committed) return false;

  if (!willRetry) {
    await logError({
      restaurantId: order.restaurantId,
      source: `integration.${job.integration.provider}`,
      message,
      error,
      metadata: {
        jobId: job.id,
        entityType: job.entityType,
        entityId: job.entityId,
        operation: job.operation,
        attempts,
        code: error?.code || null,
      },
      level: mappingFailure ? "warning" : "error",
    });
  }
  lastError = { at: new Date(), message, jobId: job.id };
  return true;
}

export async function processIntegrationJob(jobId, { fetchImpl = globalThis.fetch, lockToken = null, client = prisma } = {}) {
  const job = await client.posIntegrationJob.findUnique({
    where: { id: jobId },
    include: { integration: true },
  });
  if (!job || job.status !== "processing") return { skipped: true, reason: "not_processing" };
  if (lockToken && job.lockToken !== lockToken) return { skipped: true, reason: "lease_lost" };

  const config = configOf(job.integration);
  if (job.integration.status === "disabled" || config.syncMode !== "active") {
    const message = "Sincronizzazione disattivata dal proprietario";
    await client.$transaction(async (tx) => {
      const changed = await tx.posIntegrationJob.updateMany({
        where: { id: job.id, status: "processing", lockToken: job.lockToken },
        data: {
          status: "blocked",
          lockedAt: null,
          lockToken: null,
          lastError: message,
        },
      });
      if (changed.count) {
        await updateSyncEntity(tx, job, {
          integrationSyncStatus: "blocked",
          integrationLastError: message,
        });
      }
    });
    return { skipped: true, reason: "integration_paused" };
  }

  const order = await loadJobOrder(job, client);
  if (!order) {
    await client.posIntegrationJob.updateMany({
      where: { id: job.id, status: "processing", lockToken: job.lockToken },
      data: { status: "failed", lockedAt: null, lockToken: null, lastError: "Ordine locale non trovato" },
    });
    return { skipped: true, reason: "entity_missing" };
  }

  const newerJob = await client.posIntegrationJob.findFirst({
    where: {
      integrationId: job.integrationId,
      entityType: job.entityType,
      entityId: job.entityId,
      id: { not: job.id },
      createdAt: { gt: job.createdAt },
      status: { in: ["pending", "processing", "retrying"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const obsoleteRevision = Number(job.payload?.revision || 0) < Number(order.integrationRevision || 0);
  if (newerJob || obsoleteRevision) {
    await client.$transaction(async (tx) => {
      const changed = await tx.posIntegrationJob.updateMany({
        where: { id: job.id, status: "processing", lockToken: job.lockToken },
        data: {
          status: "succeeded",
          processedAt: new Date(),
          lockedAt: null,
          lockToken: null,
          lastError: null,
          responseMeta: { action: "superseded", supersededBy: newerJob?.id || null },
        },
      });
      if (changed.count) {
        const currentEntity = await lockIntegrationEntity(tx, job);
        const alreadySynced = Number(currentEntity?.integrationSyncedRevision) >= Number(currentEntity?.integrationRevision);
        const syncStatus = alreadySynced ? "synced"
          : ["blocked", "failed", "retrying"].includes(currentEntity?.integrationSyncStatus)
            ? currentEntity.integrationSyncStatus : "queued";
        await updateSyncEntity(tx, job, { integrationSyncStatus: syncStatus, integrationLastError: null });
      }
    });
    return { skipped: true, reason: "superseded", supersededBy: newerJob?.id || null };
  }

  try {
    // Exclusivity belongs to PosIntegrationJob's partial unique index, never
    // to a user-visible status that a newer queued event may legitimately alter.
    await renewIntegrationLease(client, job);
    await updateSyncEntity(client, job, { integrationSyncStatus: "processing", integrationLastError: null });
    const [mappings, orderMapping] = await Promise.all([
      client.posIntegrationMapping.findMany({
        where: { integrationId: job.integrationId, entityType: { in: ["menu_item", "table"] } },
      }),
      client.posIntegrationMapping.findUnique({
        where: {
          integrationId_entityType_localId: {
            integrationId: job.integrationId,
            entityType: job.entityType,
            localId: job.entityId,
          },
        },
      }),
    ]);
    const credentials = decryptIntegrationCredentials(job.integration.encryptedCredentials);
    const result = await executeProviderOrderOperation(job.integration.provider, {
      operation: job.operation,
      credentials,
      config,
      order,
      mappings,
      externalId: orderMapping?.externalId || job.externalId,
      fetchImpl,
      beforeRequest: () => renewIntegrationLease(client, job),
    });
    const committed = await markSuccess(job, order, result, client);
    if (!committed) return { skipped: true, reason: "lease_lost_after_provider_write" };
    return { ok: true, result };
  } catch (error) {
    if (error?.code === "INTEGRATION_LEASE_LOST") return { skipped: true, reason: "lease_lost_before_request" };
    const committed = await markFailure(job, order, error, client);
    if (!committed) return { skipped: true, reason: "lease_lost_after_provider_error" };
    return { ok: false, error };
  }
}

async function recoverStaleJobs() {
  const staleBefore = new Date(Date.now() - INTEGRATION_LEASE_MS);
  const staleJobs = await prisma.posIntegrationJob.findMany({
    where: { status: "processing", lockedAt: { lt: staleBefore } },
    select: { id: true, entityType: true, entityId: true, lockToken: true },
    take: 100,
  });
  if (!staleJobs.length) return 0;
  let recovered = 0;
  for (const job of staleJobs) {
    recovered += await prisma.$transaction(async (tx) => {
      const changed = await tx.posIntegrationJob.updateMany({
        where: { id: job.id, status: "processing", lockToken: job.lockToken, lockedAt: { lt: staleBefore } },
        data: {
          status: "retrying", nextAttemptAt: new Date(), lockedAt: null, lockToken: null,
          lastError: "Job recuperato dopo un riavvio del worker",
        },
      });
      if (!changed.count) return 0;
      await updateSyncEntity(tx, job, { integrationSyncStatus: "queued" });
      return 1;
    });
  }
  return recovered;
}

async function cleanupOldJobs() {
  if (lastCleanupAt && Date.now() - lastCleanupAt.getTime() < CLEANUP_INTERVAL_MS) return 0;
  lastCleanupAt = new Date();
  const retentionDays = envNumber("INTEGRATION_JOB_RETENTION_DAYS", 30, 7, 365);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const removed = await prisma.posIntegrationJob.deleteMany({
    where: { status: "succeeded", processedAt: { lt: cutoff } },
  });
  return removed.count;
}

export async function pollIntegrationJobs() {
  if (running) return { skipped: true, reason: "poll_running" };
  running = true;
  lastPollAt = new Date();
  try {
    await recoverStaleJobs();
    await cleanupOldJobs();
    const concurrency = envNumber("INTEGRATION_WORKER_CONCURRENCY", DEFAULT_CONCURRENCY, 1, 12);
    const candidates = await prisma.posIntegrationJob.findMany({
      where: {
        status: { in: ["pending", "retrying"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        integration: { status: { in: ["connected", "degraded"] }, config: { path: ["syncMode"], equals: "active" } },
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      take: concurrency * 3,
      select: { id: true, integrationId: true },
    });
    const claimed = [];
    for (const candidate of candidates) {
      const lease = await claimIntegrationJob(prisma, candidate);
      if (lease) claimed.push(lease);
      if (claimed.length >= concurrency) break;
    }
    const results = await Promise.all(claimed.map((lease) => processIntegrationJob(lease.id, {
      lockToken: lease.lockToken,
    })));
    return { claimed: claimed.length, results };
  } catch (error) {
    lastError = { at: new Date(), message: errorMessage(error), jobId: null };
    console.error("integration worker poll error:", error);
    return { claimed: 0, error };
  } finally {
    running = false;
  }
}

export function startIntegrationWorker() {
  const enabled = String(process.env.INTEGRATION_WORKER_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled || timer) return;
  const intervalMs = envNumber("INTEGRATION_WORKER_INTERVAL_MS", DEFAULT_INTERVAL_MS, 500, 60000);
  pollIntegrationJobs().catch((error) => console.error("integration worker start error:", error));
  timer = setInterval(() => {
    pollIntegrationJobs().catch((error) => console.error("integration worker error:", error));
  }, intervalMs);
  timer.unref?.();
}

export function stopIntegrationWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function integrationWorkerStatus() {
  return {
    enabled: String(process.env.INTEGRATION_WORKER_ENABLED ?? "true").toLowerCase() !== "false",
    running,
    lastPollAt,
    lastSuccessAt,
    lastError,
    lastCleanupAt,
  };
}
