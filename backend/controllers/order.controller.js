import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { calculateBill, clampGuestCount, moneyNumber } from "../lib/billing.js";
import { createOrderPrintJobs, preparationAreas } from "../lib/printJobs.js";
import { safeEmit } from "../lib/socketSafe.js";
import { invalidateTenantCache } from "../lib/tenantCache.js";

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePaymentMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (["contanti", "cash"].includes(raw)) return "cash";
  if (["carta", "card", "pos"].includes(raw)) return "card";
  if (["online", "stripe", "paypal"].includes(raw)) return "online";
  if (["satispay"].includes(raw)) return "satispay";
  return "other";
}

function normalizedPaymentRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row, index) => ({
      method: normalizePaymentMethod(row?.method),
      amount: Math.round(parseNumber(row?.amount) * 100) / 100,
      splitLabel: String(row?.label || `Quota ${index + 1}`).trim().slice(0, 80),
    }))
    .filter((row) => row.method && row.amount > 0);
}

function paidPaymentsTotal(payments = []) {
  return payments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
}

function hasActivePendingPayment(payments = [], now = Date.now()) {
  return payments.some((payment) => {
    if (payment.status !== "pending") return false;
    if (payment.checkoutExpiresAt) {
      return new Date(payment.checkoutExpiresAt).getTime() >= now;
    }
    return new Date(payment.createdAt || 0).getTime() >= now - 2 * 60 * 60 * 1000;
  });
}

function billHasStarted(payments = []) {
  return payments.some((payment) => payment.status === "paid") || hasActivePendingPayment(payments);
}

function emitSocket(req, eventName, payload = {}) {
  const io = req.app.get("io");
  const room = payload.restaurantId ? `restaurant:${payload.restaurantId}` : null;
  safeEmit(io, room, eventName, payload);
}

function canTransitionStatus(currentStatus, nextStatus) {
  const allowedTransitions = {
    pending: ["in_progress", "cancelled", "served"],
    in_progress: ["pending", "ready", "cancelled", "served"],
    ready: ["in_progress", "served"],
    served: [],
    cancelled: [],
  };
  return (allowedTransitions[currentStatus] || []).includes(nextStatus);
}

function resolveServiceArea(req) {
  if (req.user?.role === "kitchen") return "kitchen";
  if (req.user?.role === "bar") return "bar";
  const requested = String(req.query?.area || req.body?.area || "").trim().toLowerCase();
  return ["kitchen", "bar"].includes(requested) ? requested : null;
}

function stationStatus(items = []) {
  const active = items.filter((item) => item.status !== "voided");
  if (!active.length) return "ready";
  const statuses = active.map((item) => item.preparationStatus || "pending");
  if (statuses.every((status) => status === "ready" || status === "served")) return "ready";
  if (statuses.some((status) => status === "in_progress" || status === "ready" || status === "served")) return "in_progress";
  return "pending";
}

function overallPreparationStatus(items = []) {
  const active = items.filter((item) => item.status !== "voided" && item.preparationArea);
  if (!active.length) return "pending";
  const statuses = active.map((item) => item.preparationStatus || "pending");
  if (statuses.every((status) => status === "ready" || status === "served")) return "ready";
  if (statuses.some((status) => status === "in_progress" || status === "ready" || status === "served")) return "in_progress";
  return "pending";
}

function publicOrderNumber(orderNumber) {
  return `ORD-${String(orderNumber || 1).padStart(4, "0")}`;
}

function publicOrderPayload(order) {
  return {
    id: order.id,
    publicToken: order.publicToken,
    status: order.status,
    notes: order.notes,
    orderNumber: publicOrderNumber(order.orderNumber),
    restaurantName: order.restaurant?.name,
    tableName: order.table?.name,
    table: order.table ? { id: order.table.id, name: order.table.name, code: order.table.code } : null,
    items: order.items,
    totalAmount: order.totalAmount,
    discountAmount: order.discountAmount,
    discountPercent: order.discountPercent,
    extraAmount: order.extraAmount,
    guestCount: order.guestCount,
    coverCharge: order.coverCharge,
    coverChargePerGuest: order.coverChargePerGuest,
    equalSplitEnabled: order.equalSplitEnabled,
    billConfiguredAt: order.billConfiguredAt,
    billRevision: order.billRevision,
    createdAt: order.createdAt,
  };
}

function orderItemsTotal(items = []) {
  return items.reduce((sum, item) => {
    if (item.status === "voided" || item.isComplimentary) return sum;
    return sum + parseNumber(item.priceSnapshot) * parseNumber(item.quantity, 1);
  }, 0);
}

function buildIdempotencyKey({ restaurantId, tableId, clientRequestId }) {
  const safe = clientRequestId ? String(clientRequestId).trim().slice(0, 120) : null;
  if (!safe || !restaurantId || !tableId) return null;
  return [restaurantId, tableId, safe].join(":");
}

