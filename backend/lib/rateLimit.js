const stores = new Map();
const lastCleanupAt = new Map();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanup(store, keyPrefix, now) {
  const lastCleanup = lastCleanupAt.get(keyPrefix) || 0;
  if (store.size < 5000 && now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) store.delete(key);
  }
  lastCleanupAt.set(keyPrefix, now);
}

function setRateLimitHeaders(res, { maxRequests, remaining, resetAt }) {
  const resetSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader("RateLimit-Limit", String(maxRequests));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("RateLimit-Reset", String(resetSeconds));
  res.setHeader("X-RateLimit-Limit", String(maxRequests));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
}

export function createRateLimiter({ windowMs = 60000, maxRequests = 60, keyPrefix = "global", keyBuilder } = {}) {
  const store = stores.get(keyPrefix) || new Map();
  stores.set(keyPrefix, store);
  return (req, res, next) => {
    const now = Date.now();
    cleanup(store, keyPrefix, now);
    const key = keyBuilder?.(req) || `${req.ip}:${req.method}:${req.path}`;
    const entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      const resetAt = now + windowMs;
      store.set(key, { count: 1, resetAt });
      setRateLimitHeaders(res, { maxRequests, remaining: maxRequests - 1, resetAt });
      return next();
    }
    if (entry.count >= maxRequests) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      setRateLimitHeaders(res, { maxRequests, remaining: 0, resetAt: entry.resetAt });
      return res.status(429).json({ message: "Troppe richieste, riprova tra poco" });
    }
    entry.count += 1;
    setRateLimitHeaders(res, {
      maxRequests,
      remaining: maxRequests - entry.count,
      resetAt: entry.resetAt,
    });
    return next();
  };
}

function safeKeyPart(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase().slice(0, 160);
  return normalized || fallback;
}

export function publicOrderRateLimitKey(req) {
  return [
    safeKeyPart(req.ip, "no-ip"),
    safeKeyPart(req.body?.restaurantSlug || req.body?.restaurantId, "no-restaurant"),
    safeKeyPart(req.body?.tableToken || req.body?.tableId, "no-table"),
  ].join(":");
}
