import prisma from "../lib/prisma.js";
import { isIntegrationEncryptionConfigured } from "../lib/integrationCrypto.js";
import { integrationWorkerStatus } from "./integrationWorker.service.js";

let monitorTimer = null;
let lastHealthy = null;

export async function collectSystemHealth() {
  const startedAt = Date.now();
  const backupEnabled = String(process.env.BACKUP_ENABLED || "").toLowerCase() === "true";
  const checks = {
    database: { ok: false },
    stripe: {
      ok: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      connectWebhookConfigured: Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
    },
    email: { ok: Boolean(process.env.BREVO_API_KEY), configured: Boolean(process.env.BREVO_API_KEY) },
    backups: {
      ok: false,
      enabled: backupEnabled,
      configured: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
      lastSuccessAt: null,
      uploaded: false,
    },
    integrations: {
      ok: true,
      configured: isIntegrationEncryptionConfigured(),
      workerEnabled: false,
      lastPollAt: null,
      activeRestaurants: 0,
      pending: 0,
      retrying: 0,
      failed: 0,
      blocked: 0,
      oldestPendingAt: null,
    },
  };

  try {
    const [, latestBackup, integrations] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.errorLog.findFirst({
        where: { source: "backup-success", level: "info" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, metadata: true },
      }),
      prisma.posIntegration.findMany({
        where: { status: { in: ["connected", "degraded"] } },
        select: { id: true, config: true },
      }),
    ]);
    checks.database = { ok: true };
    const intervalHours = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS || 24));
    const maxAgeMs = (intervalHours * 2 + 2) * 60 * 60 * 1000;
    const lastSuccessAt = latestBackup?.createdAt || null;
    checks.backups.lastSuccessAt = lastSuccessAt;
    checks.backups.uploaded = Boolean(latestBackup?.metadata?.uploaded);
    checks.backups.ok = backupEnabled
      && checks.backups.configured
      && Boolean(lastSuccessAt)
      && Date.now() - new Date(lastSuccessAt).getTime() <= maxAgeMs;

    const activeIds = integrations
      .filter((integration) => integration.config?.syncMode === "active")
      .map((integration) => integration.id);
    const worker = integrationWorkerStatus();
    checks.integrations.workerEnabled = worker.enabled;
    checks.integrations.lastPollAt = worker.lastPollAt;
    checks.integrations.activeRestaurants = activeIds.length;
    if (activeIds.length) {
      const [groups, oldestPending] = await Promise.all([
        prisma.posIntegrationJob.groupBy({
          by: ["status"],
          where: { integrationId: { in: activeIds } },
          _count: { _all: true },
        }),
        prisma.posIntegrationJob.findFirst({
          where: {
            integrationId: { in: activeIds },
            status: { in: ["pending", "processing", "retrying"] },
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);
      for (const group of groups) {
        if (Object.hasOwn(checks.integrations, group.status)) {
          checks.integrations[group.status] = group._count._all;
        }
      }
      checks.integrations.oldestPendingAt = oldestPending?.createdAt || null;
      const intervalMs = Math.max(500, Number(process.env.INTEGRATION_WORKER_INTERVAL_MS || 2000));
      const workerFresh = Boolean(worker.lastPollAt)
        && Date.now() - new Date(worker.lastPollAt).getTime() <= Math.max(60000, intervalMs * 5);
      const queueFresh = !oldestPending
        || Date.now() - new Date(oldestPending.createdAt).getTime() <= 10 * 60 * 1000;
      checks.integrations.ok = checks.integrations.configured
        && worker.enabled
        && workerFresh
        && queueFresh
        && checks.integrations.failed === 0
        && checks.integrations.blocked === 0;
    }
  } catch (error) {
    checks.database = { ok: false, code: error?.code || "database_unavailable" };
  }

  const healthy = checks.database.ok && checks.integrations.ok;
  return {
    ok: healthy,
    service: "ordynora-backend",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  };
}

async function notifyMonitor(payload) {
  const url = String(process.env.MONITOR_WEBHOOK_URL || "").trim();
  if (!url) return;
  const token = String(process.env.MONITOR_WEBHOOK_TOKEN || "").trim();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Monitor webhook HTTP ${response.status}`);
}

async function runMonitorCheck() {
  try {
    const health = await collectSystemHealth();
    if (lastHealthy === null) {
      lastHealthy = health.ok;
      if (!health.ok) {
        await notifyMonitor({
          event: "service_unhealthy",
          service: health.service,
          timestamp: health.timestamp,
          checks: health.checks,
        });
      }
      return;
    }
    if (health.ok !== lastHealthy) {
      await notifyMonitor({
        event: health.ok ? "service_recovered" : "service_unhealthy",
        service: health.service,
        timestamp: health.timestamp,
        checks: health.checks,
      });
      lastHealthy = health.ok;
    }
  } catch (error) {
    console.error("health monitor error:", error.message);
  }
}

export function startHealthMonitor() {
  if (monitorTimer || !process.env.MONITOR_WEBHOOK_URL) return;
  const configured = Number(process.env.MONITOR_INTERVAL_MS || 300000);
  const intervalMs = Math.max(60000, Number.isFinite(configured) ? configured : 300000);
  monitorTimer = setInterval(runMonitorCheck, intervalMs);
  monitorTimer.unref?.();
  setTimeout(runMonitorCheck, 10000).unref?.();
}

export function stopHealthMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}