async function nextOrderNumber(tx, restaurantId) {
  const counter = await tx.orderCounter.upsert({
    where: { restaurantId },
    create: { restaurantId, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });
  return counter.nextNumber - 1;
}

async function ensureRestaurantAccess(req, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      table: true,
      items: { include: { menuItem: true } },
      payments: { orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return null;
  if (req.user?.restaurantId && order.restaurantId !== req.user.restaurantId) return "FORBIDDEN";
  return order;
}

async function recalcOrderTotal(tx, orderId) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;
  const bill = calculateBill({
    itemsSubtotal: orderItemsTotal(order.items),
    extraAmount: order.extraAmount,
    guestCount: order.guestCount,
    coverCharge: order.coverCharge,
    coverChargePerGuest: order.coverChargePerGuest,
    discountPercent: order.discountPercent,
    discountAmount: order.discountAmount,
  });
  return tx.order.update({
    where: { id: orderId },
    data: {
      totalAmount: bill.totalAmount,
      discountAmount: bill.discountAmount,
    },
    include: { table: true, items: true },
  });
}

async function recalcSessionTotal(tx, tableSessionId) {
  if (!tableSessionId) return;
  const orders = await tx.order.findMany({
    where: { tableSessionId, status: { not: "cancelled" } },
    select: { totalAmount: true },
  });
  const totalAmount = orders.reduce((sum, order) => sum + Math.max(0, parseNumber(order.totalAmount)), 0);
  await tx.tableSession.update({ where: { id: tableSessionId }, data: { totalAmount } });
}

export const createPublicOrder = async (req, res) => {
  let finalIdempotencyKey = null;

  try {
    const { restaurantSlug, tableToken, restaurantId, tableId, customerName, notes, items, clientRequestId } = req.body || {};

    const hasQrIdentity = Boolean(restaurantSlug && tableToken);
    const hasIdIdentity = Boolean(restaurantId && tableId);

    if (!hasQrIdentity && !hasIdIdentity) {
      return res.status(400).json({
        message: "restaurantSlug/tableToken oppure restaurantId/tableId sono obbligatori",
      });
    }

    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "L'ordine deve contenere almeno un articolo" });

    const safeClientRequestId = clientRequestId ? String(clientRequestId).trim().slice(0, 120) : null;

    let table = null;

    if (hasQrIdentity) {
      table = await prisma.table.findFirst({
        where: { qrToken: String(tableToken), isActive: true, restaurant: { slug: String(restaurantSlug), isActive: true } },
        include: { restaurant: true },
      });
    }

    if (!table && hasIdIdentity) {
      table = await prisma.table.findFirst({
        where: { id: String(tableId), restaurantId: String(restaurantId), isActive: true, restaurant: { isActive: true } },
        include: { restaurant: true },
      });
    }

    if (!table) return res.status(404).json({ message: "Tavolo o ristorante non trovato" });

    const restaurantSettings =
      table.restaurant?.settingsJson &&
      typeof table.restaurant.settingsJson === "object" &&
      !Array.isArray(table.restaurant.settingsJson)
        ? table.restaurant.settingsJson
        : {};
    const billingDefaults =
      restaurantSettings.billing &&
      typeof restaurantSettings.billing === "object" &&
      !Array.isArray(restaurantSettings.billing)
        ? restaurantSettings.billing
        : {};
    const recentSeatedReservation = await prisma.reservation.findFirst({
      where: {
        restaurantId: table.restaurantId,
        tableId: table.id,
        status: "seated",
        updatedAt: { gte: new Date(Date.now() - 18 * 60 * 60 * 1000) },
      },
      orderBy: { updatedAt: "desc" },
      select: { guests: true },
    });
    const initialGuestCount = clampGuestCount(recentSeatedReservation?.guests || 1);

    const idempotencyKey = buildIdempotencyKey({
      restaurantId: table.restaurantId,
      tableId: table.id,
      clientRequestId: safeClientRequestId,
    });
    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: { restaurant: true, table: true, items: { include: { menuItem: true } } },
      });
      if (existing) {
        return res.status(200).json({
          message: "Ordine già ricevuto",
          order: publicOrderPayload(existing),
        });
      }
    }

    const validItems = items.filter((item) => item?.menuItemId && parseNumber(item.quantity) > 0);
    if (!validItems.length) return res.status(400).json({ message: "Nessun articolo valido nell'ordine" });

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: validItems.map((item) => item.menuItemId) }, restaurantId: table.restaurantId, isAvailable: true, isDeleted: false },
    });
    const menuById = new Map(menuItems.map((item) => [item.id, item]));
    const orderItemsData = validItems.map((item) => {
      const menuItem = menuById.get(item.menuItemId);
      if (!menuItem) return null;
      return {
        menuItemId: menuItem.id,
        quantity: Math.max(1, Math.trunc(parseNumber(item.quantity, 1))),
        notes: String(item.notes || "").slice(0, 300) || null,
        nameSnapshot: menuItem.name,
        priceSnapshot: menuItem.price,
        costSnapshot: menuItem.costPrice,
        categorySnapshot: menuItem.category || "Altro",
        preparationArea: menuItem.preparationArea,
      };
    }).filter(Boolean);
    if (!orderItemsData.length) return res.status(400).json({ message: "Gli articoli selezionati non sono validi o disponibili" });

    const order = await prisma.$transaction(async (tx) => {
      let session = await tx.tableSession.findFirst({ where: { restaurantId: table.restaurantId, tableId: table.id, status: "open" }, orderBy: { openedAt: "desc" } });
      if (!session) {
        session = await tx.tableSession.create({ data: { restaurantId: table.restaurantId, tableId: table.id, status: "open", guestName: customerName ? String(customerName).slice(0, 100) : null, notes: notes ? String(notes).slice(0, 500) : null } });
      }
      const previousOrder = await tx.order.findFirst({
        where: {
          tableSessionId: session.id,
          closedAt: null,
          status: { not: "cancelled" },
        },
        orderBy: { createdAt: "desc" },
        select: {
          guestCount: true,
          coverCharge: true,
          coverChargePerGuest: true,
          equalSplitEnabled: true,
          discountPercent: true,
          billConfiguredAt: true,
        },
      });
      const scopedIdempotencyKey = buildIdempotencyKey({
        restaurantId: table.restaurantId,
        tableId: table.id,
        clientRequestId: safeClientRequestId,
      });
      finalIdempotencyKey = scopedIdempotencyKey;
      if (scopedIdempotencyKey) {
        const existingInTx = await tx.order.findUnique({
          where: { idempotencyKey: scopedIdempotencyKey },
          include: { restaurant: true, table: true, items: { include: { menuItem: true } } },
        });
        if (existingInTx) return existingInTx;
      }
      const orderGuestCount = previousOrder?.guestCount || initialGuestCount;
      const orderCoverCharge = previousOrder?.coverCharge ?? Math.max(0, moneyNumber(billingDefaults.coverCharge));
      const orderCoverChargePerGuest = previousOrder?.coverChargePerGuest ?? billingDefaults.coverChargePerGuest !== false;
      const orderEqualSplitEnabled = previousOrder?.equalSplitEnabled ?? billingDefaults.equalSplitEnabled !== false;
      const orderDiscountPercent = previousOrder?.discountPercent || 0;
      const initialBill = calculateBill({
        itemsSubtotal: orderItemsData.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0),
        guestCount: orderGuestCount,
        coverCharge: orderCoverCharge,
        coverChargePerGuest: orderCoverChargePerGuest,
        discountPercent: orderDiscountPercent,
      });
      const orderNumber = await nextOrderNumber(tx, table.restaurantId);
      for (const item of orderItemsData) {
        const source = menuById.get(item.menuItemId);
        if (!source?.trackStock) continue;
        const changed = await tx.menuItem.updateMany({
          where: {
            id: source.id,
            restaurantId: table.restaurantId,
            trackStock: true,
            stockQuantity: { gte: item.quantity },
          },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (changed.count !== 1) {
          const stockError = new Error(`${source.name} non ha scorte sufficienti`);
          stockError.code = "INSUFFICIENT_STOCK";
          throw stockError;
        }
      }
      const created = await tx.order.create({
        data: {
          restaurantId: table.restaurantId,
          tableId: table.id,
          tableSessionId: session.id,
          customerName: customerName ? String(customerName).slice(0, 100) : null,
          notes: notes ? String(notes).slice(0, 500) : null,
          status: "pending",
          orderNumber,
          source: "qr",
          clientRequestId: safeClientRequestId,
          idempotencyKey: scopedIdempotencyKey,
          paymentStatus: "unpaid",
          totalAmount: initialBill.totalAmount,
          discountAmount: initialBill.discountAmount,
          guestCount: orderGuestCount,
          coverCharge: orderCoverCharge,
          coverChargePerGuest: orderCoverChargePerGuest,
          equalSplitEnabled: orderEqualSplitEnabled,
          discountPercent: orderDiscountPercent,
          billConfiguredAt: previousOrder?.billConfiguredAt || (recentSeatedReservation ? new Date() : null),
          items: { create: orderItemsData },
        },
        include: { restaurant: true, table: true, items: { include: { menuItem: true } } },
      });
      await createOrderPrintJobs(tx, created);
      for (const createdItem of created.items) {
        const source = menuById.get(createdItem.menuItemId);
        if (!source?.trackStock) continue;
        const updatedStock = await tx.menuItem.findUnique({ where: { id: source.id } });
        await tx.stockMovement.create({
          data: {
            restaurantId: table.restaurantId,
            menuItemId: source.id,
            orderItemId: createdItem.id,
            type: "sale",
            quantityBefore: parseNumber(updatedStock.stockQuantity) + createdItem.quantity,
            quantityChange: -createdItem.quantity,
            quantityAfter: updatedStock.stockQuantity,
            reason: `Ordine ${publicOrderNumber(orderNumber)}`,
          },
        });
        if (parseNumber(updatedStock.stockQuantity) <= 0) {
          await tx.menuItem.update({ where: { id: source.id }, data: { isAvailable: false } });
        }
      }
      await recalcSessionTotal(tx, session.id);
      return created;
    });

    invalidateTenantCache(order.restaurantId, "public-menu");
    emitSocket(req, "new-order", { orderId: order.id, publicToken: order.publicToken, orderNumber: publicOrderNumber(order.orderNumber), tableName: order.table.name, tableId: order.table.id, restaurantId: order.restaurantId, restaurantName: order.restaurant.name, status: order.status, createdAt: order.createdAt });
    preparationAreas(order.items).forEach((area) => {
      emitSocket(req, "print-job", { orderId: order.id, restaurantId: order.restaurantId, area, kind: "order" });
    });
    emitSocket(req, "table-updated", { tableName: order.table.name, tableId: order.table.id, restaurantId: order.restaurantId, reason: "new-order" });

    return res.status(201).json({ message: "Ordine creato correttamente", order: publicOrderPayload(order) });
  } catch (error) {
    console.error("createPublicOrder error:", error);
    if (error?.code === "INSUFFICIENT_STOCK") {
      return res.status(409).json({ message: error.message });
    }
    if (error?.code === "P2002" && finalIdempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: finalIdempotencyKey },
        include: { restaurant: true, table: true, items: { include: { menuItem: true } } },
      });
      if (existing) {
        return res.status(200).json({
          message: "Ordine già ricevuto",
          order: publicOrderPayload(existing),
        });
      }
    }
    return res.status(500).json({ message: "Errore durante la creazione dell'ordine" });
  }
};

