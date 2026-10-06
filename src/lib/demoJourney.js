export const DEMO_TOTAL_MINUTES = 10;

export const DEMO_JOURNEY = Object.freeze([
  { id: "guest", view: "menu", minuteStart: 0, minuteEnd: 2 },
  { id: "kitchen", view: "cucina", minuteStart: 2, minuteEnd: 4 },
  { id: "floor", view: "tavoli", minuteStart: 4, minuteEnd: 6 },
  { id: "checkout", view: "cassa", minuteStart: 6, minuteEnd: 8 },
  { id: "owner", view: "risultati", minuteStart: 8, minuteEnd: 10 },
]);

export const DEMO_ORDER = Object.freeze({
  tableId: 8,
  tableName: "T8",
  total: 26,
  time: "1 min",
  tickets: [
    { table: "T8", area: "kitchen", time: "00:08", status: "new", items: [["risotto"]] },
    { table: "T8", area: "bar", time: "00:08", status: "new", items: [["spritz"]] },
  ],
});

export function getDemoJourneyStep(index) {
  const safeIndex = Math.min(Math.max(Number(index) || 0, 0), DEMO_JOURNEY.length - 1);
  return DEMO_JOURNEY[safeIndex];
}

export function getDemoJourneyIndex(view) {
  const index = DEMO_JOURNEY.findIndex((step) => step.view === view);
  return index >= 0 ? index : 0;
}

export function getDemoTablesAfterOrder(tables, orderSent) {
  if (!orderSent) return tables;
  return tables.map((table) => (
    table.id === DEMO_ORDER.tableId
      ? { ...table, status: "occupied", total: DEMO_ORDER.total, time: DEMO_ORDER.time }
      : table
  ));
}

export function getDemoOrdersAfterOrder(orders, orderSent) {
  return orderSent ? [...DEMO_ORDER.tickets, ...orders] : orders;
}
