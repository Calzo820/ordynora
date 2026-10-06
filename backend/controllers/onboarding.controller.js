import crypto from "node:crypto";
import prisma from "../lib/prisma.js";

const DEMO_MENU = [
  { name: "Margherita", description: "Pomodoro, mozzarella, basilico fresco", price: 7.5, category: "Pizze", preparationArea: "kitchen", allergens: ["glutine", "latte"], sortOrder: 10 },
  { name: "Diavola", description: "Pomodoro, mozzarella, salame piccante", price: 9, category: "Pizze", preparationArea: "kitchen", allergens: ["glutine", "latte"], sortOrder: 20 },
  { name: "Tagliatelle al ragù", description: "Pasta fresca con ragù della casa", price: 12, category: "Primi", preparationArea: "kitchen", allergens: ["glutine", "uova"], sortOrder: 30 },
  { name: "Spaghetti alle vongole", description: "Vongole, aglio, olio, prezzemolo", price: 14, category: "Primi", preparationArea: "kitchen", allergens: ["glutine", "molluschi"], sortOrder: 40 },
  { name: "Cotoletta con patate", description: "Secondo completo per servizio veloce", price: 13, category: "Secondi", preparationArea: "kitchen", allergens: ["glutine", "uova"], sortOrder: 50 },
  { name: "Insalatona vegetariana", description: "Verdure fresche, feta, olive", price: 10, category: "Insalate", preparationArea: "kitchen", allergens: ["latte"], sortOrder: 60 },
  { name: "Tiramisù", description: "Dolce classico della casa", price: 5.5, category: "Dolci", preparationArea: "kitchen", allergens: ["glutine", "latte", "uova"], sortOrder: 70 },
  { name: "Acqua naturale 0,75", description: "Bottiglia vetro", price: 2.5, category: "Bevande", preparationArea: "bar", sortOrder: 80 },
  { name: "Coca-Cola", description: "Lattina 33cl", price: 3, category: "Bevande", preparationArea: "bar", sortOrder: 90 },
  { name: "Birra alla spina media", description: "0,4L", price: 5, category: "Birre", preparationArea: "bar", allergens: ["glutine"], sortOrder: 100 },
  { name: "Spritz", description: "Aperitivo pronto per servizio bar", price: 6, category: "Cocktail", preparationArea: "bar", sortOrder: 110 },
  { name: "Caffè espresso", description: "Servizio banco/tavolo", price: 1.5, category: "Caffetteria", preparationArea: "bar", sortOrder: 120 },
];

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-_]/g, "").slice(0, 30);
}

function getTableNumber(table) {
  const candidates = [table?.code, table?.name];
  for (const value of candidates) {
    const match = String(value ?? "").trim().match(/^(?:T(?:AVOLO)?\s*)?0*(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function parsePositiveInt(value, fallback, max = 300) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

async function buildStatus(restaurantId) {
  const [restaurant, tablesCount, activeTablesCount, menuCount, staffCount] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, include: { subscription: true } }),
    prisma.table.count({ where: { restaurantId } }),
    prisma.table.count({ where: { restaurantId, isActive: true } }),
    prisma.menuItem.count({ where: { restaurantId, isDeleted: false } }),
    prisma.user.count({ where: { restaurantId, role: { in: ["kitchen", "bar", "cashier", "waiter"] }, isActive: true } }),
  ]);
  const settings = restaurant?.settingsJson && typeof restaurant.settingsJson === "object" ? restaurant.settingsJson : {};
  const onboarding = settings.onboarding || {};
  const subscriptionStatus = restaurant?.subscription?.status || "incomplete";
  const checks = {
    profile: Boolean(restaurant?.name && restaurant?.slug && restaurant?.logoUrl),
    tables: activeTablesCount > 0,
    menu: menuCount > 0,
    staff: staffCount > 0,
    qr: activeTablesCount > 0,
    billing: ["trialing", "active"].includes(subscriptionStatus) && Boolean(restaurant?.isActive),
  };
  const completedCount = Object.values(checks).filter(Boolean).length;
  return {
    restaurant: restaurant ? { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, primaryColor: restaurant.primaryColor, logoUrl: restaurant.logoUrl || "", currency: restaurant.currency, operationMode: restaurant.operationMode || "full", settingsJson: restaurant.settingsJson, isActive: restaurant.isActive, subscriptionStatus } : null,
    counts: { tables: tablesCount, activeTables: activeTablesCount, menuItems: menuCount, staff: staffCount },
    checks,
    progress: Math.round((completedCount / Object.keys(checks).length) * 100),
    completed: completedCount === Object.keys(checks).length,
    onboarding,
  };
}

async function updateOnboardingSettings(restaurantId, patch) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  const settings = restaurant?.settingsJson && typeof restaurant.settingsJson === "object" ? restaurant.settingsJson : {};
  const onboarding = { ...(settings.onboarding || {}), ...patch, updatedAt: new Date().toISOString() };
  return prisma.restaurant.update({ where: { id: restaurantId }, data: { settingsJson: { ...settings, onboarding } } });
}