export const getPublicOrderByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      include: { restaurant: true, table: true, items: { include: { menuItem: true } } },
    });
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    return res.json({
      id: order.id,
      publicToken: order.publicToken,
      orderNumber: publicOrderNumber(order.orderNumber),
      status: order.status,
      notes: order.notes,
      restaurantName: order.restaurant?.name || null,
      tableName: order.table?.name || null,
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount,
      discountPercent: order.discountPercent,
      extraAmount: order.extraAmount,
      guestCount: order.guestCount,
      coverCharge: order.coverCharge,
      coverChargePerGuest: order.coverChargePerGuest,
      equalSplitEnabled: order.equalSplitEnabled,
      billConfiguredAt: order.billConfiguredAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      acceptedAt: order.acceptedAt,
      readyAt: order.readyAt,
      servedAt: order.servedAt,
      closedAt: order.closedAt,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      items: order.items.map((item) => ({ id: item.id, menuItemId: item.menuItemId, quantity: item.quantity, notes: item.notes, nameSnapshot: item.nameSnapshot, priceSnapshot: item.priceSnapshot, categorySnapshot: item.categorySnapshot, preparationArea: item.preparationArea || item.menuItem?.preparationArea || null })),
      table: order.table ? { id: order.table.id, name: order.table.name, code: order.table.code } : null,
    });
  } catch (error) {
    console.error("getPublicOrderByToken error:", error);
    return res.status(500).json({ message: "Errore durante il recupero dell'ordine" });
  }
};

