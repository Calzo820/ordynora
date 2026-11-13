import prisma from "../lib/prisma.js";
import { lockRestaurantTable } from "../lib/tableSessionLock.js";

const ACTIVE_INTEGRATION_STATUSES = ["connected", "degraded"];

const TILBY_TRIGGERS = new Set([
  "created",
  "status_changed",
  "item_changed",
  "extra_added",
  "cancelled",
  "bill_requested",
  "service_completed",
  "manual",
]);

const CASSA_TRIGGERS = new Set(["bill_requested", "service_completed", "manual"]);

function integrationConfig(integration) {
  return integration?.config && typeof integration.config === "object" && !Array.isArray(integration.config)
    ? integration.config
    : {};
}

async function resolveSyncEntity(client, orderId) {
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: { id: true, tableSessionId: true, status: true },
  });
  if (!order) return null;
  return order.tableSessionId
    ? { entityType: "table_session", entityId: order.tableSessionId, order }
    : { entityType: "order", entityId: order.id, order };
}

async function updateEntitySyncState(client, entity, data) {
  if (entity.entityType === "table_session") {
    await client.tableSession.update({ where: { id: entity.entityId }, data });
    await client.order.updateMany({
      where: { tableSessionId: entity.entityId, integrationSyncStatus: { not: "processing" } },
      data: {
        ...(data.integrationSyncStatus ? { integrationSyncStatus: data.integrationSyncStatus } : {}),
        ...(Object.hasOwn(data, "integrationLastError") ? { integrationLastError: data.integrationLastError } : {}),
      },
    });
    return;
  }
  await client.order.update({ where: { id: entity.entityId }, data });
}

async function sessionHasActiveOrders(client, entity) {
  if (entity.entityType !== "table_session") return entity.order.status !== "cancelled";
  return (await client.order.count({
    where: { tableSessionId: entity.entityId, status: { not: "cancelled" } },
  })) > 0;
}

export function shouldQueueProviderTrigger(provider, trigger) {
  if (provider === "tilby") return TILBY_TRIGGERS.has(trigger);
  if (provider === "teamsystem_cassa_in_cloud") return CASSA_TRIGGERS.has(trigger);
  return false;
}

export async function enqueueOrderSync(client, {
  restaurantId,
  orderId,
  trigger,
  force = false,
} = {}) {
  if (!restaurantId || !orderId) return null;
  const integration = await client.posIntegration.findUnique({
    where: { restaurantId },
    select: { id: true, provider: true, status: true, config: true },
  });
  const config = integrationConfig(integration);
  const enabled = integration
    && ACTIVE_INTEGRATION_STATUSES.includes(integration.status)
    && config.syncMode === "active";
  if (!enabled) return null;

  const entity = await resolveSyncEntity(client, orderId);
  if (!entity) return null;
  const hasActiveOrders = await sessionHasActiveOrders(client, entity);

  if (integration.provider === "teamsystem_cassa_in_cloud" && trigger === "cancelled") {
    if (hasActiveOrders) return null;
    await client.posIntegrationJob.updateMany({
      where: {
        integrationId: integration.id,
        entityType: entity.entityType,
        entityId: entity.entityId,
        status: "pending",
        attempts: 0,
      },
      data: {
        status: "succeeded",
        processedAt: new Date(),
        nextAttemptAt: null,
        lastError: null,
        responseMeta: { action: "cancelled_before_export" },
      },
    });
    const uncertain = await client.posIntegrationJob.count({
      where: {
        integrationId: integration.id,
        entityType: entity.entityType,
        entityId: entity.entityId,
        status: { in: ["pending", "processing", "retrying", "blocked", "failed"] },
      },
    });
    if (uncertain) {
      const error = new Error(
        "Non è possibile confermare se la comanda sia già arrivata a Cassa in Cloud. Controllala nel gestionale prima di annullarla."
      );
      error.code = "EXTERNAL_SYNC_IN_PROGRESS";
      throw error;
    }
    await updateEntitySyncState(client, entity, {
      integrationSyncStatus: "not_required",
      integrationLastError: null,
    });
    return null;
  }

  if (!force && !shouldQueueProviderTrigger(integration.provider, trigger)) return null;

  const operation = trigger === "cancelled" && !hasActiveOrders ? "delete_order" : "upsert_order";
  const updatedEntity = entity.entityType === "table_session"
    ? await client.tableSession.update({
        where: { id: entity.entityId },
        data: { integrationRevision: { increment: 1 }, integrationLastError: null },
        select: { integrationRevision: true },
      })
    : await client.order.update({
        where: { id: entity.entityId },
        data: { integrationRevision: { increment: 1 }, integrationLastError: null },
        select: { integrationRevision: true },
      });
  await updateEntitySyncState(client, entity, {
    integrationSyncStatus: "queued",
    integrationLastError: null,
  });
  const idempotencyKey = `${integration.id}:${entity.entityType}:${entity.entityId}:${operation}:r${updatedEntity.integrationRevision}`;
  const job = await client.posIntegrationJob.create({
    data: {
      integrationId: integration.id,
      operation,
      direction: "outbound",
      status: "pending",
      idempotencyKey,
      entityType: entity.entityType,
      entityId: entity.entityId,
      payload: { revision: updatedEntity.integrationRevision, trigger, sourceOrderId: orderId },
      nextAttemptAt: new Date(),
    },
  });
  // Intermediate revisions that have never been attempted carry no external
  // side effect. Coalesce them in this same transaction instead of letting a
  // busy table delay every other restaurant in the worker's candidate window.
  await client.posIntegrationJob.updateMany({
    where: {
      integrationId: integration.id, entityType: entity.entityType, entityId: entity.entityId,
      id: { not: job.id }, status: "pending", attempts: 0,
    },
    data: {
      status: "succeeded", processedAt: new Date(), nextAttemptAt: null,
      responseMeta: { action: "superseded", supersededBy: job.id },
    },
  });
  return job;
}

