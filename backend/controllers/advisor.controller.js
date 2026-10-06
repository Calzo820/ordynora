import prisma from "../lib/prisma.js";
import { RESTAURANT_MODES } from "../lib/restaurantMode.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";

function isAiEnabled() {
  const configured = process.env.ORDYNORA_AI_ENABLED ?? process.env.EASYMENU_AI_ENABLED;
  return String(configured || "").toLowerCase() === "true";
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getDays(query) {
  const days = Number(query.days || query.periodo || 30);
  if (!Number.isFinite(days)) return 30;
  return Math.min(90, Math.max(7, Math.round(days)));
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildProductStats(orders) {
  const map = new Map();

  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.status === "voided") continue;
      const key = item.menuItemId || item.nameSnapshot || "prodotto";
      const current = map.get(key) || {
        id: key,
        name: item.nameSnapshot || "Prodotto",
        category: item.categorySnapshot || "Menu",
        quantity: 0,
        revenue: 0,
        cost: 0,
        margin: 0,
      };

      current.quantity += toNumber(item.quantity);
      if (!item.isComplimentary) {
        current.revenue += toNumber(item.quantity) * toNumber(item.priceSnapshot);
      }
      current.cost += toNumber(item.quantity) * toNumber(item.costSnapshot);
      current.margin = current.revenue - current.cost;
      map.set(key, current);
    }
  }

  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

function statusCounts(orders) {
  return orders.reduce(
    (acc, order) => {
      acc[order.status] = Number(acc[order.status] || 0) + 1;
      return acc;
    },
    { pending: 0, in_progress: 0, ready: 0 }
  );
}

function makeInsight(priority, title, message, actionLabel, actionHref) {
  return { priority, title, message, actionLabel, actionHref };
}