export const getOrders = async (req, res) => {
  try {
    const { status, history, activeOnly, from, to } = req.query || {};
    const where = { restaurantId: req.user.restaurantId };

    if (status) {
      const statuses = String(status)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (statuses.length === 1) where.status = statuses[0];
      if (statuses.length > 1) where.status = { in: statuses };
    }

    if (history === "true") {
      where.OR = [
        { closedAt: { not: null } },
        { status: { in: ["served", "cancelled"] } },
        { paymentStatus: "paid" },
      ];
    }

    if (activeOnly === "true") {
      where.closedAt = null;
      where.status = { notIn: ["served", "cancelled"] };
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        table: true,
        items: { include: { menuItem: true } },
        payments: { orderBy: { createdAt: "asc" } },
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(orders.map((order) => ({ ...order, orderNumberLabel: publicOrderNumber(order.orderNumber) })));
  } catch (error) {
    console.error("getOrders error:", error);
    return res.status(500).json({ message: "Errore durante il recupero ordini" });
  }
};

export const getServiceOrders = async (req, res) => {
  try {
    const area = resolveServiceArea(req);
    if (!area) return res.status(400).json({ message: "Indica il reparto cucina o bar" });

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: req.user.restaurantId,
        closedAt: null,
        status: { in: ["pending", "in_progress", "ready"] },
      },
      include: {
        table: true,
        items: {
          where: { status: "active", preparationArea: area },
          select: {
            id: true,
            menuItemId: true,
            quantity: true,
            nameSnapshot: true,
            categorySnapshot: true,
            notes: true,
            preparationArea: true,
            preparationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    return res.json(
      orders
        .filter((order) => order.items.length > 0)
        .map((order) => ({
          id: order.id,
          publicToken: order.publicToken,
          orderNumber: order.orderNumber,
          orderNumberLabel: publicOrderNumber(order.orderNumber),
          notes: order.notes,
          source: order.source,
          status: stationStatus(order.items),
          globalStatus: order.status,
          station: area,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          acceptedAt: order.acceptedAt,
          readyAt: order.readyAt,
          table: order.table,
          items: order.items,
        }))
    );
  } catch (error) {
    console.error("getServiceOrders error:", error);
    return res.status(500).json({ message: "Errore durante il recupero ordini servizio" });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ message: "Status obbligatorio" });
    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    const area = resolveServiceArea(req);
    const stationRole = ["kitchen", "bar"].includes(req.user?.role);
    const isStationUpdate = Boolean(area) && (stationRole || ["owner", "admin"].includes(req.user?.role));
    if (stationRole && !area) return res.status(403).json({ message: "Reparto non autorizzato" });
    if (isStationUpdate && !["pending", "in_progress", "ready"].includes(status)) {
      return res.status(400).json({ message: "Il reparto può gestire solo preparazione e pronto" });
    }

    const currentStationStatus = isStationUpdate
      ? stationStatus(order.items.filter((item) => item.preparationArea === area))
      : order.status;
    if (!canTransitionStatus(currentStationStatus, status)) {
      return res.status(400).json({ message: `Transizione non consentita da ${currentStationStatus} a ${status}` });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isStationUpdate) {
        await tx.orderItem.updateMany({
          where: {
            orderId: id,
            status: "active",
            preparationArea: area,
          },
          data: { preparationStatus: status },
        });
        const activeItems = await tx.orderItem.findMany({
          where: { orderId: id, status: "active" },
          select: { status: true, preparationArea: true, preparationStatus: true },
        });
        const derivedStatus = overallPreparationStatus(activeItems);
        const data = {
          status: derivedStatus,
          ...(derivedStatus === "in_progress" && !order.acceptedAt ? { acceptedAt: new Date() } : {}),
          ...(derivedStatus === "ready" ? { readyAt: new Date() } : { readyAt: null }),
        };
        const result = await tx.order.update({
          where: { id },
          data,
          include: { table: true, items: true },
        });
        if (order.status !== derivedStatus) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: id,
              fromStatus: order.status,
              toStatus: derivedStatus,
              changedByUserId: req.user?.userId || null,
              changedByRole: req.user?.role || null,
              note: `${area}: ${currentStationStatus} -> ${status}`,
            },
          });
        }
        await writeAudit(tx, req, {
          action: "order.station_status_updated",
          entityType: "order",
          entityId: id,
          metadata: { area, from: currentStationStatus, to: status, overall: derivedStatus },
        });
        return result;
      }

      const data = { status };
      if (status === "pending") {
        data.acceptedAt = null;
        data.readyAt = null;
      }
      if (status === "in_progress" && !order.acceptedAt) data.acceptedAt = new Date();
      if (status === "in_progress") data.readyAt = null;
      if (status === "ready") data.readyAt = new Date();
      if (status === "served") data.servedAt = new Date();
      if (status === "cancelled") {
        for (const item of order.items) {
          if (!item.menuItem?.trackStock || item.status === "voided") continue;
          const current = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
          const before = parseNumber(current?.stockQuantity);
          const after = before + item.quantity;
          await tx.menuItem.update({ where: { id: item.menuItemId }, data: { stockQuantity: after } });
          await tx.stockMovement.create({
            data: {
              restaurantId: order.restaurantId,
              menuItemId: item.menuItemId,
              userId: req.user?.userId || null,
              orderItemId: item.id,
              type: "restore",
              quantityBefore: before,
              quantityChange: item.quantity,
              quantityAfter: after,
              reason: "Ordine annullato",
            },
          });
        }
      }
      if (["pending", "in_progress", "ready", "served"].includes(status)) {
        await tx.orderItem.updateMany({
          where: { orderId: id, status: "active" },
          data: { preparationStatus: status },
        });
      }
      const result = await tx.order.update({ where: { id }, data, include: { table: true, items: true } });
      await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: order.status, toStatus: status, changedByUserId: req.user?.userId || null, changedByRole: req.user?.role || null } });
      await writeAudit(tx, req, {
        action: "order.status_updated",
        entityType: "order",
        entityId: id,
        metadata: { from: order.status, to: status },
      });
      return result;
    });

    invalidateTenantCache(order.restaurantId, "public-menu");
    emitSocket(req, "order-updated", {
      orderId: updated.id,
      tableName: updated.table?.name,
      tableId: updated.table?.id,
      restaurantId: updated.restaurantId,
      status: updated.status,
      stationStatus: isStationUpdate ? status : updated.status,
      area,
      updatedAt: updated.updatedAt,
    });
    emitSocket(req, "table-updated", { tableName: updated.table?.name, tableId: updated.table?.id, restaurantId: updated.restaurantId, reason: "order-status" });
    const responseOrder = isStationUpdate
      ? {
          ...updated,
          globalStatus: updated.status,
          status,
          station: area,
          items: updated.items.filter((item) => item.status !== "voided" && item.preparationArea === area),
        }
      : updated;
    return res.json({ message: "Stato ordine aggiornato", order: responseOrder });
  } catch (error) {
    console.error("updateOrderStatus error:", error);
    return res.status(500).json({ message: "Errore durante aggiornamento stato ordine" });
  }
};

