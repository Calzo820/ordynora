const VITE_ENV = import.meta.env || {};

export const API_URL = VITE_ENV.VITE_API_URL || "http://localhost:5000";
export const API_TIMEOUT_MS = Number(VITE_ENV.VITE_API_TIMEOUT_MS || 60000);

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function dispatchConnectionStatus(detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ordynora:connection-status", { detail }));
}

export function createClientRequestId(prefix = "request") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

export function getAuthToken() {
  return localStorage.getItem("auth_token") || "";
}

export function setAuthToken(token) {
  if (!token) return;
  localStorage.setItem("auth_token", token);
}

export function removeAuthToken() {
  localStorage.removeItem("auth_token");
}

export function getAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

export function clearAuthSession() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
  localStorage.removeItem("auth_restaurant");
  localStorage.removeItem("ristorante_attivo");
  localStorage.removeItem("restaurant_slug");
  localStorage.removeItem("restaurant_id");
  localStorage.removeItem("superadmin_platform_session");
}

async function parseResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildUrl(endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${API_URL}${endpoint}`;
}

async function performFetch(endpoint, options = {}, withAuth = true, attempt = 0) {
  const {
    timeoutMs = API_TIMEOUT_MS,
    skipRefresh,
    retries,
    retryDelayMs = 650,
    idempotencyKey,
    withAuth: _withAuth,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const maxRetries = Number.isFinite(Number(retries))
    ? Math.max(0, Number(retries))
    : ["GET", "HEAD"].includes(method) || idempotencyKey
      ? 2
      : 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(endpoint), {
      ...fetchOptions,
      signal: fetchOptions.signal || controller.signal,
      credentials: "include",
      headers: withAuth
        ? getAuthHeaders({
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            ...(fetchOptions.headers || {}),
          })
        : {
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            ...(fetchOptions.headers || {}),
          },
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After") || 0);
        const delay = retryAfterSeconds > 0
          ? Math.min(10000, retryAfterSeconds * 1000)
          : Math.min(4000, retryDelayMs * 2 ** attempt);
        await wait(delay);
        return performFetch(endpoint, options, withAuth, attempt + 1);
      }
      if (response.status === 402) {
        throw new Error(data?.message || "Piano non attivo: riattiva l'abbonamento da Billing per usare i dati reali del ristorante.");
      }
      if (response.status === 401 && withAuth && !skipRefresh) {
        try {
          const refresh = await fetch(buildUrl("/auth/refresh"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const refreshData = await parseResponse(refresh);
          if (refresh.ok && refreshData?.token) {
            setAuthToken(refreshData.token);
            return performFetch(endpoint, { ...options, skipRefresh: true }, true, attempt);
          }
        } catch {
          // Fall through to local logout.
        }
        clearAuthSession();
      }
      const apiError = new Error(data?.message || `Errore API (${response.status})`);
      apiError.status = response.status;
      apiError.transient = response.status >= 500 || response.status === 429;
      throw apiError;
    }

    dispatchConnectionStatus({ status: "connected", message: "Server raggiungibile" });
    return data;
  } catch (error) {
    const transient = error?.name === "AbortError"
      || error?.name === "TypeError"
      || /failed to fetch|network/i.test(error?.message || "");
    if (transient && attempt < maxRetries) {
      await wait(Math.min(4000, retryDelayMs * 2 ** attempt));
      return performFetch(endpoint, options, withAuth, attempt + 1);
    }
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Il server si sta avviando. Attendi qualche secondo e riprova.");
      timeoutError.transient = true;
      dispatchConnectionStatus({ status: "recovering", message: timeoutError.message });
      throw timeoutError;
    }
    if (error?.name === "TypeError" || /failed to fetch|network/i.test(error?.message || "")) {
      const networkError = new Error("Server in avvio o temporaneamente non disponibile. Riprova tra qualche secondo.");
      networkError.transient = true;
      dispatchConnectionStatus({ status: "offline", message: networkError.message });
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiFetch(endpoint, options = {}) {
  return performFetch(endpoint, options, options.withAuth ?? true);
}

export async function publicApiFetch(endpoint, options = {}) {
  return performFetch(endpoint, options, false);
}

export async function apiGet(endpoint, extraHeaders = {}) {
  return apiFetch(endpoint, { method: "GET", headers: extraHeaders });
}

export async function apiPost(endpoint, body = {}, extraHeaders = {}, options = {}) {
  return apiFetch(endpoint, {
    ...options,
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify(body),
  });
}

export async function apiPatch(endpoint, body = {}, extraHeaders = {}) {
  return apiFetch(endpoint, {
    method: "PATCH",
    headers: extraHeaders,
    body: JSON.stringify(body),
  });
}

export async function apiDelete(endpoint, extraHeaders = {}) {
  return apiFetch(endpoint, { method: "DELETE", headers: extraHeaders });
}

export async function publicApiGet(endpoint, extraHeaders = {}, options = {}) {
  return publicApiFetch(endpoint, { ...options, method: "GET", headers: extraHeaders });
}

export async function publicApiPost(endpoint, body = {}, extraHeaders = {}, options = {}) {
  return publicApiFetch(endpoint, {
    ...options,
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify(body),
  });
}

export async function publicApiPostIdempotent(endpoint, body = {}, extraHeaders = {}, idempotencyKey = "") {
  const requestId = idempotencyKey || body.clientRequestId || createClientRequestId("public");
  return publicApiFetch(endpoint, {
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify({ ...body, clientRequestId: body.clientRequestId || requestId }),
    idempotencyKey: requestId,
    retries: 2,
  });
}


export async function getBillingStatus() {
  return apiGet("/subscriptions/status");
}

export async function createSubscriptionCheckout(plan) {
  return apiPost("/subscriptions/checkout", { plan });
}

export async function openBillingPortal() {
  return apiPost("/subscriptions/portal", {});
}

export async function getStripeConnectStatus() {
  return apiGet("/payments/connect/status");
}

export async function openStripeConnectOnboarding() {
  return apiPost("/payments/connect/onboarding", {});
}

export async function openStripeConnectDashboard() {
  return apiPost("/payments/connect/dashboard", {});
}
