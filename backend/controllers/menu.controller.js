import prisma from "../lib/prisma.js";
import { billingBlockPayload, resolveBillingState } from "../lib/billingPolicy.js";
import { writeAudit } from "../lib/audit.js";
import { safeEmit } from "../lib/socketSafe.js";
import { getTenantCached, invalidateTenantCache } from "../lib/tenantCache.js";

const VALID_AREAS = ["kitchen", "bar"];

function emitMenuUpdate(req, itemId, reason) {
  invalidateTenantCache(req.user.restaurantId, "public-menu");
  safeEmit(
    req.app.get("io"),
    `restaurant:${req.user.restaurantId}`,
    "menu-updated",
    { restaurantId: req.user.restaurantId, itemId, reason }
  );
}

function normalizeAllergens(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return [...new Set(input.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  return [...new Set(String(input).split(",").map((item) => item.trim()).filter(Boolean))];
}

function buildMenuItemData(payload) {
  const data = {};

  if (payload.name !== undefined) {
    const name = String(payload.name || "").trim();
    if (!name) throw new Error("Il nome prodotto non può essere vuoto");
    data.name = name;
  }

  if (payload.description !== undefined) {
    data.description = String(payload.description || "").trim() || null;
  }

  if (payload.shortDescription !== undefined) {
    data.shortDescription = String(payload.shortDescription || "").trim() || null;
  }

  if (payload.price !== undefined) {
    const parsedPrice = Number(payload.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new Error("Il prezzo deve essere un numero maggiore di zero");
    }
    data.price = parsedPrice;
  }

  if (payload.costPrice !== undefined) {
    const costPrice = Number(payload.costPrice);
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      throw new Error("Il costo materia prima non può essere negativo");
    }
    data.costPrice = costPrice;
  }

  if (payload.category !== undefined) {
    data.category = String(payload.category || "").trim() || null;
  }

  if (payload.imageUrl !== undefined) {
    data.imageUrl = String(payload.imageUrl || "").trim() || null;
  }

  if (payload.sku !== undefined) {
    data.sku = String(payload.sku || "").trim() || null;
  }

  if (payload.vatRate !== undefined) {
    const vatRate = Number(payload.vatRate);
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      throw new Error("IVA non valida");
    }
    data.vatRate = vatRate;
  }

  if (payload.sortOrder !== undefined) {
    const sortOrder = Number(payload.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error("Ordinamento non valido");
    }
    data.sortOrder = sortOrder;
  }

  if (payload.preparationArea !== undefined) {
    if (!VALID_AREAS.includes(payload.preparationArea)) {
      throw new Error("preparationArea deve essere 'kitchen' oppure 'bar'");
    }
    data.preparationArea = payload.preparationArea;
  }

  if (payload.allergens !== undefined) {
    data.allergens = normalizeAllergens(payload.allergens);
  }

  if (payload.isAvailable !== undefined) {
    data.isAvailable = Boolean(payload.isAvailable);
  }

  if (payload.isFeatured !== undefined) {
    data.isFeatured = Boolean(payload.isFeatured);
  }

  if (payload.trackStock !== undefined) {
    data.trackStock = Boolean(payload.trackStock);
  }

  if (payload.stockQuantity !== undefined) {
    const stockQuantity = Number(payload.stockQuantity);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      throw new Error("La quantità disponibile non può essere negativa");
    }
    data.stockQuantity = stockQuantity;
  }

  if (payload.lowStockThreshold !== undefined) {
    const threshold = Number(payload.lowStockThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error("La soglia scorte non può essere negativa");
    }
    data.lowStockThreshold = threshold;
  }

  return data;
}

function publicMenuItem(item) {
  const {
    costPrice: _costPrice,
    trackStock: _trackStock,
    stockQuantity: _stockQuantity,
    lowStockThreshold: _lowStockThreshold,
    ...safeItem
  } = item;
  return safeItem;
}

export const getMenuItems = async (req, res) => {
  try {
    const items = await prisma.menuItem.findMany({
      where: {
        restaurantId: req.user.restaurantId,
        isDeleted: false,
      },
      orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { createdAt: "desc" }],
    });

    return res.json(items);
  } catch (error) {
    console.error("getMenuItems error:", error);
    return res.status(500).json({ message: "Errore server nel recupero del menu" });
  }
};

