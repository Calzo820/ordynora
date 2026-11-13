import prisma from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  IntegrationEncryptionError,
  isIntegrationEncryptionConfigured,
} from "../lib/integrationCrypto.js";
import {
  getProviderDefinition,
  getPublicProviderCatalog,
  publicIntegrationResponsibilities,
  sanitizeProviderConfig,
  sanitizeProviderCredentials,
} from "../integrations/catalog.js";
import { PosConnectionError, testProviderConnection } from "../integrations/connectors.js";
import { discoverProviderResources } from "../integrations/runtime.js";
import { summarizeIntegrationMappings } from "../integrations/readiness.js";
import {
  assertIntegrationEditable,
  assertIntegrationSnapshot,
  IntegrationStateError,
} from "../lib/integrationConcurrency.js";
import { enqueueOrderSync } from "../services/integrationQueue.service.js";
import {
  RESTAURANT_MODES,
  normalizeRestaurantMode,
  restaurantCapabilities,
} from "../lib/restaurantMode.js";

function serializeMode(restaurant) {
  const operationMode = normalizeRestaurantMode(restaurant?.operationMode);
  return {
    operationMode,
    capabilities: restaurantCapabilities(operationMode),
  };
}

async function countOpenInternalPayments(client, restaurantId) {
  return client.paymentTransaction.count({
    where: {
      restaurantId,
      status: { in: ["paid", "pending"] },
      order: { closedAt: null },
    },
  });
}

function modeConflictError(count) {
  const error = new Error(
    `Prima completa ${count} pagamento${count === 1 ? "" : "i"} già avviato in Ordynora.`
  );
  error.code = "OPEN_INTERNAL_PAYMENTS";
  return error;
}

function unresolvedIntegrationError({ jobs = 0, openEntities = 0 } = {}) {
  const error = new Error(
    `Prima risolvi ${jobs} invii pendenti o in errore e ${openEntities} tavoli/ordini ancora collegati al gestionale attuale.`
  );
  error.code = "INTEGRATION_HAS_UNRESOLVED_DATA";
  return error;
}

async function assertIntegrationCanBeRemoved(client, integration) {
  if (!integration?.id) return;
  const jobs = await client.posIntegrationJob.count({
    where: {
      integrationId: integration.id,
      OR: [
        { status: { in: ["processing", "retrying", "failed", "blocked"] } },
        { status: "pending", attempts: { gt: 0 } },
      ],
    },
  });
  if (jobs) throw unresolvedIntegrationError({ jobs });
  let cursor;
  while (true) {
    const mappings = await client.posIntegrationMapping.findMany({
      where: { integrationId: integration.id, entityType: { in: ["order", "table_session"] } },
      select: { id: true, entityType: true, localId: true },
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: 1000,
    });
    if (!mappings.length) return;
    const orderIds = mappings.filter((row) => row.entityType === "order").map((row) => row.localId);
    const sessionIds = mappings.filter((row) => row.entityType === "table_session").map((row) => row.localId);
    const [openOrders, openSessions] = await Promise.all([
      orderIds.length
        ? client.order.count({ where: { id: { in: orderIds }, closedAt: null, status: { not: "cancelled" } } })
        : 0,
      sessionIds.length
        ? client.tableSession.count({ where: { id: { in: sessionIds }, status: { in: ["open", "closing"] } } })
        : 0,
    ]);
    if (openOrders || openSessions) {
      throw unresolvedIntegrationError({ jobs, openEntities: openOrders + openSessions });
    }
    if (mappings.length < 1000) return;
    cursor = mappings.at(-1).id;
  }
}

function serializeIntegration(integration) {
  if (!integration) return null;
  const provider = getProviderDefinition(integration.provider);
  return {
    id: integration.id,
    provider: integration.provider,
    providerName: provider?.name || integration.provider,
    vendor: provider?.vendor || null,
    setupMode: provider?.setupMode || null,
    status: integration.status,
    config: integration.config && typeof integration.config === "object" ? integration.config : {},
    syncMode: integration.config?.syncMode === "active" ? "active" : "paused",
    hasCredentials: Boolean(integration.encryptedCredentials),
    lastTestedAt: integration.lastTestedAt,
    lastSyncAt: integration.lastSyncAt,
    lastError: integration.lastError,
    mappingCount: integration._count?.mappings || 0,
    queuedJobs: integration._count?.jobs || 0,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

function integrationInclude() {
  return {
    _count: { select: { mappings: true, jobs: true } },
  };
}

function normalizeMatchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function asConfig(integration) {
  return integration?.config && typeof integration.config === "object" && !Array.isArray(integration.config)
    ? integration.config
    : {};
}

async function persistSuggestedProviderConfig(integration, remote) {
  const current = asConfig(integration);
  const suggestedSalesPointId = String(remote?.suggestedConfig?.salesPointId || "").trim();
  if (
    integration?.provider !== "teamsystem_cassa_in_cloud"
    || current.salesPointId
    || !/^\d+$/.test(suggestedSalesPointId)
  ) {
    return current;
  }
  const config = { ...current, salesPointId: suggestedSalesPointId };
  await prisma.$transaction(async (tx) => {
    await assertIntegrationSnapshot(tx, integration);
    await tx.posIntegration.update({ where: { id: integration.id }, data: { config } });
  });
  integration.config = config;
  return config;
}

async function loadIntegrationCredentials(restaurantId) {
  const integration = await prisma.posIntegration.findUnique({
    where: { restaurantId },
    include: integrationInclude(),
  });
  if (!integration) {
    const error = new Error("Prima scegli e salva un gestionale");
    error.code = "INTEGRATION_NOT_FOUND";
    throw error;
  }
  if (!integration.encryptedCredentials) {
    const error = new Error("Le credenziali del gestionale non sono disponibili");
    error.code = "INTEGRATION_CREDENTIALS_MISSING";
    throw error;
  }
  return {
    integration,
    credentials: decryptIntegrationCredentials(integration.encryptedCredentials),
  };
}

async function loadLocalMappingResources(restaurantId, client = prisma) {
  const [menuItems, tables, restaurant] = await Promise.all([
    client.menuItem.findMany({
      where: { restaurantId, isDeleted: false },
      orderBy: [{ isAvailable: "desc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sku: true, price: true, category: true, isAvailable: true },
    }),
    client.table.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ zone: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, zone: true, seats: true },
    }),
    client.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settingsJson: true },
    }),
  ]);
  const settings = restaurant?.settingsJson && typeof restaurant.settingsJson === "object" && !Array.isArray(restaurant.settingsJson)
    ? restaurant.settingsJson
    : {};
  const coverRequired = Number(settings?.billing?.coverCharge || 0) > 0;
  return {
    menuItems: [
      ...menuItems.map((item) => ({ ...item, price: Number(item.price), virtual: false })),
      { id: "__cover__", name: "Coperto Ordynora", sku: "ORDYNORA-COVER", category: "Servizio", virtual: true, optional: !coverRequired },
      { id: "__extra__", name: "Extra manuale Ordynora", sku: "ORDYNORA-EXTRA", category: "Servizio", virtual: true, optional: true },
    ],
    tables,
    requirements: { coverRequired },
  };
}