function buildRuleInsights(facts) {
  const insights = [];

  if (facts.stock.lowStockItems.length > 0) {
    const first = facts.stock.lowStockItems[0];
    insights.push(makeInsight(
      "high",
      `${first.name}: scorta quasi esaurita`,
      `${facts.stock.lowStockItems.length} prodotti hanno raggiunto la soglia minima. Fai il carico o rendili non disponibili prima del servizio.`,
      "Gestisci scorte",
      "/admin"
    ));
  }

  if (facts.service.readyOrders >= 2) {
    insights.push(makeInsight(
      "high",
      "Piatti pronti da portare al tavolo",
      `${facts.service.readyOrders} comande risultano pronte. Riduci l'attesa liberando prima il pass.`,
      "Apri cucina",
      "/cucina"
    ));
  }

  if (facts.service.averagePreparationMinutes > 18) {
    insights.push(makeInsight(
      "medium",
      "Tempi cucina sopra la soglia",
      `La preparazione media è di ${Math.round(facts.service.averagePreparationMinutes)} minuti. Controlla i piatti più lenti e la distribuzione delle comande.`,
      "Vedi statistiche",
      "/statistiche"
    ));
  }

  if (!facts.integratedMode && facts.issues.pendingPayments > 0) {
    insights.push(makeInsight(
      "high",
      "Conti con pagamento incompleto",
      `${facts.issues.pendingPayments} pagamenti risultano ancora in sospeso. Controllali prima della chiusura giornaliera.`,
      "Apri cassa",
      "/cassa"
    ));
  }

  if (!facts.integratedMode && facts.sales.paidOrders > 0 && facts.sales.marginRate !== null && facts.sales.marginRate < 55) {
    insights.push(makeInsight(
      "medium",
      "Margine menu da controllare",
      `Il margine lordo stimato è del ${Math.round(facts.sales.marginRate)}%. Verifica costo e prezzo dei prodotti meno redditizi.`,
      "Rivedi costi",
      "/admin"
    ));
  }

  if (!facts.integratedMode && facts.sales.lowMarginProducts.length > 0) {
    const product = facts.sales.lowMarginProducts[0];
    insights.push(makeInsight(
      "medium",
      `${product.name} rende meno degli altri`,
      `Margine stimato ${Math.round(product.marginRate)}%. Valuta porzione, costo materia prima o prezzo.`,
      "Apri menu",
      "/admin"
    ));
  }

  if (!facts.integratedMode && facts.sales.voidRate > 5) {
    insights.push(makeInsight(
      "medium",
      "Troppi annulli sul conto",
      `Gli articoli annullati sono il ${facts.sales.voidRate.toFixed(1)}% del venduto. Controlla i motivi nel registro cassa.`,
      "Apri cassa",
      "/cassa"
    ));
  }

  if (!facts.integratedMode && facts.sales.paidOrders === 0) {
    insights.push(makeInsight(
      "low",
      "Nessun conto chiuso nel periodo",
      "I consigli economici inizieranno dopo il primo pagamento reale. Nel frattempo puoi controllare scorte e servizio.",
      "Apri cassa",
      "/cassa"
    ));
  } else if (!facts.integratedMode &&
    facts.sales.averageTicket !== null &&
    facts.sales.previousAverageTicket > 0 &&
    facts.sales.averageTicket < facts.sales.previousAverageTicket * 0.9
  ) {
    insights.push(makeInsight(
      "medium",
      "Ticket medio in calo",
      "Il ticket medio è sceso rispetto al periodo precedente. Controlla soprattutto bevande, dessert e prodotti più redditizi.",
      "Vedi statistiche",
      "/statistiche"
    ));
  }

  if (!facts.integratedMode && facts.sales.topProducts.length > 0 && facts.sales.paidOrders > 0) {
    const top = [...facts.sales.topProducts].sort((a, b) => b.margin - a.margin)[0];
    insights.push(makeInsight(
      "low",
      `${top.name} sostiene il margine`,
      "È tra i prodotti che generano più margine nel periodo. Verifica che sia disponibile nei turni più importanti.",
      "Controlla scorte",
      "/admin"
    ));
  }

  if (facts.service.reservationsNext7Days > 0) {
    insights.push(makeInsight(
      "low",
      "Usa le prenotazioni per preparare la sala",
      `Hai ${facts.service.reservationsNext7Days} prenotazioni nei prossimi 7 giorni. Collegale ai tavoli prima del servizio.`,
      "Apri tavoli",
      "/tavoli"
    ));
  }

  if (insights.length === 0) {
    insights.push(makeInsight(
      "low",
      "Servizio sotto controllo",
      "Non emergono criticità dai dati del periodo. Continua a registrare costi e scorte per rendere i consigli più precisi.",
      "Vedi statistiche",
      "/statistiche"
    ));
  }

  return insights.slice(0, 5);
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  return (data?.output || [])
    .flatMap((entry) => entry.content || [])
    .map((content) => content.text || content.output_text || "")
    .join("\n")
    .trim();
}