export const createMenuItem = async (req, res) => {
  try {
    const data = buildMenuItemData(req.body);

    if (!data.name || data.price === undefined || !data.preparationArea) {
      return res.status(400).json({ message: "name, price e preparationArea sono obbligatori" });
    }

    if (data.trackStock && Number(data.stockQuantity || 0) <= 0) data.isAvailable = false;

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          restaurantId: req.user.restaurantId,
          ...data,
        },
      });
      if (created.trackStock && Number(created.stockQuantity) !== 0) {
        await tx.stockMovement.create({
          data: {
            restaurantId: req.user.restaurantId,
            menuItemId: created.id,
            userId: req.user?.userId || null,
            type: "restock",
            quantityBefore: 0,
            quantityChange: created.stockQuantity,
            quantityAfter: created.stockQuantity,
            reason: "Scorta iniziale",
          },
        });
      }
      await writeAudit(tx, req, {
        action: "menu_item.created",
        entityType: "menu_item",
        entityId: created.id,
        metadata: { name: created.name, price: Number(created.price) },
      });
      return created;
    });

    emitMenuUpdate(req, item.id, "created");
    return res.status(201).json({ message: "Prodotto creato", item });
  } catch (error) {
    console.error("createMenuItem error:", error);
    return res.status(400).json({ message: error.message || "Errore nella creazione del prodotto" });
  }
};

export const importMenuItems = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rows.length) return res.status(400).json({ message: "Nessun prodotto da importare" });
    if (rows.length > 500) return res.status(413).json({ message: "Massimo 500 prodotti per importazione" });

    const normalizedRows = rows.map((row, index) => {
      try {
        const data = buildMenuItemData(row || {});
        if (!data.name || data.price === undefined) throw new Error("nome e prezzo sono obbligatori");
        if (!data.preparationArea) data.preparationArea = "kitchen";
        if (!data.category) data.category = "Menu";
        return data;
      } catch (error) {
        const validationError = new Error(`Riga ${index + 2}: ${error.message}`);
        validationError.code = "IMPORT_VALIDATION";
        throw validationError;
      }
    });

    const uniqueRows = new Map();
    normalizedRows.forEach((row) => {
      uniqueRows.set(`${row.name.toLocaleLowerCase("it")}::${String(row.category || "").toLocaleLowerCase("it")}`, row);
    });

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.menuItem.findMany({
        where: { restaurantId: req.user.restaurantId, isDeleted: false },
        select: { id: true, name: true, category: true },
      });
      const existingByKey = new Map(existing.map((item) => [
        `${item.name.toLocaleLowerCase("it")}::${String(item.category || "").toLocaleLowerCase("it")}`,
        item,
      ]));
      let created = 0;
      let updated = 0;
      for (const [key, data] of uniqueRows) {
        const current = existingByKey.get(key);
        if (current) {
          await tx.menuItem.update({ where: { id: current.id }, data });
          updated += 1;
        } else {
          await tx.menuItem.create({ data: { restaurantId: req.user.restaurantId, ...data } });
          created += 1;
        }
      }
      await writeAudit(tx, req, {
        action: "menu.imported",
        entityType: "menu",
        metadata: { received: rows.length, unique: uniqueRows.size, created, updated },
      });
      return { created, updated, total: uniqueRows.size };
    }, { timeout: 20000 });

    emitMenuUpdate(req, null, "imported");
    return res.json({ message: `${result.total} prodotti importati`, ...result });
  } catch (error) {
    console.error("importMenuItems error:", error);
    const status = error?.code === "IMPORT_VALIDATION" ? 400 : 500;
    return res.status(status).json({ message: error.message || "Importazione menu non riuscita" });
  }
};

export const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;

    const existingItem = await prisma.menuItem.findFirst({
      where: { id, restaurantId: req.user.restaurantId, isDeleted: false },
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Prodotto non trovato" });
    }

    const data = buildMenuItemData(req.body);
    const nextTrackStock = data.trackStock ?? existingItem.trackStock;
    const nextStock = data.stockQuantity ?? Number(existingItem.stockQuantity);
    if (nextTrackStock && Number(nextStock) <= 0) data.isAvailable = false;

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({ where: { id }, data });
      const before = Number(existingItem.stockQuantity);
      const after = Number(updated.stockQuantity);
      if (updated.trackStock && before !== after) {
        await tx.stockMovement.create({
          data: {
            restaurantId: req.user.restaurantId,
            menuItemId: id,
            userId: req.user?.userId || null,
            type: after > before ? "restock" : "adjustment",
            quantityBefore: before,
            quantityChange: after - before,
            quantityAfter: after,
            reason: String(req.body?.stockReason || "Aggiornamento dal menu").slice(0, 300),
          },
        });
      }
      await writeAudit(tx, req, {
        action: "menu_item.updated",
        entityType: "menu_item",
        entityId: id,
        metadata: { changedFields: Object.keys(data) },
      });
      return updated;
    });

    emitMenuUpdate(req, item.id, "updated");
    return res.json({ message: "Prodotto aggiornato", item });
  } catch (error) {
    console.error("updateMenuItem error:", error);
    return res.status(400).json({ message: error.message || "Errore nell'aggiornamento del prodotto" });
  }
};

