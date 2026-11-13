const CONNECTION_STATES = Object.freeze({
  available: "available",
  mappingRequired: "mapping_required",
  partnerSetup: "partner_setup",
  planned: "planned",
  assisted: "assisted",
});

const PUBLIC_PROVIDER_IDS = Object.freeze(["tilby", "teamsystem_cassa_in_cloud"]);

const PROVIDERS = Object.freeze({
  tilby: {
    id: "tilby",
    name: "Tilby",
    vendor: "Zucchetti",
    setupMode: "partner",
    badge: "API partner",
    summary: "Comande aperte e aggiornate durante il servizio; incasso e documento fiscale restano in Tilby.",
    requirements: [
      "Accesso al programma sviluppatori Tilby",
      "Token API associato al punto vendita",
      "Abilitazione o certificazione per l'uso in produzione",
    ],
    officialDocs: "https://developer.tilby.com/",
    credentialFields: [
      {
        key: "accessToken",
        label: "Token API Tilby",
        type: "password",
        required: true,
        placeholder: "Incolla il token rilasciato da Tilby",
        help: "Il token resta cifrato sul server Ordynora e non viene mai restituito al browser.",
      },
    ],
    configFields: [
      {
        key: "environment",
        label: "Ambiente",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Sandbox / test" },
          { value: "production", label: "Produzione" },
        ],
        defaultValue: "sandbox",
      },
      {
        key: "shopLabel",
        label: "Nome punto vendita (facoltativo)",
        type: "text",
        required: false,
        placeholder: "Es. Ordynora Milano Centro",
      },
    ],
    syncStrategy: {
      title: "Sincronizzazione durante il servizio",
      description: "Ordynora crea una vendita aperta in Tilby e la aggiorna quando cambia la comanda. Tilby resta responsabile di incasso e fiscalizzazione.",
      activationNote: "Per la produzione servono l'abilitazione e la certificazione previste dal programma sviluppatori Tilby.",
    },
    capabilities: {
      connectionTest: CONNECTION_STATES.available,
      menuImport: CONNECTION_STATES.mappingRequired,
      tableSync: CONNECTION_STATES.mappingRequired,
      orderExport: CONNECTION_STATES.mappingRequired,
      fiscalDocuments: CONNECTION_STATES.partnerSetup,
      webhooks: CONNECTION_STATES.planned,
    },
  },
  teamsystem_cassa_in_cloud: {
    id: "teamsystem_cassa_in_cloud",
    name: "Cassa in Cloud",
    vendor: "TeamSystem",
    setupMode: "api_key",
    badge: "API disponibile",
    summary: "Invia il conto consolidato come ordine esterno; incasso, scontrino e chiusura restano in Cassa in Cloud.",
    requirements: [
      "Licenza Retail Enterprise o Risto Enterprise",
      "API key rilasciata da TeamSystem",
      "Mappatura iniziale di punto vendita, prodotti e tavoli",
    ],
    officialDocs: "https://api-doc.cassanova.com/",
    credentialFields: [
      {
        key: "apiKey",
        label: "API key Cassa in Cloud",
        type: "password",
        required: true,
        placeholder: "Incolla l'API key rilasciata da TeamSystem",
        help: "Ordynora la usa per ottenere token temporanei; l'API key resta cifrata.",
      },
    ],
    configFields: [
      {
        key: "salesPointId",
        label: "ID punto vendita (facoltativo)",
        type: "text",
        required: false,
        placeholder: "Es. 12345",
        help: "Puoi aggiungerlo dopo il primo test se gestisci più punti vendita.",
      },
      {
        key: "dueMinutes",
        label: "Preavviso minimo ordine",
        type: "select",
        required: true,
        options: [
          { value: "5", label: "5 minuti" },
          { value: "10", label: "10 minuti" },
          { value: "15", label: "15 minuti (consigliato)" },
          { value: "30", label: "30 minuti" },
        ],
        defaultValue: "15",
        help: "Deve essere compatibile con tempi, orari e capacità impostati in Cassa in Cloud.",
      },
    ],
    syncStrategy: {
      title: "Invio del conto consolidato",
      description: "Ordynora invia una sola comanda esterna quando il cliente chiede il conto o il servizio viene completato. I retry riconciliano l'externalId e non duplicano l'ordine.",
      activationNote: "La data di consegna deve rispettare orari e capacità configurati nel portale TeamSystem.",
    },
    capabilities: {
      connectionTest: CONNECTION_STATES.available,
      menuImport: CONNECTION_STATES.mappingRequired,
      tableSync: CONNECTION_STATES.mappingRequired,
      orderExport: CONNECTION_STATES.mappingRequired,
      fiscalDocuments: CONNECTION_STATES.partnerSetup,
      webhooks: CONNECTION_STATES.planned,
    },
  },
  passepartout_menu: {
    id: "passepartout_menu",
    name: "Passepartout Menu",
    vendor: "Passepartout",
    setupMode: "assisted",
    badge: "Attivazione assistita",
    summary: "Percorso guidato per i ristoranti che usano Passepartout Menu e il relativo installatore.",
    requirements: [
      "Versione e installazione Passepartout in uso",
      "Contatto del partner o installatore",
      "Verifica del canale tecnico abilitato sulla singola installazione",
    ],
    officialDocs: "https://www.passepartout.net/soluzioni/ristorazione/menu/",
    credentialFields: [],
    configFields: [
      {
        key: "installationName",
        label: "Nome o codice installazione",
        type: "text",
        required: true,
        placeholder: "Come indicato dal tuo installatore",
      },
      {
        key: "resellerContact",
        label: "Partner / installatore",
        type: "text",
        required: false,
        placeholder: "Nome, email o telefono",
      },
    ],
    capabilities: {
      connectionTest: CONNECTION_STATES.assisted,
      menuImport: CONNECTION_STATES.partnerSetup,
      tableSync: CONNECTION_STATES.partnerSetup,
      orderExport: CONNECTION_STATES.partnerSetup,
      fiscalDocuments: CONNECTION_STATES.partnerSetup,
      webhooks: CONNECTION_STATES.partnerSetup,
    },
  },
});