function buildSuggestions(local, remote, mappings) {
  const mapped = new Set(mappings.map((row) => `${row.entityType}:${row.localId}`));
  const usedRemote = new Set(mappings.map((row) => `${row.entityType}:${row.externalId}`));
  const suggestions = [];

  function matchRows(entityType, locals, remotes) {
    const skuMap = new Map();
    const nameMap = new Map();
    for (const row of remotes.filter((item) => item.ready !== false)) {
      const sku = normalizeMatchValue(row.sku || row.code);
      const name = normalizeMatchValue(row.name);
      if (sku) skuMap.set(sku, [...(skuMap.get(sku) || []), row]);
      if (name) nameMap.set(name, [...(nameMap.get(name) || []), row]);
    }
    for (const row of locals) {
      if (mapped.has(`${entityType}:${row.id}`)) continue;
      const sku = normalizeMatchValue(row.sku || row.code);
      const name = normalizeMatchValue(row.name);
      const candidates = (sku && skuMap.get(sku)?.length === 1 ? skuMap.get(sku) : null)
        || (name && nameMap.get(name)?.length === 1 ? nameMap.get(name) : null);
      const candidate = candidates?.[0];
      if (!candidate || usedRemote.has(`${entityType}:${candidate.id}`)) continue;
      suggestions.push({
        entityType,
        localId: row.id,
        externalId: candidate.id,
        confidence: sku && normalizeMatchValue(candidate.sku || candidate.code) === sku ? "sku" : "exact_name",
      });
      usedRemote.add(`${entityType}:${candidate.id}`);
    }
  }

  matchRows("menu_item", local.menuItems, remote.menuItems || []);
  matchRows("table", local.tables, remote.tables || []);
  return suggestions;
}

function sendInputError(res, error) {
  return res.status(400).json({ message: error?.message || "Dati integrazione non validi" });
}

function sendStateError(res, error) {
  return res.status(409).json({ message: error.message, code: error.code, ...(error.summary ? { summary: error.summary } : {}) });
}

async function recordConnectionTestFailure(integration, data) {
  if (!integration?.id) return;
  await prisma.$transaction(async (tx) => {
    await assertIntegrationSnapshot(tx, integration);
    await tx.posIntegration.update({ where: { id: integration.id }, data });
  }).catch(() => {});
}

function sendEncryptionError(res, error) {
  const notConfigured = error?.code === "INTEGRATION_ENCRYPTION_NOT_CONFIGURED";
  return res.status(notConfigured ? 503 : 500).json({
    message: notConfigured
      ? "Il server non è ancora pronto a proteggere le chiavi API. Configura INTEGRATION_ENCRYPTION_KEY su Render e riprova."
      : "Le credenziali salvate non sono leggibili. Non reinserirle finché la chiave di cifratura non è stata verificata.",
    code: error?.code || "INTEGRATION_ENCRYPTION_ERROR",
  });
}

export async function listIntegrations(_req, res) {
  return res.json({
    positioning: "Ordynora gestisce il servizio; il gestionale collegato conserva il lavoro fiscale e amministrativo.",
    disclaimer: "La disponibilità dipende dal piano e dalle autorizzazioni API del gestionale scelto.",
    encryptionReady: isIntegrationEncryptionConfigured(),
    responsibilities: publicIntegrationResponsibilities(),
    integrations: getPublicProviderCatalog(),
  });
}

export async function getCurrentIntegration(req, res) {
  try {
    const [integration, restaurant] = await Promise.all([
      prisma.posIntegration.findUnique({
        where: { restaurantId: req.user.restaurantId },
        include: integrationInclude(),
      }),
      prisma.restaurant.findUnique({
        where: { id: req.user.restaurantId },
        select: { operationMode: true },
      }),
    ]);
    const jobGroups = integration
      ? await prisma.posIntegrationJob.groupBy({
          by: ["status"],
          where: { integrationId: integration.id },
          _count: { _all: true },
        })
      : [];
    return res.json({
      integration: serializeIntegration(integration),
      jobSummary: Object.fromEntries(jobGroups.map((row) => [row.status, row._count._all])),
      encryptionReady: isIntegrationEncryptionConfigured(),
      ...serializeMode(restaurant),
    });
  } catch (error) {
    console.error("getCurrentIntegration error:", error);
    return res.status(500).json({ message: "Errore durante il recupero del gestionale collegato" });
  }
}