export const updateMenuStock = async (req, res) => {
  try {
    const { id } = req.params;
    const mode = String(req.body?.mode || "set").trim().toLowerCase();
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!["set", "add", "waste"].includes(mode) || !Number.isFinite(quantity) || quantity < 0) {
      return res.status(400).json({ message: "Movimento scorte non valido" });
    }

    const existing = await prisma.menuItem.findFirst({
      where: { id, restaurantId: req.user.restaurantId, isDeleted: false },
    });
    if (!existing) return res.status(404).json({ message: "Prodotto non trovato" });
    if (!existing.trackStock) return res.status(400).json({ message: "Attiva prima il controllo scorte per questo prodotto" });

    const before = Number(existing.stockQuantity);
    const after = mode === "set"
      ? quantity
      : mode === "add"
        ? before + quantity
        : Math.max(0, before - quantity);
    const change = after - before;

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({
        where: { id },
        data: {
          stockQuantity: after,
          isAvailable: after <= 0 ? false : existing.isAvailable,
        },
      });
      await tx.stockMovement.create({
        data: {
          restaurantId: req.user.restaurantId,
          menuItemId: id,
          userId: req.user?.userId || null,
          type: mode === "add" ? "restock" : mode === "waste" ? "waste" : "adjustment",
          quantityBefore: before,
          quantityChange: change,
          quantityAfter: after,
          reason: reason || (mode === "add" ? "Carico scorte" : mode === "waste" ? "Scarico o spreco" : "Rettifica inventario"),
        },
      });
      await writeAudit(tx, req, {
        action: "menu_item.stock_updated",
        entityType: "menu_item",
        entityId: id,
        reason,
        metadata: { mode, before, change, after },
      });
      return updated;
    });

    emitMenuUpdate(req, item.id, "stock-updated");
    return res.json({ message: "Scorte aggiornate", item });
  } catch (error) {
    console.error("updateMenuStock error:", error);
    return res.status(500).json({ message: "Errore durante l'aggiornamento delle scorte" });
  }
};

export const getMenuStockHistory = async (req, res) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId, isDeleted: false },
      select: { id: true },
    });
    if (!item) return res.status(404).json({ message: "Prodotto non trovato" });
    const movements = await prisma.stockMovement.findMany({
      where: { menuItemId: item.id, restaurantId: req.user.restaurantId },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(movements);
  } catch (error) {
    console.error("getMenuStockHistory error:", error);
    return res.status(500).json({ message: "Storico scorte non disponibile" });
  }
};

export const deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;

    const existingItem = await prisma.menuItem.findFirst({
      where: { id, restaurantId: req.user.restaurantId, isDeleted: false },
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Prodotto non trovato" });
    }

    await prisma.menuItem.update({
      where: { id },
      data: { isDeleted: true, isAvailable: false },
    });

    emitMenuUpdate(req, req.params.id, "deleted");
    return res.json({ message: "Prodotto eliminato" });
  } catch (error) {
    console.error("deleteMenuItem error:", error);
    return res.status(500).json({ message: "Errore server nell'eliminazione del prodotto" });
  }
};

export const getPublicMenu = async (req, res) => {
  try {
    const { slug } = req.params;

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, include: { subscription: true } });
    if (!restaurant || !restaurant.isActive) {
      return res.status(404).json({ message: "Ristorante non trovato" });
    }

    const billing = resolveBillingState(restaurant.subscription, restaurant);
    if (!billing.allowed) return res.status(402).json(billingBlockPayload(billing));

    const items = await getTenantCached("public-menu", restaurant.id, () =>
      prisma.menuItem.findMany({
        where: {
          restaurantId: restaurant.id,
          isAvailable: true,
          isDeleted: false,
        },
        orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { name: "asc" }],
      })
    );

    return res.json({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        primaryColor: restaurant.primaryColor,
        logoUrl: restaurant.logoUrl,
        currency: restaurant.currency,
      },
      items: items.map(publicMenuItem),
    });
  } catch (error) {
    console.error("getPublicMenu error:", error);
    return res.status(500).json({ message: "Errore server nel recupero del menu pubblico" });
  }
};
