import { API_URL } from "./api.js";

const QUEUE_KEY = "ordynora_pending_public_orders_v2";
const SYNCED_KEY_PREFIX = "ordynora_synced_public_order_v1:";
const LEGACY_QUEUE_KEY = "easymenu_pending_public_orders_v2";
const LEGACY_SYNCED_KEY_PREFIX = "easymenu_synced_public_order_v1:";
const MAX_AUTOMATIC_RETRIES = 8;
const REQUEST_TIMEOUT_MS = 20000;
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 5 * 60 * 1000;
let activeSync = null;

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function getPendingPublicOrders() {
  if (typeof window === "undefined") return [];
  const current = localStorage.getItem(QUEUE_KEY);
  const legacy = current === null ? localStorage.getItem(LEGACY_QUEUE_KEY) : null;
  if (current === null && legacy !== null) localStorage.setItem(QUEUE_KEY, legacy);
  return safeJson(current || legacy || "[]", []).filter(Boolean);
}

function saveQueue(queue) {
  const saved = queue.slice(-60);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent("ordynora:offline-queue", {
    detail: {
      pending: saved.length,
      failed: saved.filter((item) => item.status === "failed").length,
    },
  }));
}

export function pendingPublicOrdersCount() {
  return getPendingPublicOrders().length;
}

export function getPublicOrderQueueSummary() {
  const queue = getPendingPublicOrders();
  return {
    pending: queue.length,
    failed: queue.filter((item) => item.status === "failed").length,
  };
}

function syncedOrderKey(queueId) {
  return `${SYNCED_KEY_PREFIX}${queueId}`;
}

function rememberSyncedPublicOrder(queueId, result) {
  if (typeof window === "undefined" || !queueId) return;
  localStorage.setItem(syncedOrderKey(queueId), JSON.stringify({
    result,
    syncedAt: new Date().toISOString(),
  }));
}

export function consumeSyncedPublicOrder(queueId) {
  if (typeof window === "undefined" || !queueId) return null;
  const key = syncedOrderKey(queueId);
  const legacyKey = `${LEGACY_SYNCED_KEY_PREFIX}${queueId}`;
  const stored = safeJson(localStorage.getItem(key) || localStorage.getItem(legacyKey) || "null", null);
  localStorage.removeItem(key);
  localStorage.removeItem(legacyKey);
  return stored?.result || null;
}

export function enqueuePublicOrder(payload) {
  const queued = {
    id: payload.clientRequestId || `offline:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    payload: { ...payload, clientRequestId: payload.clientRequestId || `offline:${Date.now()}` },
    createdAt: new Date().toISOString(),
    retries: 0,
    lastError: null,
    status: "pending",
    nextAttemptAt: Date.now(),
  };
  const queue = getPendingPublicOrders().filter((item) => item.id !== queued.id);
  queue.push(queued);
  saveQueue(queue);
  return queued;
}

async function postPublicOrder(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/orders/public`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": payload.clientRequestId || "",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || `Ordine non sincronizzato (${response.status})`);
      error.status = response.status;
      error.transient = response.status >= 500 || response.status === 429;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      error.message = "Il server non ha risposto in tempo";
      error.transient = true;
    } else if (error?.name === "TypeError" || /failed to fetch|network/i.test(error?.message || "")) {
      error.transient = true;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function sendPublicOrderResilient(payload) {
  try {
    return await postPublicOrder(payload);
  } catch (error) {
    if ((typeof navigator !== "undefined" && navigator.onLine === false) || error?.transient) {
      const queued = enqueuePublicOrder(payload);
      return { queued: true, order: { id: queued.id, publicToken: null, status: "queued", createdAt: queued.createdAt } };
    }
    throw error;
  }
}

function isRetryable(error) {
  const status = Number(error?.status || 0);
  return Boolean(error?.transient) || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function runPendingPublicOrderSync({ force = false } = {}) {
  const queue = getPendingPublicOrders();
  if (!queue.length || (typeof navigator !== "undefined" && navigator.onLine === false)) return { sent: 0, pending: queue.length };

  const remaining = [];
  let sent = 0;
  let failed = 0;
  const now = Date.now();

  for (const item of queue) {
    if (!force && (item.status === "failed" || Number(item.nextAttemptAt || 0) > now)) {
      remaining.push(item);
      if (item.status === "failed") failed += 1;
      continue;
    }

    try {
      const result = await postPublicOrder(item.payload);
      sent += 1;
      rememberSyncedPublicOrder(item.id, result);
      window.dispatchEvent(new CustomEvent("ordynora:offline-order-synced", {
        detail: { queueId: item.id, result },
      }));
    } catch (error) {
      const retries = Number(item.retries || 0) + 1;
      const terminal = !isRetryable(error) || retries >= MAX_AUTOMATIC_RETRIES;
      const next = {
        ...item,
        retries,
        status: terminal ? "failed" : "retrying",
        lastError: error.message,
        lastAttemptAt: new Date().toISOString(),
        nextAttemptAt: terminal
          ? null
          : Date.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, retries - 1)),
      };
      remaining.push(next);
      if (terminal) {
        failed += 1;
        window.dispatchEvent(new CustomEvent("ordynora:offline-order-failed", {
          detail: { queueId: item.id, message: error.message, retryable: isRetryable(error) },
        }));
      }
    }
  }

  saveQueue(remaining);
  return { sent, pending: remaining.length, failed };
}

export function flushPendingPublicOrders(options = {}) {
  if (activeSync) return activeSync;
  activeSync = runPendingPublicOrderSync(options).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export function retryFailedPublicOrders() {
  const queue = getPendingPublicOrders().map((item) => item.status === "failed"
    ? { ...item, status: "pending", retries: 0, nextAttemptAt: Date.now(), lastError: null }
    : item);
  saveQueue(queue);
  return flushPendingPublicOrders({ force: true });
}

export function startOfflineOrderSync() {
  if (typeof window === "undefined") return () => {};
  const run = () => flushPendingPublicOrders().catch(() => {});
  window.addEventListener("online", run);
  const timer = window.setInterval(run, 20000);
  run();
  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(timer);
  };
}
