export const RESTAURANT_MODES = Object.freeze({
  FULL: "full",
  INTEGRATED: "integrated",
});

export function normalizeRestaurantMode(value) {
  return value === RESTAURANT_MODES.INTEGRATED
    ? RESTAURANT_MODES.INTEGRATED
    : RESTAURANT_MODES.FULL;
}

export function getStoredRestaurant() {
  if (typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("auth_restaurant") || "null");
  } catch {
    return null;
  }
}

export function getStoredRestaurantMode() {
  return normalizeRestaurantMode(getStoredRestaurant()?.operationMode);
}

export function isIntegratedMode(value = getStoredRestaurantMode()) {
  return normalizeRestaurantMode(value) === RESTAURANT_MODES.INTEGRATED;
}

export function persistRestaurantMode(mode) {
  if (typeof localStorage === "undefined") return;
  const restaurant = getStoredRestaurant();
  if (!restaurant) return;
  localStorage.setItem("auth_restaurant", JSON.stringify({
    ...restaurant,
    operationMode: normalizeRestaurantMode(mode),
  }));
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("ordynora:restaurant-mode", {
      detail: { operationMode: normalizeRestaurantMode(mode) },
    }));
  }
}

export function operationModeCopy(mode) {
  return isIntegratedMode(mode)
    ? {
        label: "Con gestionale",
        short: "Operatività Ordynora · cassa esterna",
        description: "Ordynora coordina sala, cucina e bar. Pagamenti, scontrini, fatture e chiusura cassa restano nel gestionale collegato.",
      }
    : {
        label: "Ordynora completa",
        short: "Gestione completa",
        description: "Ordynora gestisce servizio, conto, pagamenti registrati e chiusura giornaliera.",
      };
}
