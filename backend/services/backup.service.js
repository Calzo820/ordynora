import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import prisma from "../lib/prisma.js";
import { logError } from "../lib/logger.js";

const gzipAsync = promisify(gzip);
// Nuovi backup: Ordynora. Il verificatore continua ad accettare anche il magic storico.
const MAGIC = Buffer.from("ORDYNORA1");

function backupKey() {
  const secret = String(process.env.BACKUP_ENCRYPTION_KEY || "");
  if (secret.length < 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY deve contenere almeno 32 caratteri");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

async function collectBackupData() {
  const [
    restaurants,
    users,
    userSessions,
    menuItems,
    tables,
    reservations,
    tableSessions,
    orders,
    orderItems,
    orderStatusHistory,
    payments,
    subscriptions,
    orderCounters,
    errorLogs,
    cashClosures,
    auditLogs,
    stockMovements,
    printJobs,
    posIntegrations,
    posIntegrationMappings,
    posIntegrationJobs,
  ] = await Promise.all([
    prisma.restaurant.findMany(),
    prisma.user.findMany(),
    prisma.userSession.findMany(),
    prisma.menuItem.findMany(),
    prisma.table.findMany(),
    prisma.reservation.findMany(),
    prisma.tableSession.findMany(),
    prisma.order.findMany(),
    prisma.orderItem.findMany(),
    prisma.orderStatusHistory.findMany(),
    prisma.paymentTransaction.findMany(),
    prisma.saaSSubscription.findMany(),
    prisma.orderCounter.findMany(),
    prisma.errorLog.findMany(),
    prisma.cashClosure.findMany(),
    prisma.auditLog.findMany(),
    prisma.stockMovement.findMany(),
    prisma.printJob.findMany(),
    prisma.posIntegration.findMany(),
    prisma.posIntegrationMapping.findMany(),
    prisma.posIntegrationJob.findMany(),
  ]);

  return {
    format: "ordynora-encrypted-backup",
    version: 1,
    generatedAt: new Date().toISOString(),
    data: {
      restaurants,
      users,
      userSessions,
      menuItems,
      tables,
      reservations,
      tableSessions,
      orders,
      orderItems,
      orderStatusHistory,
      payments,
      subscriptions,
      orderCounters,
      errorLogs,
      cashClosures,
      auditLogs,
      stockMovements,
      printJobs,
      posIntegrations,
      posIntegrationMappings,
      posIntegrationJobs,
    },
  };
}

function encrypt(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

async function removeExpiredBackups(directory) {
  const configured = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  const retentionDays = Math.max(1, Number.isFinite(configured) ? configured : 14);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(files
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json.gz.enc"))
    .map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) await fs.unlink(filePath);
    }));
}

async function uploadBackup(fileName, encrypted) {
  const uploadUrl = String(process.env.BACKUP_UPLOAD_URL || "").trim();
  if (!uploadUrl) return { uploaded: false };
  const token = String(process.env.BACKUP_UPLOAD_TOKEN || "").trim();
  const target = uploadUrl.includes("{filename}")
    ? uploadUrl.replace("{filename}", encodeURIComponent(fileName))
    : uploadUrl;
  const response = await fetch(target, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: encrypted,
  });
  if (!response.ok) throw new Error(`Backup upload HTTP ${response.status}`);
  return { uploaded: true };
}

export async function runEncryptedBackup() {
  const payload = await collectBackupData();
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(payload)));
  const encrypted = encrypt(compressed);
  const directory = path.resolve(process.env.BACKUP_DIR || "./backups");
  await fs.mkdir(directory, { recursive: true });
  const fileName = `ordynora-${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz.enc`;
  const filePath = path.join(directory, fileName);
  await fs.writeFile(filePath, encrypted);
  const upload = await uploadBackup(fileName, encrypted);
  await removeExpiredBackups(directory);

  if (upload.uploaded && String(process.env.BACKUP_KEEP_LOCAL || "true").toLowerCase() === "false") {
    await fs.unlink(filePath);
  }
  await logError({
    source: "backup-success",
    level: "info",
    message: "Backup cifrato completato",
    metadata: { fileName, bytes: encrypted.length, uploaded: upload.uploaded },
  });
  return { fileName, bytes: encrypted.length, uploaded: upload.uploaded };
}

let backupTimer = null;

export function startBackupScheduler() {
  if (backupTimer || String(process.env.BACKUP_ENABLED || "").toLowerCase() !== "true") return;
  const configuredHours = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
  const intervalHours = Number.isFinite(configuredHours) ? configuredHours : 24;
  const intervalMs = Math.max(60 * 60 * 1000, intervalHours * 60 * 60 * 1000);
  const run = () => runEncryptedBackup()
    .then((result) => console.log(`Backup cifrato completato: ${result.fileName}`))
    .catch((error) => {
      console.error("backup error:", error.message);
      logError({
        source: "backup-failed",
        level: "error",
        message: error.message || "Backup non riuscito",
        error,
      }).catch(() => {});
    });
  backupTimer = setInterval(run, intervalMs);
  backupTimer.unref?.();
  setTimeout(run, 30000).unref?.();
}

export function stopBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = null;
}
