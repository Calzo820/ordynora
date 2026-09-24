const PLATFORM_SESSION_KEY = "superadmin_platform_session";
const SUPPORT_MODE_KEY = "superadmin_mode";
const LEGACY_ORIGINAL_TOKEN_KEY = "superadmin_original_token";

const RESTAURANT_KEYS = [
  "auth_restaurant",
  "ristorante_attivo",
  "restaurant_slug",
  "restaurant_id",
];

function getStorage(storage) {
  const target = storage || globalThis.localStorage;
  if (!target) throw new Error("Archivio sessione non disponibile");
  return target;
}

function readSnapshot(storage) {
  try {
    return JSON.parse(storage.getItem(PLATFORM_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function clearRestaurantContext(storage) {
  RESTAURANT_KEYS.forEach((key) => storage.removeItem(key));
}

export function hasPlatformSession(storage) {
  const target = getStorage(storage);
  return Boolean(readSnapshot(target)?.token);
}

export function beginSupportSession(payload, storage) {
  const target = getStorage(storage);
  if (!payload?.token || !payload?.user || !payload?.restaurant?.id) {
    throw new Error("Risposta assistenza non valida");
  }

  const platformToken = target.getItem("auth_token");
  if (!platformToken) throw new Error("Sessione Super Admin non disponibile");

  const snapshot = {
    version: 2,
    token: platformToken,
    user: target.getItem("auth_user"),
    capturedAt: new Date().toISOString(),
  };

  target.setItem(PLATFORM_SESSION_KEY, JSON.stringify(snapshot));
  target.setItem("auth_token", payload.token);
  target.setItem("auth_user", JSON.stringify(payload.user));
  target.setItem("auth_restaurant", JSON.stringify(payload.restaurant));
  target.setItem("ristorante_attivo", payload.restaurant.name || "");
  target.setItem("restaurant_slug", payload.restaurant.slug || "");
  target.setItem("restaurant_id", payload.restaurant.id);
  target.setItem(SUPPORT_MODE_KEY, "1");
  target.removeItem(LEGACY_ORIGINAL_TOKEN_KEY);

  return snapshot;
}

export function restorePlatformSession(storage) {
  const target = getStorage(storage);
  const snapshot = readSnapshot(target);

  if (!snapshot?.token) {
    target.removeItem("auth_token");
    target.removeItem("auth_user");
    clearRestaurantContext(target);
    target.removeItem(PLATFORM_SESSION_KEY);
    target.removeItem(SUPPORT_MODE_KEY);
    target.removeItem(LEGACY_ORIGINAL_TOKEN_KEY);
    return false;
  }

  target.setItem("auth_token", snapshot.token);
  if (snapshot.user) target.setItem("auth_user", snapshot.user);
  else target.removeItem("auth_user");
  clearRestaurantContext(target);
  target.removeItem(PLATFORM_SESSION_KEY);
  target.removeItem(SUPPORT_MODE_KEY);
  target.removeItem(LEGACY_ORIGINAL_TOKEN_KEY);
  return true;
}

export function clearPlatformSession(storage) {
  const target = getStorage(storage);
  target.removeItem(PLATFORM_SESSION_KEY);
  target.removeItem(SUPPORT_MODE_KEY);
  target.removeItem(LEGACY_ORIGINAL_TOKEN_KEY);
}
