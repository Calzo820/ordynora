const TEAM_SYSTEM_TOKEN_URL = "https://api.cassanova.com/apikey/token";
const TILBY_SESSION_URL = "https://api.scloby.com/v2/sessions/me";

export class PosConnectionError extends Error {
  constructor(message, { code = "POS_CONNECTION_FAILED", providerStatus = null } = {}) {
    super(message);
    this.name = "PosConnectionError";
    this.code = code;
    this.providerStatus = providerStatus;
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

function statusError(providerName, status) {
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
    });
  }
  if (status >= 500) {
    return new PosConnectionError(`${providerName} è temporaneamente non disponibile. Le credenziali non sono state modificate.`, {
      code: "POS_UPSTREAM_UNAVAILABLE",
      providerStatus: status,
    });
  }
  return new PosConnectionError(`Test ${providerName} non riuscito (risposta ${status}).`, {
    providerStatus: status,
  });
}

async function requestJson(url, options, { fetchImpl = globalThis.fetch, timeoutMs = 12000, providerName }) {
  if (typeof fetchImpl !== "function") {
    throw new PosConnectionError("Client HTTP non disponibile sul server", { code: "POS_HTTP_UNAVAILABLE" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const body = await parseResponseBody(response);
    if (!response.ok) throw statusError(providerName, Number(response.status || 500));
    return body;
  } catch (error) {
    if (error instanceof PosConnectionError) throw error;
    if (error?.name === "AbortError") {
      throw new PosConnectionError(`Il test ${providerName} ha superato ${Math.round(timeoutMs / 1000)} secondi. Riprova.`, {
        code: "POS_CONNECTION_TIMEOUT",
      });
    }
    throw new PosConnectionError(`Impossibile raggiungere ${providerName}. Verifica la connessione del server e riprova.`, {
      code: "POS_NETWORK_ERROR",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function testTilby({ credentials, config, fetchImpl, timeoutMs }) {
  const data = await requestJson(
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

  return {
    outcome: "connected",
    message: config.environment === "production"
      ? "Connessione Tilby verificata in produzione. Ora completa la mappatura di prodotti e tavoli."
      : "Token Tilby verificato. Mantieni la sandbox finché la mappatura non è stata collaudata.",
    remote: {
      shopDetected: Boolean(data?.shop || data?.shopId || data?.session?.shop),
    },
  };
}

async function testTeamSystem({ credentials, fetchImpl, timeoutMs }) {
  const data = await requestJson(
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

  return {
    outcome: "connected",
    message: "API key Cassa in Cloud verificata. Il prossimo passo è mappare punto vendita, prodotti e tavoli.",
    remote: {
      tokenType: String(data.token_type || "Bearer").slice(0, 30),
      expiresIn: Number.isFinite(Number(data.expires_in)) ? Number(data.expires_in) : null,
    },
  };
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
});