export async function queueOrderSync({ restaurantId, orderId, trigger = "manual", force = true } = {}) {
  return prisma.$transaction((tx) => enqueueOrderSync(tx, {
    restaurantId,
    orderId,
    trigger,
    force,
  }));
}

export async function lockOrderForContentChange(client, previous, { allowClosed = false } = {}) {
  await lockRestaurantTable(client, previous.restaurantId, previous.tableId);
  const current = await client.order.findUnique({ where: { id: previous.id } });
  if (!current || current.restaurantId !== previous.restaurantId || (current.closedAt && !allowClosed)) {
    const error = new Error("Questo conto è stato chiuso o modificato da un altro dispositivo. Ricarica prima di procedere.");
    error.code = "EXTERNAL_ORDER_LOCKED";
    throw error;
  }
  await assertOrderContentCanChange(current, client);
  return current;
}

export async function assertOrderContentCanChange(order, client = prisma) {
  if (!order?.restaurantId || !order?.id) return;
  const integration = await client.posIntegration.findUnique({
    where: { restaurantId: order.restaurantId },
    select: {
      provider: true,
      status: true,
      config: true,
      mappings: {
        where: {
          entityType: order.tableSessionId ? "table_session" : "order",
          localId: order.tableSessionId || order.id,
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  const session = order.tableSessionId
    ? await client.tableSession.findUnique({
        where: { id: order.tableSessionId },
        select: { status: true, integrationSyncStatus: true },
      })
    : null;
  const exportStarted = Boolean(
    order.billRequestedAt
    || session?.status === "closing"
    || integration?.mappings?.length
    || ["queued", "processing", "retrying", "synced", "failed", "blocked"].includes(
      session?.integrationSyncStatus || order.integrationSyncStatus
    )
  );
  if (integration?.status !== "disabled" && integration?.provider === "teamsystem_cassa_in_cloud" && exportStarted) {
    const error = new Error(
      "Il conto è già stato inviato a Cassa in Cloud. Correggi o annulla la comanda dal gestionale per evitare dati diversi."
    );
    error.code = "EXTERNAL_ORDER_LOCKED";
    throw error;
  }
}

export async function assertOrderCanBeCancelled(order, client = prisma) {
  const integration = await client.posIntegration.findUnique({
    where: { restaurantId: order.restaurantId },
    select: {
      id: true,
      provider: true,
      status: true,
      config: true,
      mappings: {
        where: {
          entityType: order.tableSessionId ? "table_session" : "order",
          localId: order.tableSessionId || order.id,
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (integration?.status !== "disabled" && integration?.provider === "teamsystem_cassa_in_cloud" && integration.mappings.length) {
    const error = new Error(
      "Questa comanda è già presente in Cassa in Cloud. Annullala nel gestionale e poi completa la correzione operativa in Ordynora."
    );
    error.code = "EXTERNAL_ORDER_CANCEL_IN_POS";
    throw error;
  }
}

export function isIntegrationSyncActive(integration) {
  return Boolean(
    integration
    && ACTIVE_INTEGRATION_STATUSES.includes(integration.status)
    && integrationConfig(integration).syncMode === "active"
  );
}
