export const STAFF_RESTAURANT_CODE_KEY = "ordynora_staff_restaurant_code";
export const LEGACY_STAFF_RESTAURANT_CODE_KEY = "easymenu_staff_restaurant_code";

export function normalizeRestaurantCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getRestaurantCodeFromSearch(search = "") {
  const params = new URLSearchParams(search);
  return normalizeRestaurantCode(
    params.get("restaurant") || params.get("locale") || params.get("ristorante") || ""
  );
}

export function getRememberedRestaurantCode(storage = globalThis.localStorage) {
  if (!storage) return "";
  return normalizeRestaurantCode(
    storage.getItem(STAFF_RESTAURANT_CODE_KEY)
      || storage.getItem(LEGACY_STAFF_RESTAURANT_CODE_KEY)
      || ""
  );
}

export function rememberRestaurantCode(value, storage = globalThis.localStorage) {
  const code = normalizeRestaurantCode(value);
  if (!storage || !code) return code;
  storage.setItem(STAFF_RESTAURANT_CODE_KEY, code);
  storage.removeItem(LEGACY_STAFF_RESTAURANT_CODE_KEY);
  return code;
}

export function forgetRestaurantCode(storage = globalThis.localStorage) {
  if (!storage) return;
  storage.removeItem(STAFF_RESTAURANT_CODE_KEY);
  storage.removeItem(LEGACY_STAFF_RESTAURANT_CODE_KEY);
}

export function isPinStaffUser(user) {
  return Boolean(user?.pinAccess)
    || ["kitchen", "bar", "cashier", "waiter"].includes(String(user?.role || "").toLowerCase());
}
