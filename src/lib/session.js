import { apiPost, clearAuthSession, setAuthToken } from "./api";

export function persistLoginPayload(payload) {
  if (payload?.token) setAuthToken(payload.token);
  if (payload?.user) localStorage.setItem("auth_user", JSON.stringify(payload.user));
  if (payload?.restaurant) {
    localStorage.setItem("auth_restaurant", JSON.stringify(payload.restaurant));
    localStorage.setItem("ristorante_attivo", payload.restaurant.name || "");
    localStorage.setItem("restaurant_slug", payload.restaurant.slug || "");
    localStorage.setItem("restaurant_id", payload.restaurant.id || "");
  } else if (payload && Object.prototype.hasOwnProperty.call(payload, "restaurant")) {
    localStorage.removeItem("auth_restaurant");
    localStorage.removeItem("ristorante_attivo");
    localStorage.removeItem("restaurant_slug");
    localStorage.removeItem("restaurant_id");
  }
}

export async function refreshSession() {
  const payload = await apiPost("/auth/refresh", {}, {}, { withAuth: false, skipRefresh: true });
  persistLoginPayload(payload);
  return payload;
}

export async function logoutSession() {
  try {
    await apiPost("/auth/logout", {}, {}, {
      withAuth: false,
      skipRefresh: true,
      timeoutMs: 5000,
    });
  } finally {
    clearAuthSession();
  }
}
