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

function sendInputError(res, error) {
  return res.status(400).json({ message: error?.message || "Dati integrazione non validi" });
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
    return res.json({
      integration: serializeIntegration(integration),
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

    const config = sanitizeProviderConfig(provider, req.body?.config);
    const credentials = sanitizeProviderCredentials(provider, req.body?.credentials, existingCredentials);
    const encryptedCredentials = definition.credentialFields.length
      ? encryptIntegrationCredentials(credentials)
      : null;
    const initialStatus = definition.setupMode === "assisted" ? "pending_partner" : "draft";

    const saved = await prisma.$transaction(async (tx) => {
      const openPayments = await countOpenInternalPayments(tx, restaurantId);
      if (openPayments > 0) throw modeConflictError(openPayments);

      if (existing && !sameProvider) {
        await tx.posIntegrationJob.deleteMany({ where: { integrationId: existing.id } });
        await tx.posIntegrationMapping.deleteMany({ where: { integrationId: existing.id } });
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

      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { operationMode: RESTAURANT_MODES.INTEGRATED },
      });

      await writeAudit(tx, req, {
        action: sameProvider ? "pos_integration.updated" : "pos_integration.configured",
        entityType: "pos_integration",
        entityId: integration.id,
        metadata: { provider, setupMode: definition.setupMode, credentialsReplaced: definition.credentialFields.length > 0 },
      });
      return integration;
    }, { isolationLevel: "Serializable" });

    return res.status(existing ? 200 : 201).json({
      message: definition.setupMode === "assisted"
        ? "Gestionale salvato. Completa l'attivazione con il partner Passepartout."
        : "Configurazione salvata in modo sicuro. Ora esegui il test di connessione.",
      integration: serializeIntegration(saved),
      ...serializeMode({ operationMode: RESTAURANT_MODES.INTEGRATED }),
    });
  } catch (error) {
    if (error?.code === "OPEN_INTERNAL_PAYMENTS") {
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

    await prisma.posIntegration.update({ where: { id: integration.id }, data: { status: "testing", lastError: null } });

    const credentials = integration.encryptedCredentials
      ? decryptIntegrationCredentials(integration.encryptedCredentials)
      : {};
    const result = await testProviderConnection(integration.provider, {
      credentials,
      config: integration.config || {},
    });
    const testedAt = new Date();
    const status = result.outcome === "connected" ? "connected" : "pending_partner";

    const saved = await prisma.$transaction(async (tx) => {
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
    if (error instanceof IntegrationEncryptionError) {
      if (integration?.id) {
        await prisma.posIntegration.update({
          where: { id: integration.id },
          data: { status: "degraded", lastError: "Chiave di cifratura da verificare" },
        }).catch(() => {});
      }
      return sendEncryptionError(res, error);
    }

    if (error instanceof PosConnectionError) {
      if (integration?.id) {
        await prisma.posIntegration.update({
          where: { id: integration.id },
          data: {
            status: "degraded",
            lastTestedAt: new Date(),
            lastError: String(error.message).slice(0, 500),
          },
        }).catch(() => {});
      }
      return res.status(error.providerStatus === 401 || error.providerStatus === 403 ? 422 : 502).json({
        message: error.message,
        code: error.code,
        providerStatus: error.providerStatus,
      });
    }

    console.error("testCurrentIntegration error:", error);
    if (integration?.id) {
      await prisma.posIntegration.update({
        where: { id: integration.id },
        data: { status: "degraded", lastTestedAt: new Date(), lastError: "Test non completato" },
      }).catch(() => {});
    }
    return res.status(500).json({ message: "Test del gestionale non completato" });
  }
}

export async function disconnectCurrentIntegration(req, res) {
  const restaurantId = req.user.restaurantId;
  try {
    const existing = await prisma.posIntegration.findUnique({ where: { restaurantId } });
    if (!existing) return res.status(404).json({ message: "Nessun gestionale collegato" });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.posIntegrationJob.deleteMany({ where: { integrationId: existing.id } });
      await tx.posIntegrationMapping.deleteMany({ where: { integrationId: existing.id } });
      const integration = await tx.posIntegration.update({
        where: { id: existing.id },
        data: {
          status: "disabled",
          encryptedCredentials: null,
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
          select: { id: true, status: true, provider: true },
        });
        if (!integration || integration.status === "disabled") {
          const error = new Error("Prima scegli e salva il gestionale che userai.");
          error.code = "INTEGRATION_REQUIRED";
          throw error;
        }
        const openPayments = await countOpenInternalPayments(tx, restaurantId);
        if (openPayments > 0) throw modeConflictError(openPayments);
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
        : "Modalità Ordynora completa attivata.",
      ...serializeMode(result),
    });
  } catch (error) {
    if (["OPEN_INTERNAL_PAYMENTS", "INTEGRATION_REQUIRED"].includes(error?.code)) {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    console.error("updateOperationMode error:", error);
    return res.status(500).json({ message: "Non riesco a cambiare modalità operativa" });
  }
}