export const addOrderExtra = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity } = req.body || {};
    const preparationArea = ["kitchen", "bar"].includes(req.body?.preparationArea)
      ? req.body.preparationArea
      : "kitchen";
    if (!name || parseNumber(price) < 0) return res.status(400).json({ message: "Nome e prezzo extra sono obbligatori" });
    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    if (["served", "cancelled"].includes(order.status)) return res.status(400).json({ message: "Non puoi aggiungere extra a un ordine chiuso" });
    if (billHasStarted(order.payments)) {
      return res.status(409).json({ message: "Il conto non può essere modificato dopo l'inizio di un pagamento" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const extraItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: null,
          quantity: Math.max(1, Math.trunc(parseNumber(quantity, 1))),
          notes: "extra cassa",
          nameSnapshot: String(name).slice(0, 120),
          priceSnapshot: parseNumber(price),
          categorySnapshot: "Extra",
          preparationArea,
        },
      });
      await createOrderPrintJobs(
        tx,
        { id: order.id, restaurantId: order.restaurantId, items: [extraItem] },
        { kind: "extra", eventKeySuffix: `extra:${extraItem.id}` }
      );
      const updated = await recalcOrderTotal(tx, order.id);
      if (order.tableSessionId) await recalcSessionTotal(tx, order.tableSessionId);
      return { extraItem, updated };
    });

    emitSocket(req, "order-updated", { orderId: order.id, tableName: order.table?.name, tableId: order.table?.id, restaurantId: order.restaurantId, status: order.status, reason: "extra-added" });
    emitSocket(req, "print-job", { orderId: order.id, restaurantId: order.restaurantId, area: preparationArea, kind: "extra" });
    emitSocket(req, "table-updated", { tableName: order.table?.name, tableId: order.table?.id, restaurantId: order.restaurantId, reason: "extra-added" });
    return res.status(201).json({ message: "Extra aggiunto", item: result.extraItem, order: result.updated });
  } catch (error) {
    console.error("addOrderExtra error:", error);
    return res.status(500).json({ message: "Errore durante aggiunta extra" });
  }
};

export const closeOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { discount, extra, paymentMethod, payments } = req.body || {};
    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });

    const outcome = await prisma.$transaction(async (tx) => {
      const adjustments = {};
      if (discount !== undefined) {
        adjustments.discountAmount = Math.max(0, parseNumber(discount));
        adjustments.discountPercent = 0;
      }
      if (extra !== undefined) adjustments.extraAmount = Math.max(0, parseNumber(extra));
      if (Object.keys(adjustments).length) {
        await tx.order.update({ where: { id }, data: adjustments });
      }
      let result = await recalcOrderTotal(tx, id);
      const existingPayments = await tx.paymentTransaction.findMany({
        where: { orderId: id, status: { in: ["paid", "pending"] } },
      });
      if (hasActivePendingPayment(existingPayments)) {
        const pendingError = new Error("È presente un pagamento online in corso");
        pendingError.code = "PAYMENT_IN_PROGRESS";
        throw pendingError;
      }
      const rows = normalizedPaymentRows(payments);
      const alreadyPaid = paidPaymentsTotal(existingPayments);
      const remainingBeforeNew = Math.max(0, parseNumber(result.totalAmount) - alreadyPaid);

      if (!rows.length && paymentMethod && remainingBeforeNew > 0.009) {
        rows.push({
          method: normalizePaymentMethod(paymentMethod),
          amount: remainingBeforeNew,
          splitLabel: "Saldo conto",
        });
      }
      const newPaymentsTotal = rows.reduce((sum, row) => sum + row.amount, 0);
      if (newPaymentsTotal > remainingBeforeNew + 0.009) {
        const overpaymentError = new Error("L'importo inserito supera il saldo del conto");
        overpaymentError.code = "OVERPAYMENT";
        throw overpaymentError;
      }

      for (const row of rows) {
        await tx.paymentTransaction.create({
          data: {
            restaurantId: order.restaurantId,
            orderId: id,
            provider: "manual",
            amount: row.amount,
            currency: "EUR",
            status: "paid",
            method: row.method,
            splitLabel: row.splitLabel,
            paidAt: new Date(),
            createdByUserId: req.user?.userId || null,
          },
        });
      }

      const allPayments = await tx.paymentTransaction.findMany({
        where: { orderId: id, status: "paid" },
        orderBy: { createdAt: "asc" },
      });
      const paidTotal = paidPaymentsTotal(allPayments);
      const total = parseNumber(result.totalAmount);
      const methods = [...new Set(allPayments.map((payment) => payment.method).filter(Boolean))];

      if (paidTotal + 0.009 < total) {
        result = await tx.order.update({
          where: { id },
          data: {
            paymentStatus: paidTotal > 0 ? "pending" : "unpaid",
            paymentMethod: methods.length === 1 ? methods[0] : methods.length > 1 ? "other" : null,
          },
          include: { table: true, items: true, payments: { orderBy: { createdAt: "asc" } } },
        });
        await writeAudit(tx, req, {
          action: "order.partial_payment",
          entityType: "order",
          entityId: id,
          metadata: { paidTotal, remaining: total - paidTotal },
        });
        return { order: result, incomplete: true, paidTotal, remaining: total - paidTotal };
      }

      result = await tx.order.update({
        where: { id },
        data: {
          status: order.status === "cancelled" ? "cancelled" : "served",
          servedAt: order.servedAt || new Date(),
          closedAt: new Date(),
          paymentStatus: "paid",
          paymentMethod: methods.length === 1 ? methods[0] : "other",
          reopenedAt: null,
          reopenedByUserId: null,
        },
        include: { table: true, items: true, payments: { orderBy: { createdAt: "asc" } } },
      });
      if (order.status !== result.status) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            fromStatus: order.status,
            toStatus: result.status,
            changedByUserId: req.user?.userId || null,
            changedByRole: req.user?.role || null,
            note: "Conto chiuso",
          },
        });
      }
      if (result.tableSessionId) {
        await recalcSessionTotal(tx, result.tableSessionId);
        const openOrdersCount = await tx.order.count({
          where: { tableSessionId: result.tableSessionId, closedAt: null, status: { notIn: ["cancelled"] } },
        });
        if (openOrdersCount === 0) {
          await tx.tableSession.update({
            where: { id: result.tableSessionId },
            data: { status: "closed", closedAt: new Date() },
          });
        }
      }
      await writeAudit(tx, req, {
        action: "order.closed",
        entityType: "order",
        entityId: id,
        metadata: { total, paidTotal, methods },
      });
      return { order: result, incomplete: false, paidTotal, remaining: 0 };
    });

    if (outcome.incomplete) {
      emitSocket(req, "order-updated", {
        orderId: outcome.order.id,
        tableId: outcome.order.table?.id,
        restaurantId: outcome.order.restaurantId,
        reason: "partial-payment",
      });
      return res.status(409).json({
        message: `Pagamento registrato. Mancano ${outcome.remaining.toFixed(2)} EUR per chiudere il conto.`,
        ...outcome,
      });
    }

    const updated = outcome.order;
    emitSocket(req, "order-closed", { orderId: updated.id, tableName: updated.table?.name, tableId: updated.table?.id, restaurantId: updated.restaurantId, status: updated.status, closedAt: updated.closedAt });
    emitSocket(req, "table-updated", { tableName: updated.table?.name, tableId: updated.table?.id, restaurantId: updated.restaurantId, reason: "order-closed" });
    return res.json({ message: "Conto chiuso correttamente", order: updated, paidTotal: outcome.paidTotal });
  } catch (error) {
    console.error("closeOrder error:", error);
    if (error?.code === "OVERPAYMENT") return res.status(400).json({ message: error.message });
    if (error?.code === "PAYMENT_IN_PROGRESS") return res.status(409).json({ message: error.message });
    return res.status(500).json({ message: "Errore durante chiusura conto" });
  }
};

