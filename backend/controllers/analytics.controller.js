import prisma from "../lib/prisma.js";

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function tableIdentity(table) {
  const candidates = [table?.code, table?.name];
  for (const value of candidates) {
    const match = String(value ?? "").trim().match(/^(?:T(?:AVOLO)?\s*)?0*(\d+)$/i);
    if (match) return `number:${Number(match[1])}`;
  }
  return `table:${String(table?.code || table?.name || table?.id || "").trim().toLowerCase()}`;
}

function uniqueOperationalTables(tables, activeTableIds) {
  const byIdentity = new Map();

  for (const table of tables) {
    const identity = tableIdentity(table);
    const current = byIdentity.get(identity);
    const occupied = activeTableIds.has(table.id);

    if (!current || (!activeTableIds.has(current.id) && occupied)) {
      byIdentity.set(identity, table);
    }
  }

  return [...byIdentity.values()];
}

function getRange(query) {
  const now = new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const to = query.to ? new Date(query.to) : now;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

  return { from, to };
}

function statusCounts(orders) {
  const base = {
    pending: 0,
    in_progress: 0,
    ready: 0,
    served: 0,
    cancelled: 0,
  };

  for (const order of orders) {
    base[order.status] = (base[order.status] || 0) + 1;
  }

  return base;
}

function buildHourlyToday(ordersToday) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    orders: 0,
    revenue: 0,
  }));

  for (const order of ordersToday) {
    const h = new Date(order.createdAt).getHours();
    hours[h].orders += 1;

    if (order.paymentStatus === "paid" || order.status === "served") {
      hours[h].revenue += toNumber(order.totalAmount);
    }
  }

  return hours.filter((row) => row.orders > 0 || row.revenue > 0);
}

function buildProductStats(orders) {
  const map = new Map();

  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.status === "voided") continue;
      const key = item.menuItemId || item.nameSnapshot || "prodotto";

      const current = map.get(key) || {
        id: item.menuItemId || key,
        name: item.nameSnapshot || "Prodotto",
        category: item.categorySnapshot || "Senza categoria",
        preparationArea: item.preparationArea || "kitchen",
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

  return [...map.values()].sort(
    (a, b) => b.quantity - a.quantity || b.revenue - a.revenue
  );
}

function percentageChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function averageMinutes(orders, startField, endField) {
  const values = orders
    .map((order) => {
      if (!order[startField] || !order[endField]) return null;
      return (new Date(order[endField]) - new Date(order[startField])) / 60000;
    })
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function averageItemPreparationMinutes(orders, area) {
  const values = orders.flatMap((order) => (order.items || [])
    .filter((item) => item.status !== "voided" && item.preparationArea === area)
    .map((item) => {
      if (!item.preparationStartedAt || !item.preparationReadyAt) return null;
      return (new Date(item.preparationReadyAt) - new Date(item.preparationStartedAt)) / 60000;
    }))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export const getAnalyticsSummary = async (req, res) => {
  try {
    const range = getRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: "Intervallo date non valido",
      });
    }

    const restaurantId = req.user?.restaurantId;
    const privacyMode = Boolean(req.user?.impersonating);

    if (!restaurantId) {
      return res.status(401).json({
        message: "Ristorante non autorizzato",
      });
    }

    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const rangeDuration = Math.max(1, range.to.getTime() - range.from.getTime());
    const previousRange = {
      from: new Date(range.from.getTime() - rangeDuration),
      to: new Date(range.from.getTime() - 1),
    };

    const [
      ordersInRange,
      previousOrders,
      ordersToday,
      activeOrders,
      tables,
      menuItems,
      unavailableItems,
      recentErrors,
      failedPayments,
      staffUsersCount,
      restaurantBilling,
      latestSupportAccess,
    ] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: {
            gte: range.from,
            lte: range.to,
          },
          status: {
            not: "cancelled",
          },
        },
        include: {
          table: true,
          items: true,
          payments: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),

      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: previousRange.from, lte: previousRange.to },
          status: { not: "cancelled" },
        },
        include: { items: true, payments: true },
        orderBy: { createdAt: "asc" },
      }),

      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: {
            gte: todayStart,
            lte: todayEnd,
          },
          status: {
            not: "cancelled",
          },
        },
        include: {
          table: true,
          items: true,
          payments: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),

      prisma.order.findMany({
        where: {
          restaurantId,
          status: {
            in: ["pending", "in_progress", "ready"],
          },
        },
        include: {
          table: true,
          items: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),

      prisma.table.findMany({
        where: {
          restaurantId,
          isActive: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),

      prisma.menuItem.findMany({
        where: {
          restaurantId,
          isDeleted: false,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),

      prisma.menuItem.findMany({
        where: {
          restaurantId,
          isDeleted: false,
          isAvailable: false,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 8,
      }),

      prisma.errorLog.findMany({
        where: {
          restaurantId,
          resolvedAt: null,
          level: { not: "audit" },
          source: { not: "superadmin-support-email" },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
      }),

      prisma.paymentTransaction.findMany({
        where: {
          restaurantId,
          status: {
            in: ["unpaid", "pending"],
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
        include: {
          order: {
            include: {
              table: true,
            },
          },
        },
      }),

      prisma.user.count({
        where: {
          restaurantId,
          role: {
            in: ["admin", "kitchen", "bar", "cashier", "waiter"],
          },
          isActive: true,
        },
      }),

      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include: { subscription: true },
      }),

      prisma.errorLog.findFirst({
        where: {
          restaurantId,
          source: "superadmin-support-access",
          level: "audit",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, metadata: true },
      }),
    ]);

    const completedToday = ordersToday.filter((order) => order.status === "served");
    const completedRange = ordersInRange.filter((order) => order.status === "served");

    const paidToday = ordersToday.filter(
      (order) => order.paymentStatus === "paid" || order.status === "served"
    );

    const paidRange = ordersInRange.filter(
      (order) => order.paymentStatus === "paid" || order.status === "served"
    );
    const previousPaid = previousOrders.filter(
      (order) => order.paymentStatus === "paid" || order.status === "served"
    );

    const revenueToday = paidToday.reduce(
      (sum, order) => sum + toNumber(order.totalAmount),
      0
    );

    const revenueRange = paidRange.reduce(
      (sum, order) => sum + toNumber(order.totalAmount),
      0
    );
    const previousRevenue = previousPaid.reduce(
      (sum, order) => sum + toNumber(order.totalAmount),
      0
    );
    const productTotals = buildProductStats(paidRange);
    const totalCostRange = productTotals.reduce((sum, product) => sum + product.cost, 0);
    const grossMarginRange = revenueRange - totalCostRange;
    const previousProductTotals = buildProductStats(previousPaid);
    const previousCost = previousProductTotals.reduce((sum, product) => sum + product.cost, 0);
    const previousMargin = previousRevenue - previousCost;
    const averagePreparationMinutes = averageMinutes(completedRange, "acceptedAt", "readyAt");
    const averageKitchenMinutes = averageItemPreparationMinutes(ordersInRange, "kitchen");
    const averageBarMinutes = averageItemPreparationMinutes(ordersInRange, "bar");
    const averageServiceMinutes = averageMinutes(completedRange, "createdAt", "servedAt");
    const voidedItemsRange = ordersInRange.reduce(
      (sum, order) => sum + (order.items || []).filter((item) => item.status === "voided").length,
      0
    );
    const complimentaryItemsRange = ordersInRange.reduce(
      (sum, order) => sum + (order.items || []).filter((item) => item.isComplimentary).length,
      0
    );

    const activeTableIds = new Set(
      activeOrders.map((order) => order.tableId).filter(Boolean)
    );
    const operationalTables = uniqueOperationalTables(tables, activeTableIds);

    const activeTables = operationalTables
      .filter((table) => activeTableIds.has(table.id))
      .map((table) => ({
        id: table.id,
        name: table.name,
        code: table.code,
        zone: table.zone,
      }));

    const tableMap = operationalTables.slice(0, 60).map((table) => ({
      id: table.id,
      name: table.name,
      code: table.code,
      zone: table.zone,
      isOccupied: activeTableIds.has(table.id),
    }));

    const byDayMap = new Map();
    const byPaymentMap = new Map();

    for (const order of ordersInRange) {
      const day = order.createdAt.toISOString().slice(0, 10);

      const dayData = byDayMap.get(day) || {
        date: day,
        orders: 0,
        completed: 0,
        revenue: 0,
      };

      dayData.orders += 1;

      if (order.status === "served") {
        dayData.completed += 1;
      }

      if (order.paymentStatus === "paid" || order.status === "served") {
        dayData.revenue += toNumber(order.totalAmount);
      }

      byDayMap.set(day, dayData);

      const paidTransactions = (order.payments || []).filter((payment) => payment.status === "paid");
      if (paidTransactions.length) {
        for (const payment of paidTransactions) {
          const paymentKey = payment.method || (payment.provider === "stripe" ? "online" : "other");
          const paymentData = byPaymentMap.get(paymentKey) || { method: paymentKey, orders: 0, revenue: 0 };
          paymentData.orders += 1;
          paymentData.revenue += toNumber(payment.amount);
          byPaymentMap.set(paymentKey, paymentData);
        }
      } else {
        const paymentKey = order.paymentMethod || "non_indicato";
        const paymentData = byPaymentMap.get(paymentKey) || { method: paymentKey, orders: 0, revenue: 0 };
        paymentData.orders += 1;
        if (order.paymentStatus === "paid" || order.status === "served") {
          paymentData.revenue += toNumber(order.totalAmount);
        }
        byPaymentMap.set(paymentKey, paymentData);
      }
    }

    const topProductsRange = productTotals.slice(0, 10);
    const topProductsToday = buildProductStats(paidToday).slice(0, 10);
    const subscription = restaurantBilling?.subscription || null;
    const subscriptionAlert = subscription && ["past_due", "unpaid", "incomplete"].includes(subscription.status);
    const paymentAlertsCount = failedPayments.length + (subscriptionAlert ? 1 : 0);

    const hideMoney = (value) => (privacyMode ? null : value);
    const hideRevenueRows = (rows = []) => rows.map((row) => ({
      ...row,
      revenue: hideMoney(row.revenue),
      averageTicket: hideMoney(row.averageTicket),
    }));
    const hideProductMoney = (rows = []) => rows.map((row) => ({
      ...row,
      revenue: hideMoney(row.revenue),
      cost: hideMoney(row.cost),
      margin: hideMoney(row.margin),
    }));
    const lowStockItems = menuItems
      .filter((item) => item.trackStock && toNumber(item.stockQuantity) <= toNumber(item.lowStockThreshold))
      .sort((a, b) => toNumber(a.stockQuantity) - toNumber(b.stockQuantity))
      .slice(0, 10);

    return res.json({
      range,
      generatedAt: new Date().toISOString(),
      privacyMode,
      supportAccess: latestSupportAccess
        ? {
            id: latestSupportAccess.id,
            createdAt: latestSupportAccess.createdAt,
            reason: latestSupportAccess.metadata?.supportReason || "Assistenza tecnica",
          }
        : null,

      kpis: {
        revenueToday: hideMoney(revenueToday),
        revenueRange: hideMoney(revenueRange),

        ordersToday: ordersToday.length,
        completedOrdersToday: completedToday.length,

        ordersRange: ordersInRange.length,
        completedOrdersRange: completedRange.length,

        averageTicketToday: hideMoney(paidToday.length ? revenueToday / paidToday.length : 0),
        averageTicketRange: hideMoney(paidRange.length ? revenueRange / paidRange.length : 0),
        grossMarginRange: hideMoney(grossMarginRange),
        foodCostRange: hideMoney(totalCostRange),
        marginRateRange: revenueRange ? (grossMarginRange / revenueRange) * 100 : 0,
        averagePreparationMinutes,
        averageKitchenMinutes,
        averageBarMinutes,
        averageServiceMinutes,
        voidedItems: voidedItemsRange,
        complimentaryItems: complimentaryItemsRange,
        comparison: {
          revenue: percentageChange(revenueRange, previousRevenue),
          orders: percentageChange(paidRange.length, previousPaid.length),
          averageTicket: percentageChange(
            paidRange.length ? revenueRange / paidRange.length : 0,
            previousPaid.length ? previousRevenue / previousPaid.length : 0
          ),
          margin: percentageChange(grossMarginRange, previousMargin),
        },

        openOrders: activeOrders.length,

        activeTables: activeTables.length,
        totalTables: operationalTables.length,
        freeTables: Math.max(0, operationalTables.length - activeTables.length),

        menuItems: menuItems.length,
        unavailableItems: unavailableItems.length,

        unresolvedErrors: recentErrors.length,
        paymentAlerts: paymentAlertsCount,
        lowStockItems: lowStockItems.length,
      },

      live: {
        tables: tableMap,
        activeTables,

        activeOrders: activeOrders.slice(0, 12).map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          table: order.table?.name || order.table?.code || "Tavolo",
          totalAmount: hideMoney(order.totalAmount),
          createdAt: order.createdAt,
          itemsCount: (order.items || []).reduce(
            (sum, item) => sum + toNumber(item.quantity),
            0
          ),
        })),

        statusCounts: statusCounts(ordersToday),
      },

      alerts: {
        unavailableItems: unavailableItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          updatedAt: item.updatedAt,
        })),
        lowStockItems: lowStockItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          stockQuantity: item.stockQuantity,
          lowStockThreshold: item.lowStockThreshold,
          isAvailable: item.isAvailable,
        })),

        recentErrors: recentErrors.map((log) => ({
          id: log.id,
          source: log.source,
          message: log.message,
          createdAt: log.createdAt,
        })),

        paymentAlerts: failedPayments.map((payment) => ({
          id: payment.id,
          status: payment.status,
          amount: hideMoney(payment.amount),
          createdAt: payment.createdAt,
          orderId: payment.orderId,
          table:
            payment.order?.table?.name ||
            payment.order?.table?.code ||
            "Tavolo",
        })),

        subscriptionAlerts: subscriptionAlert ? [{
          id: subscription.id,
          status: subscription.status,
          plan: subscription.plan,
          createdAt: subscription.updatedAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }] : [],
      },

      setup: {
        menuItems: menuItems.length,
        tables: operationalTables.length,
        staffUsers: staffUsersCount,
      },

      charts: {
        byDay: hideRevenueRows([...byDayMap.values()]),
        byHourToday: hideRevenueRows(buildHourlyToday(ordersToday)),
        topProducts: hideProductMoney(topProductsRange),
        topProductsToday: hideProductMoney(topProductsToday),
        byPayment: hideRevenueRows([...byPaymentMap.values()]),
      },
    });
  } catch (error) {
    console.error("getAnalyticsSummary error:", error);

    return res.status(500).json({
      message: "Analytics temporaneamente non disponibili",
    });
  }
};
