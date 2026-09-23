import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { safeEmit } from "../lib/socketSafe.js";
import { getTenantCached } from "../lib/tenantCache.js";

function emitTableUpdate(req, table, reason) {
  safeEmit(
    req.app.get("io"),
    `restaurant:${req.user.restaurantId}`,
    "table-updated",
    {
      restaurantId: req.user.restaurantId,
      tableId: table.id,
      tableName: table.name,
      reason,
    }
  );
}

function parseIntValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function tableCodeFromPayload(payload) {
  const raw = payload.code ?? payload.number ?? payload.name;
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "-").slice(0, 30);
}

function getTableNumber(table) {
  const candidates = [table?.number, table?.code, table?.name];
  for (const candidate of candidates) {
    const match = String(candidate || "").trim().match(/^(?:T(?:AVOLO)?[\s-]*)?0*(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function tableIdentity(table, index = 0) {
  const number = getTableNumber(table);
  if (number !== null) return `number:${number}`;
  const fallback = String(table?.code || table?.name || table?.id || index).trim().toLocaleLowerCase("it");
  return `table:${fallback}`;
}

function deduplicateTables(tables, score = () => 0) {
  const unique = new Map();
  tables.forEach((table, index) => {
    const key = tableIdentity(table, index);
    const current = unique.get(key);
    if (!current || score(table) > score(current)) unique.set(key, table);
  });
  return [...unique.values()].sort((left, right) => {
    const leftNumber = getTableNumber(left);
    const rightNumber = getTableNumber(right);
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return String(left.code || left.name || "").localeCompare(String(right.code || right.name || ""), "it", { numeric: true });
  });
}

async function semanticDuplicate(restaurantId, table, excludedId = "") {
  const incomingNumber = getTableNumber(table);
  if (incomingNumber === null) return null;
  const existingTables = await prisma.table.findMany({
    where: {
      restaurantId,
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true, code: true, name: true, isActive: true },
  });
  return existingTables.find((existing) => getTableNumber(existing) === incomingNumber) || null;
}

function mapOrderStatusToCashierStatus(order, session) {
  if (!order) return "free";
  if (order.paymentStatus === "pending" || session?.status === "closing") return "bill_requested";
  if (order.status === "ready") return "ready";
  if (order.status === "in_progress") return "in_progress";
  if (order.status === "pending") return "pending";
  if (order.status === "served") return "served";
  if (order.status === "cancelled") return "cancelled";
  return "active";
}

function activeOrderTotal(order) {
  if (!order) return 0;
  if (order.totalAmount !== undefined && order.totalAmount !== null) {
    return Math.max(0, Number(order.totalAmount || 0));
  }
  const itemsTotal = (order.items || []).reduce((sum, item) => {
    if (item.status === "voided" || item.isComplimentary) return sum;
    return sum + Number(item.priceSnapshot || 0) * Number(item.quantity || 0);
  }, 0);
  return Math.max(0, itemsTotal + Number(order.extraAmount || 0) - Number(order.discountAmount || 0));
}

export const getPublicTableMenu = async (req, res) => {
  try {
    const { slug, tableToken } = req.params;
    const table = await prisma.table.findFirst({
      where: {
        isActive: true,
        restaurant: { slug, isActive: true },
        OR: [
          { qrToken: tableToken },
          { code: String(tableToken || "").toUpperCase() },
        ],
      },
      include: { restaurant: true },
    });
    if (!table) return res.status(404).json({ message: "Tavolo o ristorante non trovato" });

    const items = await getTenantCached("public-menu", table.restaurantId, () =>
      prisma.menuItem.findMany({
        where: { restaurantId: table.restaurantId, isAvailable: true, isDeleted: false },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      })
    );

    return res.json({
      restaurant: { id: table.restaurant.id, name: table.restaurant.name, slug: table.restaurant.slug, primaryColor: table.restaurant.primaryColor, logoUrl: table.restaurant.logoUrl || null, currency: table.restaurant.currency },
      table: { id: table.id, name: table.name, code: table.code, qrToken: table.qrToken },
      items: items.map((item) => {
        const {
          costPrice: _costPrice,
          trackStock: _trackStock,
          stockQuantity: _stockQuantity,
          lowStockThreshold: _lowStockThreshold,
          ...safeItem
        } = item;
        return safeItem;
      }),
    });
  } catch (error) {
    console.error("getPublicTableMenu error:", error);
    return res.status(500).json({ message: "Errore durante caricamento menu pubblico" });
  }
};

export const getTables = async (req, res) => {
  try {
    const rawTables = await prisma.table.findMany({ where: { restaurantId: req.user.restaurantId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { name: "asc" }] });
    const tables = deduplicateTables(rawTables, (table) => (table.isActive ? 10 : 0));
    return res.json(tables);
  } catch (error) {
    console.error("getTables error:", error);
    return res.status(500).json({ message: "Errore durante recupero tavoli" });
  }
};

export const getTablesStatus = async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId;
    const rawTables = await prisma.table.findMany({
      where: { restaurantId },
      include: {
        sessions: { where: { status: { in: ["open", "closing"] } }, orderBy: { openedAt: "desc" }, take: 1 },
        orders: {
          where: { closedAt: null, status: { notIn: ["cancelled"] } },
          orderBy: { createdAt: "desc" },
          include: {
            items: { include: { menuItem: true } },
            payments: { orderBy: { createdAt: "asc" } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { name: "asc" }],
    });
    const tables = deduplicateTables(rawTables, (table) => (
      (table.orders?.length ? 100 : 0) +
      (table.sessions?.length ? 50 : 0) +
      (table.isActive ? 10 : 0)
    ));

    const mapped = tables.map((table) => {
      const activeSession = table.sessions[0] || null;
      const activeOrder = table.orders[0] || null;
      const totalAmount = activeOrderTotal(activeOrder);
      return {
        id: table.id,
        name: table.name,
        code: table.code,
        number: table.code,
        seats: table.seats,
        zone: table.zone,
        sortOrder: table.sortOrder,
        isActive: table.isActive,
        status: mapOrderStatusToCashierStatus(activeOrder, activeSession),
        activeSession: activeSession ? { id: activeSession.id, status: activeSession.status, openedAt: activeSession.openedAt, guestName: activeSession.guestName, notes: activeSession.notes, totalAmount: activeSession.totalAmount } : null,
        activeOrder: activeOrder ? {
          id: activeOrder.id,
          publicToken: activeOrder.publicToken,
          orderNumber: activeOrder.orderNumber,
          status: activeOrder.status,
          notes: activeOrder.notes,
          createdAt: activeOrder.createdAt,
          updatedAt: activeOrder.updatedAt,
          acceptedAt: activeOrder.acceptedAt,
          readyAt: activeOrder.readyAt,
          servedAt: activeOrder.servedAt,
          closedAt: activeOrder.closedAt,
          tableSessionId: activeOrder.tableSessionId,
          paymentStatus: activeOrder.paymentStatus,
          paymentMethod: activeOrder.paymentMethod,
          billRequested: activeOrder.paymentStatus === "pending" || activeSession?.status === "closing",
          tableSessionStatus: activeSession?.status || null,
          discountAmount: activeOrder.discountAmount,
          discountPercent: activeOrder.discountPercent,
          extraAmount: activeOrder.extraAmount,
          guestCount: activeOrder.guestCount,
          coverCharge: activeOrder.coverCharge,
          coverChargePerGuest: activeOrder.coverChargePerGuest,
          equalSplitEnabled: activeOrder.equalSplitEnabled,
          billConfiguredAt: activeOrder.billConfiguredAt,
          billRevision: activeOrder.billRevision,
          totalAmount,
          payments: activeOrder.payments,
          table: { id: table.id, name: table.name, code: table.code, number: table.code },
          items: activeOrder.items.map((item) => ({
            id: item.id,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            notes: item.notes,
            nameSnapshot: item.nameSnapshot,
            priceSnapshot: item.priceSnapshot,
            categorySnapshot: item.categorySnapshot,
            preparationArea: item.preparationArea || item.menuItem?.preparationArea || null,
            preparationStatus: item.preparationStatus,
            courseNumber: item.courseNumber,
            releasedAt: item.releasedAt,
            preparationStartedAt: item.preparationStartedAt,
            preparationReadyAt: item.preparationReadyAt,
            status: item.status,
            voidReason: item.voidReason,
            isComplimentary: item.isComplimentary,
            complimentaryReason: item.complimentaryReason,
          })),
        } : null,
      };
    });

    return res.json({ totalTables: mapped.length, tables: mapped });
  } catch (error) {
    console.error("getTablesStatus error:", error);
    return res.status(500).json({ message: "Errore durante recupero stato tavoli" });
  }
};

export const createTable = async (req, res) => {
  try {
    const { name, seats, zone, sortOrder } = req.body || {};
    const tableName = String(name || "").trim();
    const code = tableCodeFromPayload(req.body || {});
    if (!tableName) return res.status(400).json({ message: "Nome tavolo obbligatorio" });
    if (!code) return res.status(400).json({ message: "Codice tavolo obbligatorio" });
    const duplicate = await semanticDuplicate(req.user.restaurantId, { code, name: tableName });
    if (duplicate) return res.status(409).json({ message: `Tavolo ${getTableNumber(duplicate)} esiste già` });

    const table = await prisma.table.create({
      data: { restaurantId: req.user.restaurantId, name: tableName, code, qrToken: crypto.randomUUID(), seats: Math.max(1, parseIntValue(seats, 4)), zone: zone ? String(zone).trim() : null, sortOrder: Math.max(0, parseIntValue(sortOrder, 0)), isActive: true },
    });
    emitTableUpdate(req, table, "created");
    return res.status(201).json(table);
  } catch (error) {
    console.error("createTable error:", error);
    if (error?.code === "P2002") return res.status(409).json({ message: "Esiste già un tavolo con questo codice" });
    return res.status(500).json({ message: "Errore durante creazione tavolo" });
  }
};

export const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const current = await prisma.table.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ message: "Tavolo non trovato" });
    if (current.restaurantId !== req.user.restaurantId) return res.status(403).json({ message: "Accesso negato" });

    const data = {};
    if (req.body.name !== undefined) data.name = String(req.body.name || "").trim() || current.name;
    if (req.body.code !== undefined || req.body.number !== undefined) data.code = tableCodeFromPayload(req.body) || current.code;
    if (req.body.seats !== undefined) data.seats = Math.max(1, parseIntValue(req.body.seats, current.seats));
    if (req.body.zone !== undefined) data.zone = String(req.body.zone || "").trim() || null;
    if (req.body.sortOrder !== undefined) data.sortOrder = Math.max(0, parseIntValue(req.body.sortOrder, current.sortOrder));
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.regenerateQrToken) data.qrToken = crypto.randomUUID();
    const nextIdentity = { code: data.code || current.code, name: data.name || current.name };
    const duplicate = await semanticDuplicate(req.user.restaurantId, nextIdentity, id);
    if (duplicate) return res.status(409).json({ message: `Tavolo ${getTableNumber(duplicate)} esiste già` });

    const updated = await prisma.table.update({ where: { id }, data });
    emitTableUpdate(req, updated, "updated");
    return res.json(updated);
  } catch (error) {
    console.error("updateTable error:", error);
    if (error?.code === "P2002") return res.status(409).json({ message: "Esiste già un tavolo con questo codice" });
    return res.status(500).json({ message: "Errore durante aggiornamento tavolo" });
  }
};