export const addOrderPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const rows = normalizedPaymentRows(req.body?.payments || [req.body]);
    if (!rows.length) return res.status(400).json({ message: "Inserisci almeno un pagamento valido" });

    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    if (order.closedAt) return res.status(400).json({ message: "Il conto è già chiuso" });
    if (hasActivePendingPayment(order.payments || [])) {
      return res.status(409).json({ message: "È presente un pagamento online in corso" });
    }
    const existingPaid = paidPaymentsTotal(order.payments || []);
    const rowsTotal = rows.reduce((sum, row) => sum + row.amount, 0);
    if (existingPaid + rowsTotal > parseNumber(order.totalAmount) + 0.009) {
      return res.status(400).json({ message: "L'importo inserito supera il saldo del conto" });
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.paymentTransaction.create({
          data: {
            restaurantId: order.restaurantId,
            orderId: id,
            provider: "manual",
            amount: row.amount,
            currency: "EUR",
            status: "paid",
            method: row.method,
            splitLabel: row.splitLabel,
            paidAt: new Date(),
            createdByUserId: req.user?.userId || null,
          },
        });
      }
      const allPayments = await tx.paymentTransaction.findMany({
        where: { orderId: id, status: "paid" },
        orderBy: { createdAt: "asc" },
      });
      const paidTotal = paidPaymentsTotal(allPayments);
      const remaining = Math.max(0, parseNumber(order.totalAmount) - paidTotal);
      const updated = await tx.order.update({
        where: { id },
        data: { paymentStatus: remaining <= 0.009 ? "paid" : "pending" },
        include: { table: true, items: true, payments: { orderBy: { createdAt: "asc" } } },
      });
      await writeAudit(tx, req, {
        action: "order.payment_added",
        entityType: "order",
        entityId: id,
        metadata: { paidTotal, remaining, rows },
      });
      return { order: updated, paidTotal, remaining };
    });

    emitSocket(req, "order-updated", {
      orderId: id,
      tableId: result.order.tableId,
      restaurantId: result.order.restaurantId,
      reason: "payment-added",
    });
    return res.status(201).json({ message: "Pagamento registrato", ...result });
  } catch (error) {
    console.error("addOrderPayment error:", error);
    return res.status(500).json({ message: "Errore durante la registrazione del pagamento" });
  }
};

export const updateOrderBillSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    if (order.closedAt) return res.status(400).json({ message: "Il conto è già chiuso" });

    const guestCount = clampGuestCount(req.body?.guestCount);
    const coverCharge = Math.min(100, Math.max(0, moneyNumber(req.body?.coverCharge)));
    const coverChargePerGuest = req.body?.coverChargePerGuest !== false;
    const equalSplitEnabled = req.body?.equalSplitEnabled !== false;
    const discountPercent = Math.min(100, Math.max(0, moneyNumber(req.body?.discountPercent)));
    const saveAsDefault = Boolean(req.body?.saveAsDefault);

    let updated = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        updated = await prisma.$transaction(async (tx) => {
          const now = new Date();
          await tx.paymentTransaction.updateMany({
            where: {
              orderId: id,
              status: "pending",
              OR: [
                { checkoutExpiresAt: { lt: now } },
                {
                  checkoutExpiresAt: null,
                  createdAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
                },
              ],
            },
            data: { status: "unpaid" },
          });
          const activePayments = await tx.paymentTransaction.count({
            where: {
              orderId: id,
              OR: [
                { status: "paid" },
                {
                  status: "pending",
                  OR: [
                    { checkoutExpiresAt: null },
                    { checkoutExpiresAt: { gte: now } },
                  ],
                },
              ],
            },
          });
          if (activePayments > 0) {
            throw Object.assign(
              new Error("Coperti e totale sono bloccati perché è già iniziato un pagamento."),
              { code: "BILL_LOCKED" }
            );
          }

          await tx.order.update({
            where: { id },
            data: {
              guestCount,
              coverCharge,
              coverChargePerGuest,
              equalSplitEnabled,
              discountPercent,
              discountAmount: 0,
              billConfiguredAt: new Date(),
              billRevision: { increment: 1 },
            },
          });
          const recalculated = await recalcOrderTotal(tx, id);
          if (order.tableSessionId) await recalcSessionTotal(tx, order.tableSessionId);

          if (saveAsDefault) {
            const restaurant = await tx.restaurant.findUnique({
              where: { id: order.restaurantId },
              select: { settingsJson: true },
            });
            const settings =
              restaurant?.settingsJson &&
              typeof restaurant.settingsJson === "object" &&
              !Array.isArray(restaurant.settingsJson)
                ? restaurant.settingsJson
                : {};
            await tx.restaurant.update({
              where: { id: order.restaurantId },
              data: {
                settingsJson: {
                  ...settings,
                  billing: {
                    ...(settings.billing && typeof settings.billing === "object" ? settings.billing : {}),
                    coverCharge,
                    coverChargePerGuest,
                    equalSplitEnabled,
                  },
                },
              },
            });
          }

          await writeAudit(tx, req, {
            action: "order.bill_configured",
            entityType: "order",
            entityId: id,
            metadata: {
              guestCount,
              coverCharge,
              coverChargePerGuest,
              equalSplitEnabled,
              discountPercent,
              saveAsDefault,
              totalAmount: recalculated.totalAmount,
            },
          });
          return recalculated;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        break;
      } catch (error) {
        if (error?.code !== "P2034" || attempt === 2) throw error;
      }
    }

    emitSocket(req, "order-updated", {
      orderId: updated.id,
      tableId: updated.tableId,
      restaurantId: updated.restaurantId,
      reason: "bill-configured",
    });
    emitSocket(req, "table-updated", {
      orderId: updated.id,
      tableId: updated.tableId,
      restaurantId: updated.restaurantId,
      reason: "bill-configured",
    });
    return res.json({
      message: saveAsDefault
        ? "Coperti aggiornati e coperto salvato come predefinito"
        : "Coperti e totale aggiornati",
      order: updated,
    });
  } catch (error) {
    console.error("updateOrderBillSettings error:", error);
    if (error?.code === "BILL_LOCKED") {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    if (error?.code === "P2034") {
      return res.status(409).json({
        code: "BILL_CHANGED",
        message: "Il conto è cambiato mentre lo stavi aggiornando. Aggiorna la cassa e riprova.",
      });
    }
    return res.status(500).json({ message: "Errore durante l'aggiornamento del conto" });
  }
};