export async function configureIntegration(req, res) {
  const restaurantId = req.user.restaurantId;
  const provider = String(req.body?.provider || "").trim();
  const definition = getProviderDefinition(provider);
  if (!definition) return res.status(400).json({ message: "Seleziona un gestionale supportato" });

  try {
    const existing = await prisma.posIntegration.findUnique({ where: { restaurantId } });
    const sameProvider = existing?.provider === provider;
    let existingCredentials = {};

    if (sameProvider && existing?.encryptedCredentials) {
      existingCredentials = decryptIntegrationCredentials(existing.encryptedCredentials);
    }

    const config = { ...sanitizeProviderConfig(provider, req.body?.config), syncMode: "paused" };
    const credentials = sanitizeProviderCredentials(provider, req.body?.credentials, existingCredentials);
    const suppliedCredentialKeys = definition.credentialFields
      .map((field) => field.key)
      .filter((key) => String(req.body?.credentials?.[key] || "").trim());
    const credentialsChanged = sameProvider && suppliedCredentialKeys.some(
      (key) => credentials[key] !== existingCredentials[key]
    );
    const salesPointChanged = sameProvider
      && provider === "teamsystem_cassa_in_cloud"
      && String(asConfig(existing).salesPointId || "") !== String(config.salesPointId || "");
    const mappingScopeChanged = Boolean(existing && sameProvider && (credentialsChanged || salesPointChanged));
    const encryptedCredentials = definition.credentialFields.length
      ? encryptIntegrationCredentials(credentials)
      : null;
    const initialStatus = definition.setupMode === "assisted" ? "pending_partner" : "draft";

    const saved = await prisma.$transaction(async (tx) => {
      if (existing) {
        await assertIntegrationEditable(tx, existing);
      }

      if (existing && !sameProvider) {
        await tx.posIntegration.update({
          where: { id: existing.id },
          data: { status: "disabled", config: { ...asConfig(existing), syncMode: "paused" } },
        });
        await assertIntegrationCanBeRemoved(tx, existing);
        await tx.posIntegrationJob.deleteMany({ where: { integrationId: existing.id } });
        await tx.posIntegrationMapping.deleteMany({ where: { integrationId: existing.id } });
      }

      if (mappingScopeChanged) {
        await assertIntegrationCanBeRemoved(tx, existing);
        await tx.posIntegrationJob.deleteMany({
          where: { integrationId: existing.id, status: { not: "succeeded" } },
        });
        await tx.posIntegrationMapping.deleteMany({
          where: { integrationId: existing.id },
        });
      }

      const integration = await tx.posIntegration.upsert({
        where: { restaurantId },
        create: {
          restaurantId,
          provider,
          status: initialStatus,
          encryptedCredentials,
          credentialKeyVersion: 1,
          config,
        },
        update: {
          provider,
          status: initialStatus,
          encryptedCredentials,
          credentialKeyVersion: 1,
          config,
          lastError: null,
          lastTestedAt: null,
          lastSyncAt: null,
        },
        include: integrationInclude(),
      });

      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { operationMode: true },
      });

      await writeAudit(tx, req, {
        action: sameProvider ? "pos_integration.updated" : "pos_integration.configured",
        entityType: "pos_integration",
        entityId: integration.id,
        metadata: {
          provider,
          setupMode: definition.setupMode,
          credentialsReplaced: suppliedCredentialKeys.length > 0,
          mappingsReset: mappingScopeChanged,
        },
      });
      return {
        integration,
        operationMode: restaurant?.operationMode || RESTAURANT_MODES.FULL,
        mappingsReset: mappingScopeChanged,
      };
    }, { isolationLevel: "Serializable" });

    return res.status(existing ? 200 : 201).json({
      message: saved.mappingsReset
        ? "Nuovo account o punto vendita salvato: i vecchi abbinamenti sono stati rimossi per evitare invii al locale sbagliato. Ora prova la connessione e abbina di nuovo menu e tavoli."
        : definition.setupMode === "assisted"
        ? "Gestionale salvato. Completa l'attivazione con il partner."
        : "Configurazione salvata in modo sicuro. La sincronizzazione resta in pausa: ora esegui il test di connessione.",
      integration: serializeIntegration(saved.integration),
      ...serializeMode({ operationMode: saved.operationMode }),
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (["INTEGRATION_SYNC_IN_PROGRESS", "INTEGRATION_HAS_UNRESOLVED_DATA"].includes(error?.code)) {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    if (error instanceof IntegrationEncryptionError) return sendEncryptionError(res, error);
    if (/obbligatorio|non valido|solo numeri|non supportato/i.test(error?.message || "")) {
      return sendInputError(res, error);
    }
    console.error("configureIntegration error:", error);
    return res.status(500).json({ message: "Errore durante il salvataggio del gestionale" });
  }
}

export async function testCurrentIntegration(req, res) {
  const restaurantId = req.user.restaurantId;
  let integration;

  try {
    integration = await prisma.posIntegration.findUnique({ where: { restaurantId } });
    if (!integration) return res.status(404).json({ message: "Prima scegli e salva un gestionale" });
    if (integration.status === "disabled") {
      return res.status(409).json({ message: "Il collegamento è disattivato. Salva nuovamente la configurazione prima del test." });
    }

    const credentials = integration.encryptedCredentials
      ? decryptIntegrationCredentials(integration.encryptedCredentials)
      : {};
    const result = await testProviderConnection(integration.provider, {
      credentials,
      config: integration.config || {},
    });
    await persistSuggestedProviderConfig(integration, result.remote);
    const testedAt = new Date();
    const status = result.outcome === "connected" ? "connected" : "pending_partner";

    const saved = await prisma.$transaction(async (tx) => {
      await assertIntegrationSnapshot(tx, integration);
      const updated = await tx.posIntegration.update({
        where: { id: integration.id },
        data: { status, lastTestedAt: testedAt, lastError: null },
        include: integrationInclude(),
      });
      await writeAudit(tx, req, {
        action: "pos_integration.connection_tested",
        entityType: "pos_integration",
        entityId: integration.id,
        metadata: { provider: integration.provider, outcome: result.outcome },
      });
      return updated;
    });

    return res.json({
      message: result.message,
      outcome: result.outcome,
      remote: result.remote,
      integration: serializeIntegration(saved),
      nextStep: status === "connected" ? "mapping" : "partner_activation",
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (error instanceof IntegrationEncryptionError) {
      await recordConnectionTestFailure(integration, { status: "degraded", lastError: "Chiave di cifratura da verificare" });
      return sendEncryptionError(res, error);
    }

    if (error instanceof PosConnectionError) {
      await recordConnectionTestFailure(integration, {
        status: "degraded", lastTestedAt: new Date(), lastError: String(error.message).slice(0, 500),
      });
      return res.status(error.providerStatus === 401 || error.providerStatus === 403 ? 422 : 502).json({
        message: error.message,
        code: error.code,
        providerStatus: error.providerStatus,
      });
    }

    console.error("testCurrentIntegration error:", error);
    await recordConnectionTestFailure(integration, { status: "degraded", lastTestedAt: new Date(), lastError: "Test non completato" });
    return res.status(500).json({ message: "Test del gestionale non completato" });
  }
}

export async function getIntegrationWorkspace(req, res) {
  try {
    const { integration, credentials } = await loadIntegrationCredentials(req.user.restaurantId);
    if (!['connected', 'degraded'].includes(integration.status)) {
      return res.status(409).json({
        code: "CONNECTION_TEST_REQUIRED",
        message: "Prima completa con successo il test di connessione.",
      });
    }
    const [local, remote, mappings] = await Promise.all([
      loadLocalMappingResources(req.user.restaurantId),
      discoverProviderResources(integration.provider, {
        credentials,
        config: asConfig(integration),
      }),
      prisma.posIntegrationMapping.findMany({
        where: { integrationId: integration.id, entityType: { in: ["menu_item", "table"] } },
        orderBy: [{ entityType: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    await persistSuggestedProviderConfig(integration, remote);
    const suggestions = buildSuggestions(local, remote, mappings);
    return res.json({
      provider: integration.provider,
      local,
      remote,
      mappings,
      suggestions,
      summary: summarizeIntegrationMappings({ provider: integration.provider, local, mappings }),
      syncMode: asConfig(integration).syncMode === "active" ? "active" : "paused",
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (error instanceof IntegrationEncryptionError) return sendEncryptionError(res, error);
    if (error instanceof PosConnectionError) {
      return res.status(502).json({ code: error.code, message: error.message });
    }
    if (["INTEGRATION_NOT_FOUND", "INTEGRATION_CREDENTIALS_MISSING"].includes(error?.code)) {
      return res.status(404).json({ code: error.code, message: error.message });
    }
    console.error("getIntegrationWorkspace error:", error);
    return res.status(500).json({ message: "Non riesco a caricare menu e tavoli del gestionale" });
  }
}

function remoteResourceMap(remote) {
  return {
    menu_item: new Map((remote.menuItems || []).map((row) => [String(row.id), row])),
    table: new Map((remote.tables || []).map((row) => [String(row.id), row])),
  };
}

async function persistMappingPairs({ integration, remote, local, pairs, req }) {
  const remoteByType = remoteResourceMap(remote);
  const localIds = {
    menu_item: new Set(local.menuItems.map((row) => String(row.id))),
    table: new Set(local.tables.map((row) => String(row.id))),
  };
  const cleaned = pairs.slice(0, 600).map((pair) => ({
    entityType: String(pair?.entityType || "").trim(),
    localId: String(pair?.localId || "").trim(),
    externalId: String(pair?.externalId || "").trim(),
  }));
  for (const pair of cleaned) {
    if (!localIds[pair.entityType]?.has(pair.localId)) {
      const error = new Error("Elemento locale non valido nella mappatura");
      error.code = "INVALID_LOCAL_MAPPING";
      throw error;
    }
    const remoteRow = pair.externalId ? remoteByType[pair.entityType]?.get(pair.externalId) : null;
    if (pair.externalId && !remoteRow) {
      const error = new Error("Elemento del gestionale non valido o non più disponibile");
      error.code = "INVALID_REMOTE_MAPPING";
      throw error;
    }
    if (remoteRow?.ready === false) {
      const error = new Error(`“${remoteRow.name || pair.externalId}” non contiene ancora tutti i dati tecnici richiesti dal gestionale`);
      error.code = "INVALID_REMOTE_MAPPING";
      throw error;
    }
  }

  await prisma.$transaction(async (tx) => {
    await assertIntegrationEditable(tx, integration, { requirePaused: true });
    for (const pair of cleaned) {
      const key = {
        integrationId_entityType_localId: {
          integrationId: integration.id,
          entityType: pair.entityType,
          localId: pair.localId,
        },
      };
      if (!pair.externalId) {
        await tx.posIntegrationMapping.deleteMany({
          where: { integrationId: integration.id, entityType: pair.entityType, localId: pair.localId },
        });
        continue;
      }
      const remoteRow = remoteByType[pair.entityType].get(pair.externalId);
      await tx.posIntegrationMapping.upsert({
        where: key,
        create: {
          integrationId: integration.id,
          entityType: pair.entityType,
          localId: pair.localId,
          externalId: pair.externalId,
          metadata: remoteRow.metadata || {},
        },
        update: { externalId: pair.externalId, metadata: remoteRow.metadata || {} },
      });
    }
    await writeAudit(tx, req, {
      action: "pos_integration.mappings_saved",
      entityType: "pos_integration",
      entityId: integration.id,
      metadata: { provider: integration.provider, mappingCount: cleaned.filter((row) => row.externalId).length },
    });
  });
}

async function workspaceForWrite(restaurantId) {
  const { integration, credentials } = await loadIntegrationCredentials(restaurantId);
  const [local, remote, mappings] = await Promise.all([
    loadLocalMappingResources(restaurantId),
    discoverProviderResources(integration.provider, { credentials, config: asConfig(integration) }),
    prisma.posIntegrationMapping.findMany({
      where: { integrationId: integration.id, entityType: { in: ["menu_item", "table"] } },
    }),
  ]);
  await persistSuggestedProviderConfig(integration, remote);
  return { integration, local, remote, mappings };
}

export async function saveIntegrationMappings(req, res) {
  if (!Array.isArray(req.body?.mappings)) {
    return res.status(400).json({ message: "Invia l'elenco delle mappature" });
  }
  try {
    const workspace = await workspaceForWrite(req.user.restaurantId);
    await persistMappingPairs({ ...workspace, pairs: req.body.mappings, req });
    const mappings = await prisma.posIntegrationMapping.findMany({
      where: { integrationId: workspace.integration.id, entityType: { in: ["menu_item", "table"] } },
    });
    return res.json({
      message: "Mappature salvate. Nessun dato fiscale è stato modificato.",
      mappings,
      summary: summarizeIntegrationMappings({ provider: workspace.integration.provider, local: workspace.local, mappings }),
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (error instanceof IntegrationEncryptionError) return sendEncryptionError(res, error);
    if (error instanceof PosConnectionError) return res.status(502).json({ code: error.code, message: error.message });
    if (["INVALID_LOCAL_MAPPING", "INVALID_REMOTE_MAPPING"].includes(error?.code)) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    if (error?.code === "P2002") {
      return res.status(409).json({ message: "Lo stesso elemento del gestionale non può essere abbinato due volte." });
    }
    console.error("saveIntegrationMappings error:", error);
    return res.status(500).json({ message: "Non riesco a salvare le mappature" });
  }
}

export async function autoMapIntegration(req, res) {
  try {
    const workspace = await workspaceForWrite(req.user.restaurantId);
    const suggestions = buildSuggestions(workspace.local, workspace.remote, workspace.mappings);
    if (suggestions.length) {
      await persistMappingPairs({ ...workspace, pairs: suggestions, req });
    }
    const mappings = await prisma.posIntegrationMapping.findMany({
      where: { integrationId: workspace.integration.id, entityType: { in: ["menu_item", "table"] } },
    });
    return res.json({
      message: suggestions.length
        ? `${suggestions.length} abbinamenti sicuri trovati per codice o nome esatto.`
        : "Nessun nuovo abbinamento certo: completa manualmente quelli rimasti.",
      matched: suggestions.length,
      mappings,
      summary: summarizeIntegrationMappings({ provider: workspace.integration.provider, local: workspace.local, mappings }),
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (error instanceof IntegrationEncryptionError) return sendEncryptionError(res, error);
    if (error instanceof PosConnectionError) return res.status(502).json({ code: error.code, message: error.message });
    console.error("autoMapIntegration error:", error);
    return res.status(500).json({ message: "Abbinamento automatico non completato" });
  }
}

function preparationAreaForRemote(item) {
  const text = normalizeMatchValue([
    item.name,
    item.metadata?.categoryName,
    item.metadata?.departmentName,
    item.metadata?.department?.name,
  ].filter(Boolean).join(" "));
  return /bar|bev|drink|vino|wine|birr|cocktail|caffe|coffee|acqua|bibit|liquor|amaro/.test(text)
    ? "bar"
    : "kitchen";
}

function baseTableCode(row) {
  const value = String(row.code || row.name || row.id || "TAVOLO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  return value || "TAVOLO";
}

export async function importProviderCatalog(req, res) {
  try {
    const workspace = await workspaceForWrite(req.user.restaurantId);
    const suggestions = buildSuggestions(workspace.local, workspace.remote, workspace.mappings);
    if (suggestions.length) {
      await persistMappingPairs({ ...workspace, pairs: suggestions, req });
    }
    const existingMappings = await prisma.posIntegrationMapping.findMany({
      where: { integrationId: workspace.integration.id, entityType: { in: ["menu_item", "table"] } },
    });
    const usedRemote = new Set(existingMappings.map((row) => `${row.entityType}:${row.externalId}`));
    const tableCodes = new Set(workspace.local.tables.map((row) => row.code));
    const importableMenu = (workspace.remote.menuItems || []).filter(
      (row) => row.ready !== false && !usedRemote.has(`menu_item:${row.id}`)
    );
    const importableTables = (workspace.remote.tables || []).filter(
      (row) => !usedRemote.has(`table:${row.id}`)
    );
    let importedMenu = 0;
    let importedTables = 0;

    await prisma.$transaction(async (tx) => {
      await assertIntegrationEditable(tx, workspace.integration, { requirePaused: true });
      for (const [index, remote] of importableMenu.entries()) {
        const metadata = remote.metadata || {};
        const created = await tx.menuItem.create({
          data: {
            restaurantId: req.user.restaurantId,
            name: String(remote.name || `Prodotto ${remote.id}`).slice(0, 120),
            description: `Importato da ${workspace.integration.provider === "tilby" ? "Tilby" : "Cassa in Cloud"}`,
            price: Math.max(0, Number(remote.price || 0)),
            category: String(
              metadata.categoryName
              || metadata.departmentName
              || metadata.department?.name
              || "Menu"
            ).slice(0, 80),
            sku: String(remote.sku || "").slice(0, 80) || null,
            vatRate: Math.max(0, Math.min(30, Number(metadata.vatPerc ?? metadata.taxValue ?? 10))),
            sortOrder: workspace.local.menuItems.length + index,
            preparationArea: preparationAreaForRemote(remote),
            isAvailable: true,
          },
        });
        await tx.posIntegrationMapping.create({
          data: {
            integrationId: workspace.integration.id,
            entityType: "menu_item",
            localId: created.id,
            externalId: String(remote.id),
            metadata,
          },
        });
        importedMenu += 1;
      }

      for (const [index, remote] of importableTables.entries()) {
        const base = baseTableCode(remote);
        let code = base;
        let suffix = 2;
        while (tableCodes.has(code)) {
          code = `${base.slice(0, 24)}-${suffix}`;
          suffix += 1;
        }
        tableCodes.add(code);
        const created = await tx.table.create({
          data: {
            restaurantId: req.user.restaurantId,
            name: String(remote.name || `Tavolo ${remote.id}`).slice(0, 80),
            code,
            seats: Math.max(1, Math.min(50, Math.trunc(Number(remote.seats || 4)))),
            zone: String(remote.metadata?.roomName || "").slice(0, 80) || null,
            sortOrder: workspace.local.tables.length + index,
            isActive: true,
          },
        });
        await tx.posIntegrationMapping.create({
          data: {
            integrationId: workspace.integration.id,
            entityType: "table",
            localId: created.id,
            externalId: String(remote.id),
            metadata: remote.metadata || {},
          },
        });
        importedTables += 1;
      }
      await writeAudit(tx, req, {
        action: "pos_integration.catalog_imported",
        entityType: "pos_integration",
        entityId: workspace.integration.id,
        metadata: { provider: workspace.integration.provider, importedMenu, importedTables },
      });
    }, { timeout: 60000 });

    const [local, mappings] = await Promise.all([
      loadLocalMappingResources(req.user.restaurantId),
      prisma.posIntegrationMapping.findMany({
        where: { integrationId: workspace.integration.id, entityType: { in: ["menu_item", "table"] } },
      }),
    ]);
    return res.json({
      message: importedMenu || importedTables
        ? `Importati ${importedMenu} prodotti e ${importedTables} tavoli. Gli elementi già presenti sono stati solo abbinati.`
        : "Non c'erano nuovi prodotti o tavoli da importare.",
      imported: { menuItems: importedMenu, tables: importedTables },
      local,
      mappings,
      summary: summarizeIntegrationMappings({ provider: workspace.integration.provider, local, mappings }),
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (error instanceof IntegrationEncryptionError) return sendEncryptionError(res, error);
    if (error instanceof PosConnectionError) return res.status(502).json({ code: error.code, message: error.message });
    if (error?.code === "P2002") {
      return res.status(409).json({ message: "Un prodotto o tavolo è già stato importato. Ricarica gli abbinamenti." });
    }
    console.error("importProviderCatalog error:", error);
    return res.status(500).json({ message: "Importazione dal gestionale non completata" });
  }
}

export async function setIntegrationSyncMode(req, res) {
  const requested = String(req.body?.syncMode || "").trim();
  if (!["active", "paused"].includes(requested)) {
    return res.status(400).json({ message: "Scegli attiva o in pausa" });
  }
  try {
    const integration = await prisma.posIntegration.findUnique({
      where: { restaurantId: req.user.restaurantId },
      include: integrationInclude(),
    });
    if (!integration) return res.status(404).json({ message: "Nessun gestionale configurato" });
    if (requested === "active" && integration.status !== "connected") {
      return res.status(409).json({ code: "CONNECTION_TEST_REQUIRED", message: "Ripeti con successo il test di connessione prima di attivare." });
    }
    if (
      requested === "active"
      && integration.provider === "teamsystem_cassa_in_cloud"
      && !asConfig(integration).salesPointId
    ) {
      return res.status(409).json({
        code: "SALES_POINT_REQUIRED",
        message: "Seleziona il punto vendita Cassa in Cloud, salva e ripeti il test prima di attivare.",
      });
    }
    const [local, mappings] = await Promise.all([
      loadLocalMappingResources(req.user.restaurantId),
      prisma.posIntegrationMapping.findMany({
        where: { integrationId: integration.id, entityType: { in: ["menu_item", "table"] } },
      }),
    ]);
    const summary = summarizeIntegrationMappings({ provider: integration.provider, local, mappings });
    if (requested === "active" && !summary.ready) {
      return res.status(409).json({
        code: "MAPPING_INCOMPLETE",
        message: `Completa ancora ${summary.missing.length} abbinamenti prima di attivare.`,
        summary,
      });
    }
    const config = { ...asConfig(integration), syncMode: requested };
    const updated = await prisma.$transaction(async (tx) => {
      const currentIntegration = await assertIntegrationEditable(tx, integration);
      let activationSummary = summary;
      if (requested === "active") {
        if (currentIntegration.status !== "connected") {
          throw new IntegrationStateError("Ripeti con successo il test di connessione.", "CONNECTION_TEST_REQUIRED");
        }
        const [currentLocal, currentMappings] = await Promise.all([
          loadLocalMappingResources(req.user.restaurantId, tx),
          tx.posIntegrationMapping.findMany({
            where: { integrationId: integration.id, entityType: { in: ["menu_item", "table"] } },
          }),
        ]);
        activationSummary = summarizeIntegrationMappings({ provider: integration.provider, local: currentLocal, mappings: currentMappings });
        if (!activationSummary.ready) {
          const error = new IntegrationStateError("Gli abbinamenti sono cambiati. Completa quelli mancanti prima di attivare.", "MAPPING_INCOMPLETE");
          error.summary = activationSummary;
          throw error;
        }
        const openPayments = await countOpenInternalPayments(tx, req.user.restaurantId);
        if (openPayments > 0) throw modeConflictError(openPayments);
      }
      const saved = await tx.posIntegration.update({
        where: { id: integration.id },
        data: { config, lastError: requested === "active" ? null : integration.lastError },
        include: integrationInclude(),
      });
      const restaurant = requested === "active"
        ? await tx.restaurant.update({
            where: { id: req.user.restaurantId },
            data: { operationMode: RESTAURANT_MODES.INTEGRATED },
            select: { operationMode: true },
          })
        : await tx.restaurant.findUnique({
            where: { id: req.user.restaurantId },
            select: { operationMode: true },
          });
      await writeAudit(tx, req, {
        action: requested === "active" ? "pos_integration.sync_activated" : "pos_integration.sync_paused",
        entityType: "pos_integration",
        entityId: integration.id,
        metadata: { provider: integration.provider },
      });
      return { integration: saved, restaurant, summary: activationSummary };
    });
    return res.json({
      message: requested === "active"
        ? "Sincronizzazione attiva. I nuovi eventi verranno inviati automaticamente e con retry sicuro."
        : "Sincronizzazione in pausa. Le credenziali e le mappature restano salvate.",
      integration: serializeIntegration(updated.integration),
      summary: updated.summary,
      ...serializeMode(updated.restaurant),
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (error?.code === "OPEN_INTERNAL_PAYMENTS") {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    console.error("setIntegrationSyncMode error:", error);
    return res.status(500).json({ message: "Non riesco a cambiare lo stato della sincronizzazione" });
  }
}

export async function syncEligibleOrders(req, res) {
  try {
    const integration = await prisma.posIntegration.findUnique({ where: { restaurantId: req.user.restaurantId } });
    if (!integration || asConfig(integration).syncMode !== "active") {
      return res.status(409).json({ message: "Attiva prima la sincronizzazione" });
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const where = integration.provider === "tilby"
      ? { restaurantId: req.user.restaurantId, createdAt: { gte: since }, status: { not: "cancelled" }, closedAt: null }
      : {
          restaurantId: req.user.restaurantId,
          createdAt: { gte: since },
          status: { not: "cancelled" },
          OR: [{ billRequestedAt: { not: null } }, { closedAt: { not: null } }],
        };
    const orders = await prisma.order.findMany({
      where,
      select: { id: true, tableSessionId: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    let queued = 0;
    const seenEntities = new Set();
    for (const order of orders) {
      const entityKey = order.tableSessionId ? `table_session:${order.tableSessionId}` : `order:${order.id}`;
      if (seenEntities.has(entityKey)) continue;
      seenEntities.add(entityKey);
      const job = await prisma.$transaction((tx) => enqueueOrderSync(tx, {
        restaurantId: req.user.restaurantId,
        orderId: order.id,
        trigger: "manual",
        force: true,
      }));
      if (job) queued += 1;
    }
    return res.json({
      message: queued ? `${queued} ordini messi in coda in modo sicuro.` : "Non ci sono ordini idonei da sincronizzare.",
      queued,
    });
  } catch (error) {
    console.error("syncEligibleOrders error:", error);
    return res.status(500).json({ message: "Non riesco ad avviare la sincronizzazione" });
  }
}

export async function listIntegrationJobs(req, res) {
  try {
    const integration = await prisma.posIntegration.findUnique({ where: { restaurantId: req.user.restaurantId } });
    if (!integration) return res.json({ jobs: [], summary: {} });
    const [jobs, groups] = await Promise.all([
      prisma.posIntegrationJob.findMany({
        where: { integrationId: integration.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          operation: true,
          status: true,
          entityType: true,
          entityId: true,
          externalId: true,
          attempts: true,
          nextAttemptAt: true,
          processedAt: true,
          lastError: true,
          responseMeta: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.posIntegrationJob.groupBy({
        by: ["status"],
        where: { integrationId: integration.id },
        _count: { _all: true },
      }),
    ]);
    return res.json({
      jobs,
      summary: Object.fromEntries(groups.map((row) => [row.status, row._count._all])),
    });
  } catch (error) {
    console.error("listIntegrationJobs error:", error);
    return res.status(500).json({ message: "Stato sincronizzazioni non disponibile" });
  }
}

export async function retryIntegrationJob(req, res) {
  try {
    const integration = await prisma.posIntegration.findUnique({ where: { restaurantId: req.user.restaurantId } });
    if (!integration) return res.status(404).json({ message: "Nessun gestionale configurato" });
    const changed = await prisma.posIntegrationJob.updateMany({
      where: {
        id: req.params.jobId,
        integrationId: integration.id,
        status: { in: ["failed", "blocked"] },
      },
      data: { status: "retrying", attempts: 0, nextAttemptAt: new Date(), lastError: null, processedAt: null },
    });
    if (!changed.count) return res.status(404).json({ message: "Job non trovato o già in lavorazione" });
    const job = await prisma.posIntegrationJob.findUnique({ where: { id: req.params.jobId } });
    if (job?.entityType === "table_session" && job.entityId) {
      await prisma.tableSession.updateMany({
        where: { id: job.entityId, integrationSyncStatus: { not: "processing" } },
        data: { integrationSyncStatus: "queued", integrationLastError: null },
      });
      await prisma.order.updateMany({
        where: { tableSessionId: job.entityId, integrationSyncStatus: { not: "processing" } },
        data: { integrationSyncStatus: "queued", integrationLastError: null },
      });
    } else if (job?.entityId) {
      await prisma.order.updateMany({
        where: { id: job.entityId, integrationSyncStatus: { not: "processing" } },
        data: { integrationSyncStatus: "queued", integrationLastError: null },
      });
    }
    return res.json({ message: "Riprova messa in coda." });
  } catch (error) {
    console.error("retryIntegrationJob error:", error);
    return res.status(500).json({ message: "Non riesco a riprovare la sincronizzazione" });
  }
}

export async function disconnectCurrentIntegration(req, res) {
  const restaurantId = req.user.restaurantId;
  try {
    const existing = await prisma.posIntegration.findUnique({ where: { restaurantId } });
    if (!existing) return res.status(404).json({ message: "Nessun gestionale collegato" });

    const updated = await prisma.$transaction(async (tx) => {
      await assertIntegrationEditable(tx, existing);
      await tx.posIntegration.update({
        where: { id: existing.id },
        data: { status: "disabled", config: { ...asConfig(existing), syncMode: "paused" } },
      });
      await assertIntegrationCanBeRemoved(tx, existing);
      await tx.posIntegrationJob.deleteMany({ where: { integrationId: existing.id } });
      await tx.posIntegrationMapping.deleteMany({ where: { integrationId: existing.id } });
      const integration = await tx.posIntegration.update({
        where: { id: existing.id },
        data: {
          status: "disabled",
          encryptedCredentials: null,
          config: { ...asConfig(existing), syncMode: "paused" },
          lastError: null,
          lastTestedAt: null,
          lastSyncAt: null,
        },
        include: integrationInclude(),
      });
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { operationMode: RESTAURANT_MODES.FULL },
      });
      await tx.order.updateMany({
        where: {
          restaurantId,
          integrationSyncStatus: { in: ["queued", "processing", "retrying", "blocked", "failed"] },
        },
        data: { integrationSyncStatus: "not_required", integrationLastError: null },
      });
      await tx.tableSession.updateMany({
        where: { restaurantId },
        data: { integrationSyncStatus: "not_required", integrationLastError: null },
      });
      await writeAudit(tx, req, {
        action: "pos_integration.disconnected",
        entityType: "pos_integration",
        entityId: existing.id,
        metadata: { provider: existing.provider, credentialsDeleted: true },
      });
      return integration;
    }, { isolationLevel: "Serializable" });

    return res.json({
      message: "Gestionale disconnesso. Le credenziali cifrate e le mappature sono state eliminate.",
      integration: serializeIntegration(updated),
      ...serializeMode({ operationMode: RESTAURANT_MODES.FULL }),
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (["INTEGRATION_SYNC_IN_PROGRESS", "INTEGRATION_HAS_UNRESOLVED_DATA"].includes(error?.code)) {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    console.error("disconnectCurrentIntegration error:", error);
    return res.status(500).json({ message: "Errore durante la disconnessione del gestionale" });
  }
}

export async function updateOperationMode(req, res) {
  const restaurantId = req.user.restaurantId;
  const requested = String(req.body?.operationMode || "").trim();
  if (![RESTAURANT_MODES.FULL, RESTAURANT_MODES.INTEGRATED].includes(requested)) {
    return res.status(400).json({ message: "Scegli modalità completa o con gestionale" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, operationMode: true },
      });
      if (!current) return null;

      if (requested === RESTAURANT_MODES.INTEGRATED) {
        const integration = await tx.posIntegration.findUnique({
          where: { restaurantId },
          select: { id: true, status: true, provider: true, config: true },
        });
        if (
          !integration
          || integration.status !== "connected"
          || asConfig(integration).syncMode !== "active"
        ) {
          const error = new Error("Prima completa test, abbinamenti e attivazione nella pagina Gestionale.");
          error.code = "INTEGRATION_REQUIRED";
          throw error;
        }
        const openPayments = await countOpenInternalPayments(tx, restaurantId);
        if (openPayments > 0) throw modeConflictError(openPayments);
      } else {
        const integration = await tx.posIntegration.findUnique({ where: { restaurantId } });
        if (integration && integration.status !== "disabled") {
          await assertIntegrationEditable(tx, integration);
          await assertIntegrationCanBeRemoved(tx, integration);
          await tx.posIntegration.update({
            where: { id: integration.id },
            data: { config: { ...asConfig(integration), syncMode: "paused" } },
          });
        }
      }

      const restaurant = await tx.restaurant.update({
        where: { id: restaurantId },
        data: { operationMode: requested },
        select: { id: true, operationMode: true },
      });
      await writeAudit(tx, req, {
        action: "restaurant.operation_mode_changed",
        entityType: "restaurant",
        entityId: restaurantId,
        metadata: { from: current.operationMode, to: requested },
      });
      return restaurant;
    }, { isolationLevel: "Serializable" });

    if (!result) return res.status(404).json({ message: "Ristorante non trovato" });
    return res.json({
      message: requested === RESTAURANT_MODES.INTEGRATED
        ? "Modalità con gestionale attivata: la cassa fiscale resta nel sistema collegato."
        : "Modalità Ordynora completa attivata. La sincronizzazione esterna è stata messa in pausa per evitare doppie registrazioni.",
      ...serializeMode(result),
    });
  } catch (error) {
    if (error instanceof IntegrationStateError) return sendStateError(res, error);
    if (["OPEN_INTERNAL_PAYMENTS", "INTEGRATION_REQUIRED", "INTEGRATION_HAS_UNRESOLVED_DATA"].includes(error?.code)) {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    console.error("updateOperationMode error:", error);
    return res.status(500).json({ message: "Non riesco a cambiare modalità operativa" });
  }
}
