function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round(number(value) * 100) / 100;
}

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderRank(status) {
  return {
    cancelled: -1,
    served: 0,
    ready: 1,
    in_progress: 2,
    pending: 3,
  }[status] ?? 2;
}

function tableSessionStatus(orders) {
  if (!orders.length) return "cancelled";
  return [...orders].sort((left, right) => orderRank(right.status) - orderRank(left.status))[0].status;
}

function latest(values, selector) {
  return [...values].sort((left, right) => timestamp(selector(right)) - timestamp(selector(left)))[0] || null;
}

/**
 * Build the single commercial/operational view of a table session while
 * preserving the individual kitchen tickets in the database.
 */
export function buildTableSessionOrder(session, {
  preferredOrderId = null,
  externalIdentity = false,
} = {}) {
  const sourceOrders = Array.isArray(session?.orders) ? session.orders : [];
  const orders = sourceOrders
    .filter((order) => order?.status !== "cancelled")
    .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt));
  const preferred = orders.find((order) => order.id === preferredOrderId) || orders.at(-1) || sourceOrders.at(-1) || null;
  const configured = latest(orders.filter((order) => order.billConfiguredAt), (order) => order.billConfiguredAt)
    || preferred
    || orders[0]
    || {};
  const coverSource = latest(orders.filter((order) => number(order.coverCharge) > 0), (order) => order.billConfiguredAt || order.updatedAt || order.createdAt)
    || configured;
  const items = orders.flatMap((order) => Array.isArray(order.items) ? order.items : []);
  const activeItems = items.filter((item) => item?.status !== "voided" && number(item?.quantity) > 0);
  const itemSubtotal = activeItems.reduce((sum, item) => (
    sum + (item.isComplimentary ? 0 : number(item.priceSnapshot) * number(item.quantity, 1))
  ), 0);
  const extraAmount = money(orders.reduce((sum, order) => sum + Math.max(0, number(order.extraAmount)), 0));
  if (extraAmount > 0) {
    items.push({
      id: `table-session-extra:${session.id}`,
      menuItemId: null,
      quantity: 1,
      nameSnapshot: "Extra conto",
      priceSnapshot: extraAmount,
      notes: null,
      preparationArea: null,
      preparationStatus: "served",
      courseNumber: 1,
      releasedAt: session.openedAt || session.createdAt || new Date(),
      status: "active",
      isComplimentary: false,
      virtualSessionExtra: true,
    });
  }

  const guestCount = Math.max(1, Math.trunc(number(configured.guestCount, coverSource.guestCount || 1)));
  const coverCharge = Math.max(0, money(coverSource.coverCharge));
  const coverChargePerGuest = coverSource.coverChargePerGuest !== false;
  const coverTotal = money(coverCharge * (coverChargePerGuest ? guestCount : 1));
  const gross = money(itemSubtotal + extraAmount + coverTotal);
  const discountPercent = Math.max(0, Math.min(100, number(configured.discountPercent)));
  const fixedDiscount = Math.max(0, money(orders.reduce((sum, order) => (
    number(order.discountPercent) > 0 ? sum : sum + number(order.discountAmount)
  ), 0)));
  const discountAmount = money(Math.min(
    gross,
    discountPercent > 0 ? gross * discountPercent / 100 : fixedDiscount
  ));
  const payments = orders.flatMap((order) => Array.isArray(order.payments) ? order.payments : []);
  const paid = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + number(payment.amount), 0);
  const pending = payments.some((payment) => payment.status === "pending");
  const billRequestedAt = latest(orders.filter((order) => order.billRequestedAt), (order) => order.billRequestedAt)?.billRequestedAt || null;
  const notes = [...new Set(orders.map((order) => String(order.notes || "").trim()).filter(Boolean))].join(" · ").slice(0, 1000) || null;
  const identity = externalIdentity ? session.id : preferred?.id;

  return {
    ...(preferred || {}),
    id: identity || session.id,
    tableSessionId: session.id,
    sessionOrderIds: orders.map((order) => order.id),
    orderCount: orders.length,
    restaurantId: session.restaurantId || preferred?.restaurantId,
    tableId: session.tableId || preferred?.tableId,
    restaurant: session.restaurant || preferred?.restaurant,
    table: session.table || preferred?.table,
    orderNumber: orders[0]?.orderNumber || preferred?.orderNumber || 1,
    createdAt: session.openedAt || orders[0]?.createdAt || preferred?.createdAt,
    updatedAt: session.updatedAt || preferred?.updatedAt,
    status: tableSessionStatus(orders),
    notes,
    items,
    payments,
    guestCount,
    coverCharge,
    coverChargePerGuest,
    equalSplitEnabled: configured.equalSplitEnabled !== false,
    discountPercent,
    discountAmount,
    extraAmount: 0,
    totalAmount: money(gross - discountAmount),
    paymentStatus: paid > 0 && paid + 0.009 >= gross - discountAmount ? "paid" : pending || paid > 0 ? "pending" : "unpaid",
    billConfiguredAt: configured.billConfiguredAt || null,
    billRequestedAt,
    billRevision: Math.max(1, ...orders.map((order) => number(order.billRevision, 1))),
    integrationRevision: number(session.integrationRevision),
    integrationSyncedRevision: number(session.integrationSyncedRevision),
    integrationSyncStatus: session.integrationSyncStatus || "not_required",
    integrationLastError: session.integrationLastError || null,
    integrationSyncedAt: session.integrationSyncedAt || null,
  };
}

export function tableSessionOrderIds(order) {
  return Array.isArray(order?.sessionOrderIds) && order.sessionOrderIds.length
    ? order.sessionOrderIds
    : order?.id
      ? [order.id]
      : [];
}