function cleanText(value, maxLength = 240) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
}

export const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

export function getProviderDefinition(provider) {
  return PROVIDERS[String(provider || "").trim()] || null;
}

export function getPublicProviderCatalog() {
  return PUBLIC_PROVIDER_IDS.map((provider) => {
    const definition = PROVIDERS[provider];
    return {
      id: definition.id,
      name: definition.name,
      vendor: definition.vendor,
      setupMode: definition.setupMode,
      badge: definition.badge,
      summary: definition.summary,
      requirements: [...definition.requirements],
      officialDocs: definition.officialDocs,
      credentialFields: definition.credentialFields.map((field) => ({ ...field })),
      configFields: definition.configFields.map((field) => ({
        ...field,
        options: field.options?.map((option) => ({ ...option })),
      })),
      capabilities: { ...definition.capabilities },
      syncStrategy: definition.syncStrategy ? { ...definition.syncStrategy } : null,
    };
  });
}

export function sanitizeProviderConfig(provider, rawConfig = {}) {
  const definition = getProviderDefinition(provider);
  if (!definition) throw new Error("Gestionale non supportato");
  const input = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig) ? rawConfig : {};
  const config = {};

  for (const field of definition.configFields) {
    const fallback = field.defaultValue ?? "";
    const value = cleanText(input[field.key] ?? fallback, 240);
    if (field.type === "select" && value) {
      const allowed = new Set((field.options || []).map((option) => option.value));
      if (!allowed.has(value)) throw new Error(`${field.label}: valore non valido`);
    }
    if (field.required && !value) throw new Error(`${field.label}: campo obbligatorio`);
    if (value) config[field.key] = value;
  }

  if (provider === "teamsystem_cassa_in_cloud" && config.salesPointId && !/^\d{1,18}$/.test(config.salesPointId)) {
    throw new Error("ID punto vendita: usa solo numeri");
  }

  return config;
}

export function sanitizeProviderCredentials(provider, rawCredentials = {}, existingCredentials = {}) {
  const definition = getProviderDefinition(provider);
  if (!definition) throw new Error("Gestionale non supportato");
  const input = rawCredentials && typeof rawCredentials === "object" && !Array.isArray(rawCredentials) ? rawCredentials : {};
  const existing = existingCredentials && typeof existingCredentials === "object" && !Array.isArray(existingCredentials)
    ? existingCredentials
    : {};
  const credentials = {};

  for (const field of definition.credentialFields) {
    const supplied = cleanText(input[field.key], 4000);
    const previous = cleanText(existing[field.key], 4000);
    const value = supplied || previous;
    if (field.required && !value) throw new Error(`${field.label}: campo obbligatorio`);
    if (value) credentials[field.key] = value;
  }

  return credentials;
}

export function publicIntegrationResponsibilities() {
  return {
    ordynora: [
      "Menu QR e presa ordine",
      "Flusso sala, cucina e bar",
      "Portate, tempi e stato tavolo",
      "Ruoli staff e continuità operativa",
    ],
    managementSystem: [
      "Scontrino fiscale e registratore telematico",
      "Fatture e documenti fiscali",
      "Incassi, contabilità e chiusure fiscali",
      "Adempimenti specifici del gestionale",
    ],
    synchronized: [
      "Prodotti e categorie, dopo la mappatura",
      "Tavoli e codici del punto vendita",
      "Ordini e relativo esito",
      "Stato connessione e anomalie tecniche",
    ],
  };
}
