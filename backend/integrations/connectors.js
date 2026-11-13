import crypto from "node:crypto";

const TEAM_SYSTEM_TOKEN_URL = "https://api.cassanova.com/apikey/token";
const TEAM_SYSTEM_API_URL = "https://api.cassanova.com";
const TILBY_API_URL = "https://api.tilby.com/v2";
const TILBY_SESSION_URL = `${TILBY_API_URL}/sessions/me`;
const TEAM_SYSTEM_TOKEN_SAFETY_MS = 60 * 1000;
const teamSystemTokenCache = new Map();
const teamSystemTokenRequests = new Map();

export class PosConnectionError extends Error {
  constructor(message, {
    code = "POS_CONNECTION_FAILED",
    providerStatus = null,
    retryable = false,
    retryAfterMs = null,
  } = {}) {
    super(message);
    this.name = "PosConnectionError";
    this.code = code;
    this.providerStatus = providerStatus;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

async function parseResponseBody(response) {
  try {
    if (typeof response.json === "function") return await response.json();
    if (typeof response.text === "function") {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
  } catch {
    return null;
  }
  return null;
}

function safeProviderDetail(body, secrets = []) {
  if (!body || typeof body !== "object") return "";
  const candidates = [
    body.NAME,
    body.name,
    body.message,
    body.error_description,
    body.error?.message,
    body.error,
    body.details?.message,
    body.DETAILS?.message,
    body.DETAILS?.msg,
    body.DETAILS?.createErrorDetails?.[0]?.msg,
  ];
  const value = candidates.find((entry) => typeof entry === "string" && entry.trim());
  let detail = String(value || "");
  for (const secret of secrets.filter((entry) => entry.length >= 4)) {
    detail = detail.split(secret).join("[REDACTED]");
  }
  return detail
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function statusError(providerName, status, retryAfterMs = null, body = null, secrets = []) {
  if (status === 401 || status === 403) {
    return new PosConnectionError(`${providerName} ha rifiutato le credenziali. Controlla chiave, permessi e ambiente.`, {
      code: "POS_CREDENTIALS_REJECTED",
      providerStatus: status,
    });
  }
  if (status === 404) {
    return new PosConnectionError(`${providerName} non espone il servizio richiesto per questo account. Verifica l'abilitazione API.`, {
      code: "POS_API_NOT_ENABLED",
      providerStatus: status,
    });
  }
  if (status === 429) {
    return new PosConnectionError(`${providerName} ha limitato temporaneamente le richieste. Riprova tra qualche minuto.`, {
      code: "POS_RATE_LIMITED",
      providerStatus: status,
      retryable: true,
      retryAfterMs,
    });
  }
  if (status >= 500) {
    return new PosConnectionError(`${providerName} è temporaneamente non disponibile. Le credenziali non sono state modificate.`, {
      code: "POS_UPSTREAM_UNAVAILABLE",
      providerStatus: status,
      retryable: true,
    });
  }
  if ([400, 409, 422].includes(status)) {
    const detail = safeProviderDetail(body, secrets);
    return new PosConnectionError(
      `${providerName} ha rifiutato i dati inviati${detail ? `: ${detail}` : ". Controlla configurazione e abbinamenti."}`,
      {
        code: "POS_REQUEST_REJECTED",
        providerStatus: status,
      }
    );
  }
  return new PosConnectionError(`Test ${providerName} non riuscito (risposta ${status}).`, {
    providerStatus: status,
  });
}

function parseRetryAfter(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = new Date(raw).getTime();
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function requestSecrets(options) {
  const values = [];
  for (const [key, value] of Object.entries(options?.headers || {})) {
    if (/authorization|api.?key|token|secret/i.test(key)) {
      values.push(String(value), String(value).replace(/^Bearer\s+/i, ""));
    }
  }
  try {
    const body = JSON.parse(options?.body || "{}");
    for (const [key, value] of Object.entries(body)) {
      if (/password|api.?key|token|secret/i.test(key) && typeof value === "string") values.push(value);
    }
  } catch { /* Non-JSON request bodies contain no connector credentials. */ }
  return [...new Set(values)];
}

export async function requestProviderJson(url, options, {
  fetchImpl = globalThis.fetch,
  timeoutMs = Number(process.env.INTEGRATION_HTTP_TIMEOUT_MS || 15000),
  providerName,
  acceptedStatuses = [],
  beforeRequest,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new PosConnectionError("Client HTTP non disponibile sul server", { code: "POS_HTTP_UNAVAILABLE" });
  }

  // A fenced-out worker must stop before making another provider request.
  // Keep this outside the HTTP catch block so lease errors are not retried
  // or misreported as network failures.
  if (beforeRequest) await beforeRequest();

  const controller = new AbortController();
  const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.max(100, Math.min(60000, Number(timeoutMs))) : 15000;
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  timer.unref?.();

  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const body = await parseResponseBody(response);
    const status = Number(response.status || 500);
    if (!response.ok && !acceptedStatuses.includes(status)) {
      const retryAfterMs = parseRetryAfter(response.headers?.get?.("retry-after"));
      throw statusError(providerName, status, retryAfterMs, body, requestSecrets(options));
    }
    if (response.ok && status !== 204 && body === null) {
      throw new PosConnectionError(`${providerName} ha restituito una risposta vuota o non JSON. Nessun nuovo invio viene confermato.`, {
        code: "POS_INVALID_RESPONSE", providerStatus: status, retryable: true,
      });
    }
    return { body, status, headers: response.headers };
  } catch (error) {
    if (error instanceof PosConnectionError) throw error;
    if (error?.name === "AbortError") {
      throw new PosConnectionError(`La richiesta a ${providerName} ha superato ${Math.round(effectiveTimeoutMs / 1000)} secondi. Riprova.`, {
        code: "POS_CONNECTION_TIMEOUT",
        retryable: true,
      });
    }
    throw new PosConnectionError(`Impossibile raggiungere ${providerName}. Verifica la connessione del server e riprova.`, {
      code: "POS_NETWORK_ERROR",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function testTilby({ credentials, config, fetchImpl, timeoutMs }) {
  const { body: data } = await requestProviderJson(
    TILBY_SESSION_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    },
    { fetchImpl, timeoutMs, providerName: "Tilby" }
  );

  const shop = data?.shop || data?.session?.shop;
  if (!shop?.id && !shop?.uuid && !data?.shopId) {
    throw new PosConnectionError("Tilby non ha restituito l'identità del punto vendita. Verifica token e permessi prima di attivare.", {
      code: "POS_SHOP_MISSING",
    });
  }

  if (shop?.tilby_sales_enabled === false) {
    throw new PosConnectionError(
      "Il punto vendita Tilby è raggiungibile, ma l'accesso alle vendite non è abilitato per questa integrazione.",
      { code: "POS_SALES_NOT_ENABLED" }
    );
  }

  return {
    outcome: "connected",
    message: config.environment === "production"
      ? "Connessione Tilby verificata in produzione. Ora completa la mappatura di prodotti e tavoli."
      : "Token Tilby verificato. Mantieni la sandbox finché la mappatura non è stata collaudata.",
    remote: {
      shopDetected: Boolean(data?.shop || data?.shopId || data?.session?.shop),
      shopId: data?.shop?.id ?? data?.shopId ?? data?.session?.shop?.id ?? null,
      shopName: String(data?.shop?.name || data?.session?.shop?.name || "").slice(0, 120) || null,
      shopUuid: String(data?.shop?.uuid || data?.session?.shop?.uuid || "").slice(0, 80) || null,
      salesEnabled: shop?.tilby_sales_enabled !== false,
    },
  };
}

async function testTeamSystem({ credentials, config, fetchImpl, timeoutMs }) {
  const { body: data } = await requestProviderJson(
    TEAM_SYSTEM_TOKEN_URL,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "Ordynora",
      },
      body: JSON.stringify({ apiKey: credentials.apiKey }),
    },
    { fetchImpl, timeoutMs, providerName: "Cassa in Cloud" }
  );

  if (!data?.access_token || typeof data.access_token !== "string") {
    throw new PosConnectionError("Cassa in Cloud ha risposto senza un token valido. Verifica i permessi associati all'API key.", {
      code: "POS_TOKEN_MISSING",
    });
  }

  const { body: salesPointBody } = await requestProviderJson(
    `${TEAM_SYSTEM_API_URL}/salespoint?hasActiveLicense=true`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${data.access_token}`,
        "X-Version": "1.0.0",
        "X-Requested-With": "Ordynora",
      },
    },
    { fetchImpl, timeoutMs, providerName: "Cassa in Cloud" }
  );
  const rawSalesPoints = Array.isArray(salesPointBody)
    ? salesPointBody
    : salesPointBody?.salesPoints || salesPointBody?.salesPoint || [];
  const salesPoints = (Array.isArray(rawSalesPoints) ? rawSalesPoints : [])
    .map((point) => ({
      id: String(point?.id ?? point?.idSalesPoint ?? "").trim(),
      name: String(point?.description || point?.name || "Punto vendita").trim().slice(0, 120),
    }))
    .filter((point) => point.id);
  if (!salesPoints.length) {
    throw new PosConnectionError(
      "L'API key è valida, ma non restituisce punti vendita con licenza API attiva.",
      { code: "POS_SALES_POINT_MISSING" }
    );
  }

  const configuredSalesPointId = String(config?.salesPointId || "").trim();
  const selectedSalesPoint = configuredSalesPointId
    ? salesPoints.find((point) => point.id === configuredSalesPointId)
    : salesPoints.length === 1 ? salesPoints[0] : null;
  if (configuredSalesPointId && !selectedSalesPoint) {
    throw new PosConnectionError(
      "Il punto vendita selezionato non è accessibile con questa API key. Scegline uno tra quelli restituiti da Cassa in Cloud.",
      { code: "POS_SALES_POINT_NOT_ALLOWED" }
    );
  }

  return {
    outcome: "connected",
    message: selectedSalesPoint
      ? `API key verificata per ${selectedSalesPoint.name}. Ora abbina prodotti e tavoli.`
      : `API key verificata. Scegli uno dei ${salesPoints.length} punti vendita e completa gli abbinamenti.`,
    remote: {
      tokenType: String(data.token_type || "Bearer").slice(0, 30),
      expiresIn: Number.isFinite(Number(data.expires_in)) ? Number(data.expires_in) : null,
      salesPoints,
      selectedSalesPoint,
      suggestedConfig: !configuredSalesPointId && salesPoints.length === 1
        ? { salesPointId: salesPoints[0].id }
        : null,
    },
  };
}

function teamSystemCacheKey(credentials) {
  return crypto.createHash("sha256").update(String(credentials?.apiKey || "")).digest("hex");
}

export function invalidateTeamSystemAccessToken(credentials) {
  teamSystemTokenCache.delete(teamSystemCacheKey(credentials));
}

export async function getTeamSystemAccessToken(credentials, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs,
    forceRefresh = false,
    beforeRequest,
  } = options;
  if (beforeRequest) await beforeRequest();
  const cacheKey = teamSystemCacheKey(credentials);
  const cacheAllowed = fetchImpl === globalThis.fetch;
  if (forceRefresh) teamSystemTokenCache.delete(cacheKey);
  const cached = cacheAllowed ? teamSystemTokenCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now() + 15_000) return cached.token;
  const pending = cacheAllowed ? teamSystemTokenRequests.get(cacheKey) : null;
  if (pending) return pending;

  const requestToken = (async () => {
    const { body } = await requestProviderJson(
      TEAM_SYSTEM_TOKEN_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "Ordynora",
        },
        body: JSON.stringify({ apiKey: credentials.apiKey }),
      },
      // The exchange can be shared by several jobs. Never bind its promise
      // to one job's lease; each caller checks its own lease above, and the
      // subsequent catalog/order request checks again before using the token.
      { fetchImpl, timeoutMs, providerName: "Cassa in Cloud" }
    );
    if (!body?.access_token || typeof body.access_token !== "string") {
      throw new PosConnectionError("Cassa in Cloud ha risposto senza un token valido. Verifica i permessi associati all'API key.", {
        code: "POS_TOKEN_MISSING",
      });
    }
    if (cacheAllowed) {
      const expiresInMs = Math.max(1000, Number(body.expires_in || 3600) * 1000);
      const safetyMs = Math.min(TEAM_SYSTEM_TOKEN_SAFETY_MS, Math.max(1000, expiresInMs * 0.1));
      if (teamSystemTokenCache.size > 500) {
        for (const [key, value] of teamSystemTokenCache) {
          if (value.expiresAt <= Date.now()) teamSystemTokenCache.delete(key);
        }
      }
      teamSystemTokenCache.set(cacheKey, {
        token: body.access_token,
        expiresAt: Date.now() + Math.max(1000, expiresInMs - safetyMs),
      });
    }
    return body.access_token;
  })();

  if (cacheAllowed) teamSystemTokenRequests.set(cacheKey, requestToken);
  try {
    return await requestToken;
  } finally {
    if (teamSystemTokenRequests.get(cacheKey) === requestToken) {
      teamSystemTokenRequests.delete(cacheKey);
    }
  }
}

function testPassepartout(config) {
  return {
    outcome: "assisted_required",
    message: "Richiesta salvata. Per Passepartout Menu va verificato con il partner il canale disponibile sulla tua installazione.",
    remote: {
      installationProvided: Boolean(config.installationName),
    },
  };
}

export async function testProviderConnection(provider, {
  credentials = {},
  config = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = 12000,
} = {}) {
  if (provider === "tilby") return testTilby({ credentials, config, fetchImpl, timeoutMs });
  if (provider === "teamsystem_cassa_in_cloud") {
    return testTeamSystem({ credentials, config, fetchImpl, timeoutMs });
  }
  if (provider === "passepartout_menu") return testPassepartout(config);
  throw new PosConnectionError("Gestionale non supportato", { code: "POS_PROVIDER_UNSUPPORTED" });
}

export const CONNECTOR_ENDPOINTS = Object.freeze({
  tilby: TILBY_SESSION_URL,
  teamsystem_cassa_in_cloud: TEAM_SYSTEM_TOKEN_URL,
  tilbyApi: TILBY_API_URL,
  teamSystemApi: TEAM_SYSTEM_API_URL,
});
