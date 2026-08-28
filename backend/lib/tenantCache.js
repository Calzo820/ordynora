const entries = new Map();
const pendingLoads = new Map();
const DEFAULT_TTL_MS = 8_000;
const DEFAULT_MAX_ENTRIES = 500;

function cacheKey(namespace, tenantId) {
  return `${namespace}:${tenantId}`;
}

function prune(maxEntries, now = Date.now()) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }

  while (entries.size >= maxEntries) {
    const oldestKey = entries.keys().next().value;
    if (!oldestKey) break;
    entries.delete(oldestKey);
  }
}

export async function getTenantCached(namespace, tenantId, loader, options = {}) {
  if (!namespace || !tenantId || typeof loader !== "function") return loader();

  const key = cacheKey(namespace, tenantId);
  const now = Date.now();
  const cached = entries.get(key);
  if (cached?.expiresAt > now) {
    entries.delete(key);
    entries.set(key, cached);
    return cached.value;
  }

  if (pendingLoads.has(key)) return pendingLoads.get(key);

  const ttlMs = Math.max(1_000, Number(options.ttlMs || DEFAULT_TTL_MS));
  const maxEntries = Math.max(10, Number(options.maxEntries || DEFAULT_MAX_ENTRIES));
  const load = Promise.resolve()
    .then(loader)
    .then((value) => {
      prune(maxEntries);
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => pendingLoads.delete(key));

  pendingLoads.set(key, load);
  return load;
}

export function invalidateTenantCache(tenantId, namespace = "") {
  const suffix = `:${tenantId}`;
  for (const key of entries.keys()) {
    if (key.endsWith(suffix) && (!namespace || key.startsWith(`${namespace}:`))) {
      entries.delete(key);
    }
  }
}

export function clearTenantCache() {
  entries.clear();
  pendingLoads.clear();
}