export const getOnboardingStatus = async (req, res) => {
  try {
    return res.json(await buildStatus(req.user.restaurantId));
  } catch (error) {
    console.error("getOnboardingStatus error:", error);
    return res.status(500).json({ message: "Errore recupero onboarding" });
  }
};

export const autoSetupRestaurant = async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId;
    const tablesCount = parsePositiveInt(req.body?.tablesCount, 20, 200);
    const seats = parsePositiveInt(req.body?.seats, 4, 20);
    const zoneMode = req.body?.zoneMode || "sala";
    const overwriteEmptyOnly = req.body?.overwriteEmptyOnly !== false;
    const createDemoMenu = req.body?.createDemoMenu !== false;

    const result = await prisma.$transaction(async (tx) => {
      const existingTables = await tx.table.findMany({
        where: { restaurantId },
        select: { id: true, name: true, code: true, isActive: true },
      });
      const existingByCode = new Map(existingTables.map((table) => [normalizeCode(table.code), table]));
      const existingByNumber = new Map();
      existingTables.forEach((table) => {
        const number = getTableNumber(table);
        const current = number === null ? null : existingByNumber.get(number);
        if (number !== null && (!current || (!current.isActive && table.isActive))) {
          existingByNumber.set(number, table);
        }
      });
      const tablesToCreate = [];
      let tablesReactivated = 0;

      for (let i = 1; i <= tablesCount; i += 1) {
        const code = normalizeCode(`T${i}`);
        const existing = existingByNumber.get(i) || existingByCode.get(code);
        const zone = zoneMode === "zones" ? (i <= Math.ceil(tablesCount / 2) ? "Sala" : "Dehors") : null;

        if (existing) {
          if (!existing.isActive) {
            await tx.table.update({
              where: { id: existing.id },
              data: {
                name: `Tavolo ${i}`,
                seats,
                zone,
                sortOrder: i,
                isActive: true,
                qrToken: crypto.randomUUID(),
              },
            });
            tablesReactivated += 1;
          }
          continue;
        }

        tablesToCreate.push({ restaurantId, name: `Tavolo ${i}`, code, qrToken: crypto.randomUUID(), seats, zone, sortOrder: i, isActive: true });
      }

      if (tablesToCreate.length) await tx.table.createMany({ data: tablesToCreate, skipDuplicates: true });

      const currentMenuCount = await tx.menuItem.count({ where: { restaurantId, isDeleted: false } });
      let demoMenuCreated = 0;
      if (createDemoMenu && (!overwriteEmptyOnly || currentMenuCount === 0)) {
        const existingNames = await tx.menuItem.findMany({ where: { restaurantId, isDeleted: false }, select: { name: true } });
        const names = new Set(existingNames.map((item) => item.name.toLowerCase()));
        const items = DEMO_MENU.filter((item) => !names.has(item.name.toLowerCase())).map((item) => ({ restaurantId, ...item }));
        if (items.length) {
          await tx.menuItem.createMany({ data: items });
          demoMenuCreated = items.length;
        }
      }
      const activeTablesAfter = await tx.table.count({ where: { restaurantId, isActive: true } });
      return { tablesCreated: tablesToCreate.length, tablesReactivated, activeTablesAfter, demoMenuCreated };
    });

    await updateOnboardingSettings(restaurantId, { autoSetupCompleted: true, autoSetupAt: new Date().toISOString(), tablesRequested: tablesCount });
    return res.json({ message: "Setup automatico completato", ...result, status: await buildStatus(restaurantId) });
  } catch (error) {
    console.error("autoSetupRestaurant error:", error);
    return res.status(500).json({ message: "Errore setup automatico" });
  }
};

export const markOnboardingStep = async (req, res) => {
  try {
    const allowed = new Set(["reviewed", "qrPrinted", "menuChecked", "staffReady"]);
    const step = String(req.body?.step || "");
    if (!allowed.has(step)) return res.status(400).json({ message: "Step onboarding non valido" });
    await updateOnboardingSettings(req.user.restaurantId, { [step]: Boolean(req.body?.value ?? true) });
    return res.json(await buildStatus(req.user.restaurantId));
  } catch (error) {
    console.error("markOnboardingStep error:", error);
    return res.status(500).json({ message: "Errore salvataggio step onboarding" });
  }
};

export const getQrPayload = async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
    const tables = await prisma.table.findMany({ where: { restaurantId: req.user.restaurantId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
    return res.json({ restaurant: { name: restaurant.name, slug: restaurant.slug, primaryColor: restaurant.primaryColor, logoUrl: restaurant.logoUrl || "" }, tables: tables.map((table) => ({ id: table.id, name: table.name, code: table.code, qrToken: table.qrToken, seats: table.seats, zone: table.zone })) });
  } catch (error) {
    console.error("getQrPayload error:", error);
    return res.status(500).json({ message: "Errore recupero QR" });
  }
};
