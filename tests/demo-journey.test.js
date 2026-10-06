import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_JOURNEY, DEMO_ORDER, DEMO_TOTAL_MINUTES, getDemoJourneyIndex, getDemoJourneyStep, getDemoOrdersAfterOrder, getDemoTablesAfterOrder } from "../src/lib/demoJourney.js";

test("la demo guidata copre il flusso operativo completo in dieci minuti", () => {
  assert.equal(DEMO_TOTAL_MINUTES, 10);
  assert.deepEqual(DEMO_JOURNEY.map((step) => step.view), ["menu", "cucina", "tavoli", "cassa", "risultati"]);
  assert.equal(DEMO_JOURNEY[0].minuteStart, 0);
  assert.equal(DEMO_JOURNEY.at(-1).minuteEnd, DEMO_TOTAL_MINUTES);
});

test("ogni passaggio ha identita, schermata e intervallo validi", () => {
  assert.equal(new Set(DEMO_JOURNEY.map((step) => step.id)).size, DEMO_JOURNEY.length);
  DEMO_JOURNEY.forEach((step, index) => {
    assert.ok(step.id);
    assert.ok(step.view);
    assert.ok(step.minuteEnd > step.minuteStart);
    if (index > 0) assert.equal(step.minuteStart, DEMO_JOURNEY[index - 1].minuteEnd);
  });
});

test("gli helper della demo gestiscono anche valori fuori intervallo", () => {
  assert.equal(getDemoJourneyStep(-10), DEMO_JOURNEY[0]);
  assert.equal(getDemoJourneyStep(99), DEMO_JOURNEY.at(-1));
  assert.equal(getDemoJourneyIndex("cassa"), 3);
  assert.equal(getDemoJourneyIndex("sconosciuta"), 0);
});

test("l'ordine demo T8 resta coerente tra cucina, bar, sala e cassa", () => {
  const tables = [{ id: 8, name: "T8", status: "free", total: 0, time: "-" }, { id: 9, name: "T9", status: "occupied", total: 40 }];
  const orders = [{ table: "T9", area: "kitchen" }];
  const updatedTable = getDemoTablesAfterOrder(tables, true).find((table) => table.id === DEMO_ORDER.tableId);
  const updatedOrders = getDemoOrdersAfterOrder(orders, true);

  assert.equal(updatedTable.status, "occupied");
  assert.equal(updatedTable.total, DEMO_ORDER.total);
  assert.deepEqual(updatedOrders.slice(0, 2).map((order) => order.area), ["kitchen", "bar"]);
  assert.equal(updatedOrders.filter((order) => order.table === DEMO_ORDER.tableName).length, 2);
  assert.equal(getDemoTablesAfterOrder(tables, false), tables);
  assert.equal(getDemoOrdersAfterOrder(orders, false), orders);
});