export const updateOrderItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const action = String(req.body?.action || "").trim().toLowerCase();
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!["void", "complimentary", "restore"].includes(action)) {
      return res.status(400).json({ message: "Azione articolo non valida" });
    }
    if (action !== "restore" && !reason) {
      return res.status(400).json({ message: "Indica il motivo dell'operazione" });
    }

    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    if (order.closedAt) return res.status(400).json({ message: "Riapri il conto prima di modificarlo" });
    if (billHasStarted(order.payments)) {
      return res.status(409).json({ message: "Il conto non può essere modificato dopo l'inizio di un pagamento" });
    }
    const currentItem = order.items.find((item) => item.id === itemId);
    if (!currentItem) return res.status(404).json({ message: "Articolo non trovato" });

    const result = await prisma.$transaction(async (tx) => {
      if (currentItem.menuItem?.trackStock) {
        if (action === "void" && currentItem.status !== "voided") {
          const before = parseNumber(currentItem.menuItem.stockQuantity);
          const after = before + currentItem.quantity;
          await tx.menuItem.update({
            where: { id: currentItem.menuItemId },
            data: { stockQuantity: after },
          });
          await tx.stockMovement.create({
            data: {
              restaurantId: order.restaurantId,
              menuItemId: currentItem.menuItemId,
              userId: req.user?.userId || null,
              orderItemId: currentItem.id,
              type: "restore",
              quantityBefore: before,
              quantityChange: currentItem.quantity,
              quantityAfter: after,
              reason,
            },
          });
        }
        if (action === "restore" && currentItem.status === "voided") {
          const before = parseNumber(currentItem.menuItem.stockQuantity);
          if (before < currentItem.quantity) {
            const stockError = new Error("Scorte insufficienti per ripristinare l'articolo");
            stockError.code = "INSUFFICIENT_STOCK";
            throw stockError;
          }
          const after = before - currentItem.quantity;
          await tx.menuItem.update({
            where: { id: currentItem.menuItemId },
            data: { stockQuantity: after, isAvailable: after > 0 ? currentItem.menuItem.isAvailable : false },
          });
          await tx.stockMovement.create({
            data: {
              restaurantId: order.restaurantId,
              menuItemId: currentItem.menuItemId,
              userId: req.user?.userId || null,
              orderItemId: currentItem.id,
              type: "sale",
              quantityBefore: before,
              quantityChange: -currentItem.quantity,
              quantityAfter: after,
              reason: "Ripristino articolo sul conto",
            },
          });
        }
      }

      const data = action === "void"
        ? {
            status: "voided",
            voidReason: reason,
            voidedAt: new Date(),
            voidedByUserId: req.user?.userId || null,
            isComplimentary: false,
            complimentaryReason: null,
          }
        : action === "complimentary"
          ? {
              status: "active",
              voidReason: null,
              voidedAt: null,
              voidedByUserId: null,
              isComplimentary: true,
              complimentaryReason: reason,
            }
          : {
              status: "active",
              voidReason: null,
              voidedAt: null,
              voidedByUserId: null,
              isComplimentary: false,
              complimentaryReason: null,
            };

      const item = await tx.orderItem.update({ where: { id: itemId }, data });
      const updated = await recalcOrderTotal(tx, id);
      if (order.tableSessionId) await recalcSessionTotal(tx, order.tableSessionId);
      await writeAudit(tx, req, {
        action: `order_item.${action}`,
        entityType: "order",
        entityId: id,
        reason,
        metadata: { itemId, itemName: currentItem.nameSnapshot, quantity: currentItem.quantity },
      });
      return { item, order: updated };
    });

    invalidateTenantCache(order.restaurantId, "public-menu");
    emitSocket(req, "order-updated", {
      orderId: id,
      tableId: order.tableId,
      restaurantId: order.restaurantId,
      reason: `item-${action}`,
    });
    return res.json({ message: "Conto aggiornato", ...result });
  } catch (error) {
    console.error("updateOrderItem error:", error);
    if (error?.code === "INSUFFICIENT_STOCK") return res.status(409).json({ message: error.message });
    return res.status(500).json({ message: "Errore durante l'aggiornamento dell'articolo" });
  }
};