function parseJsonText(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function normalizeAiInsights(value) {
  const rows = Array.isArray(value?.insights) ? value.insights : [];
  return rows
    .map((row) => ({
      priority: ["high", "medium", "low"].includes(row.priority) ? row.priority : "medium",
      title: String(row.title || "").slice(0, 80),
      message: String(row.message || "").slice(0, 240),
      actionLabel: String(row.actionLabel || "Apri").slice(0, 32),
      actionHref: String(row.actionHref || "/dashboard").startsWith("/")
        ? String(row.actionHref || "/dashboard")
        : "/dashboard",
    }))
    .filter((row) => row.title && row.message)
    .slice(0, 5);
}

async function buildAiInsights(facts) {
  const enabled = isAiEnabled();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!enabled || !apiKey || facts.privacyMode) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content:
            "Sei il consulente operativo di Ordynora per ristoranti. Usa solo dati aggregati. Dai consigli brevi, pratici e non invasivi. Non citare dati personali.",
        },
        {
          role: "user",
          content:
            `Dati aggregati ristorante:\n${JSON.stringify(facts, null, 2)}\n\n` +
            "Rispondi solo con JSON valido nel formato: {\"summary\":\"...\",\"insights\":[{\"priority\":\"high|medium|low\",\"title\":\"...\",\"message\":\"...\",\"actionLabel\":\"...\",\"actionHref\":\"/...\"}]}",
        },
      ],
      max_output_tokens: 900,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI advisor non disponibile (${response.status})`);
  }

  const data = await response.json();
  const parsed = parseJsonText(extractOutputText(data));
  const insights = normalizeAiInsights(parsed);

  if (!insights.length) return null;

  return {
    summary: String(parsed.summary || "Consigli aggiornati sul servizio.").slice(0, 180),
    insights,
  };
}

export const getAnalyticsAdvisor = async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId;
    const privacyMode = Boolean(req.user?.impersonating);

    if (!restaurantId) {
      return res.status(401).json({ message: "Ristorante non autorizzato" });
    }

    const days = getDays(req.query);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const previousFrom = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
    const today = startOfToday();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      restaurant,
      orders,
      previousOrders,
      activeOrders,
      menuItems,
      tablesCount,
      staffUsersCount,
      reservations,
      pendingPayments,
      unresolvedErrors,
    ] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include: { subscription: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: from },
          status: { not: "cancelled" },
        },
        include: { items: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: previousFrom, lt: from },
          status: { not: "cancelled" },
        },
        include: { items: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          status: { in: ["pending", "in_progress", "ready"] },
        },
        select: { id: true, status: true },
      }),
      prisma.menuItem.findMany({
        where: { restaurantId, isDeleted: false },
        select: {
          id: true,
          name: true,
          category: true,
          isAvailable: true,
          isFeatured: true,
          preparationArea: true,
          price: true,
          costPrice: true,
          trackStock: true,
          stockQuantity: true,
          lowStockThreshold: true,
        },
      }),
      prisma.table.count({
        where: { restaurantId, isActive: true },
      }),
      prisma.user.count({
        where: {
          restaurantId,
          isActive: true,
          role: { in: ["admin", "kitchen", "bar", "cashier", "waiter"] },
        },
      }),
      prisma.reservation.findMany({
        where: {
          restaurantId,
          date: { gte: today, lte: nextWeek },
          status: { in: ["booked", "seated"] },
        },
        select: { id: true, status: true },
      }),
      prisma.paymentTransaction.count({
        where: {
          restaurantId,
          status: { in: ["unpaid", "pending"] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.errorLog.count({
        where: { restaurantId, resolvedAt: null },
      }),
    ]);

    const paidOrders = orders.filter((order) => order.paymentStatus === "paid" || order.status === "served");
    const revenue = paidOrders.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
    const previousPaidOrders = previousOrders.filter((order) => order.paymentStatus === "paid" || order.status === "served");
    const previousRevenue = previousPaidOrders.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
    const activeCounts = statusCounts(activeOrders);
    const categories = new Set(menuItems.map((item) => item.category).filter(Boolean));
    const unavailableItems = menuItems.filter((item) => !item.isAvailable);
    const allProductStats = buildProductStats(paidOrders);
    const topProducts = allProductStats.slice(0, 5);
    const totalCost = allProductStats.reduce((sum, product) => sum + product.cost, 0);
    const grossMargin = revenue - totalCost;
    const lowMarginProducts = allProductStats
      .map((product) => ({
        ...product,
        marginRate: product.revenue ? (product.margin / product.revenue) * 100 : 0,
      }))
      .filter((product) => product.revenue > 0 && product.marginRate < 55)
      .sort((a, b) => a.marginRate - b.marginRate)
      .slice(0, 5);
    const activeItems = orders.flatMap((order) => order.items || []);
    const soldItems = activeItems.filter((item) => item.status !== "voided");
    const voidedItems = activeItems.filter((item) => item.status === "voided");
    const preparationTimes = paidOrders
      .filter((order) => order.acceptedAt && order.readyAt)
      .map((order) => (new Date(order.readyAt) - new Date(order.acceptedAt)) / 60000)
      .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);
    const lowStockItems = menuItems
      .filter((item) => item.trackStock && toNumber(item.stockQuantity) <= toNumber(item.lowStockThreshold))
      .sort((a, b) => toNumber(a.stockQuantity) - toNumber(b.stockQuantity))
      .slice(0, 8);
    const subscription = restaurant?.subscription || null;

    const integratedMode = restaurant?.operationMode === RESTAURANT_MODES.INTEGRATED;
    const facts = {
      privacyMode,
      integratedMode,
      operationMode: restaurant?.operationMode || "full",
      setup: {
        logoLoaded: Boolean(restaurant?.logoUrl),
        tables: tablesCount,
        menuItems: menuItems.length,
        availableMenuItems: menuItems.length - unavailableItems.length,
        categories: categories.size,
        unavailableItems: unavailableItems.length,
        featuredItems: menuItems.filter((item) => item.isFeatured).length,
        staffUsers: staffUsersCount,
      },
      service: {
        openOrders: activeOrders.length,
        pendingOrders: activeCounts.pending || 0,
        inProgressOrders: activeCounts.in_progress || 0,
        readyOrders: activeCounts.ready || 0,
        reservationsNext7Days: reservations.length,
        seatedReservations: reservations.filter((reservation) => reservation.status === "seated").length,
        averagePreparationMinutes: preparationTimes.length
          ? preparationTimes.reduce((sum, minutes) => sum + minutes, 0) / preparationTimes.length
          : 0,
      },
      sales: {
        periodDays: days,
        orders: orders.length,
        paidOrders: paidOrders.length,
        revenue: privacyMode || integratedMode ? null : Number(revenue.toFixed(2)),
        averageTicket: privacyMode || integratedMode || paidOrders.length === 0 ? null : Number((revenue / paidOrders.length).toFixed(2)),
        previousAverageTicket: privacyMode || integratedMode || previousPaidOrders.length === 0
          ? 0
          : Number((previousRevenue / previousPaidOrders.length).toFixed(2)),
        grossMargin: privacyMode || integratedMode ? null : Number(grossMargin.toFixed(2)),
        marginRate: privacyMode || integratedMode || revenue === 0 ? null : Number(((grossMargin / revenue) * 100).toFixed(2)),
        voidRate: soldItems.length + voidedItems.length
          ? (voidedItems.length / (soldItems.length + voidedItems.length)) * 100
          : 0,
        lowMarginProducts: privacyMode || integratedMode ? [] : lowMarginProducts.map((product) => ({
          name: product.name,
          marginRate: product.marginRate,
        })),
        topProducts: topProducts.map((product) => ({
          name: product.name,
          category: product.category,
          quantity: product.quantity,
          margin: privacyMode || integratedMode ? 0 : Number(product.margin.toFixed(2)),
        })),
      },
      stock: {
        lowStockItems: lowStockItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: toNumber(item.stockQuantity),
          threshold: toNumber(item.lowStockThreshold),
        })),
      },
      billing: {
        restaurantActive: Boolean(restaurant?.isActive),
        plan: restaurant?.plan || null,
        subscriptionStatus: subscription?.status || null,
        cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      },
      issues: {
        pendingPayments: integratedMode ? 0 : pendingPayments,
        unresolvedErrors,
      },
    };

    const ruleInsights = buildRuleInsights(facts);
    let aiResult = null;

    try {
      aiResult = await buildAiInsights(facts);
    } catch (error) {
      console.warn("Ordynora advisor fallback:", error.message);
    }

    return res.json({
      generatedAt: new Date().toISOString(),
      source: aiResult ? "openai" : "rules",
      aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      aiEnabled: isAiEnabled(),
      privacyMode,
      operationMode: restaurant?.operationMode || "full",
      summary: aiResult?.summary || "Consigli operativi generati dai dati del ristorante.",
      insights: aiResult?.insights || ruleInsights,
      facts,
    });
  } catch (error) {
    console.error("getAnalyticsAdvisor error:", error);
    return res.status(500).json({ message: "Consulente Ordynora temporaneamente non disponibile" });
  }
};