export const reopenOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!reason) return res.status(400).json({ message: "Indica il motivo della riapertura" });
    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    if (!order.closedAt) return res.status(400).json({ message: "Il conto è già aperto" });

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: {
          status: "ready",
          closedAt: null,
          servedAt: null,
          reopenedAt: new Date(),
          reopenedByUserId: req.user?.userId || null,
        },
        include: { table: true, items: true, payments: { orderBy: { createdAt: "asc" } } },
      });
      if (order.tableSessionId) {
        await tx.tableSession.update({
          where: { id: order.tableSessionId },
          data: { status: "open", closedAt: null },
        });
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: "ready",
          changedByUserId: req.user?.userId || null,
          changedByRole: req.user?.role || null,
          note: `Conto riaperto: ${reason}`,
        },
      });
      await writeAudit(tx, req, {
        action: "order.reopened",
        entityType: "order",
        entityId: id,
        reason,
      });
      return result;
    });

    emitSocket(req, "order-updated", {
      orderId: id,
      tableId: updated.tableId,
      restaurantId: updated.restaurantId,
      reason: "order-reopened",
    });
    emitSocket(req, "table-updated", {
      tableId: updated.tableId,
      restaurantId: updated.restaurantId,
      reason: "order-reopened",
    });
    return res.json({ message: "Conto riaperto", order: updated });
  } catch (error) {
    console.error("reopenOrder error:", error);
    return res.status(500).json({ message: "Errore durante la riapertura del conto" });
  }
};

export const getOrderAudit = async (req, res) => {
  try {
    const order = await ensureRestaurantAccess(req, req.params.id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    const rows = await prisma.auditLog.findMany({
      where: { restaurantId: order.restaurantId, entityType: "order", entityId: order.id },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(rows);
  } catch (error) {
    console.error("getOrderAudit error:", error);
    return res.status(500).json({ message: "Registro attività non disponibile" });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await ensureRestaurantAccess(req, id);
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order === "FORBIDDEN") return res.status(403).json({ message: "Accesso negato" });
    if (order.closedAt || order.paymentStatus === "paid") {
      return res.status(400).json({ message: "Un conto chiuso non può essere eliminato. Riaprilo per eventuali correzioni." });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.menuItem?.trackStock || item.status === "voided") continue;
        const current = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
        const before = parseNumber(current?.stockQuantity);
        const after = before + item.quantity;
        await tx.menuItem.update({ where: { id: item.menuItemId }, data: { stockQuantity: after } });
        await tx.stockMovement.create({
          data: {
            restaurantId: order.restaurantId,
            menuItemId: item.menuItemId,
            userId: req.user?.userId || null,
            orderItemId: item.id,
            type: "restore",
            quantityBefore: before,
            quantityChange: item.quantity,
            quantityAfter: after,
            reason: "Ordine annullato",
          },
        });
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: "cancelled",
          changedByUserId: req.user?.userId || null,
          changedByRole: req.user?.role || null,
          note: "Ordine annullato",
        },
      });
      await tx.order.update({
        where: { id },
        data: { status: "cancelled", closedAt: new Date() },
      });
      await writeAudit(tx, req, {
        action: "order.cancelled",
        entityType: "order",
        entityId: id,
        reason: "Annullato da amministrazione",
      });
      if (order.tableSessionId) await recalcSessionTotal(tx, order.tableSessionId);
    });

    invalidateTenantCache(order.restaurantId, "public-menu");
    emitSocket(req, "order-deleted", {
      orderId: order.id,
      tableName: order.table?.name,
      tableId: order.table?.id,
      restaurantId: order.restaurantId,
      deletedAt: new Date().toISOString(),
    });
    emitSocket(req, "table-updated", {
      tableName: order.table?.name,
      tableId: order.table?.id,
      restaurantId: order.restaurantId,
      reason: "order-deleted",
    });

    return res.json({ message: "Ordine annullato e conservato nel registro" });
  } catch (error) {
    console.error("deleteOrder error:", error);
    return res.status(500).json({ message: "Errore durante eliminazione ordine" });
  }
};

export const requestPublicBill = async (req, res) => {
  try {
    const { token } = req.params;
    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      include: { table: true, restaurant: true, tableSession: true },
    });
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (["served", "cancelled"].includes(order.status) || order.closedAt) {
      return res.status(400).json({ message: "Ordine già chiuso" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (order.tableSessionId) {
        await tx.tableSession.update({ where: { id: order.tableSessionId }, data: { status: "closing" } });
      }
      return tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "pending" },
        include: { table: true, restaurant: true, tableSession: true },
      });
    });

    const payload = {
      orderId: updated.id,
      publicToken: updated.publicToken,
      tableName: updated.table?.name,
      tableId: updated.table?.id,
      restaurantId: updated.restaurantId,
      restaurantName: updated.restaurant?.name,
      paymentStatus: updated.paymentStatus,
      tableSessionStatus: updated.tableSession?.status || "closing",
      requestedAt: new Date().toISOString(),
    };

    emitSocket(req, "call-bill", payload);
    emitSocket(req, "table-updated", { ...payload, reason: "bill-requested" });
    return res.json({ message: "Richiesta conto inviata", ok: true, order: updated });
  } catch (error) {
    console.error("requestPublicBill error:", error);
    return res.status(500).json({ message: "Errore durante richiesta conto" });
  }
};

export const requestPublicStaff = async (req, res) => {
  try {
    const { token } = req.params;
    const rawReason = String(req.body?.reason || "assistenza").trim();
    const reason = rawReason.slice(0, 160) || "assistenza";

    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      include: { table: true, restaurant: true, tableSession: true },
    });

    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (["served", "cancelled"].includes(order.status) || order.closedAt) {
      return res.status(400).json({ message: "Ordine già chiuso" });
    }

    const payload = {
      orderId: order.id,
      publicToken: order.publicToken,
      tableName: order.table?.name,
      tableId: order.table?.id,
      restaurantId: order.restaurantId,
      restaurantName: order.restaurant?.name,
      tableSessionStatus: order.tableSession?.status || "open",
      reason,
      requestedAt: new Date().toISOString(),
    };

    emitSocket(req, "call-staff", payload);
    emitSocket(req, "table-updated", { ...payload, reason: "staff-requested" });

    return res.json({ message: "Richiesta cameriere inviata", ok: true });
  } catch (error) {
    console.error("requestPublicStaff error:", error);
    return res.status(500).json({ message: "Errore durante richiesta cameriere" });
  }
};
