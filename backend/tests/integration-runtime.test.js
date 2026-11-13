import test from "node:test";
import assert from "node:assert/strict";
import {
  IntegrationMappingError,
  deterministicUuid,
  discoverProviderResources,
  executeProviderOrderOperation,
} from "../integrations/runtime.js";

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    async json() { return body; },
  };
}

const baseOrder = {
  id: "order-1",
  orderNumber: 42,
  restaurantId: "restaurant-1",
  tableId: "table-local",
  createdAt: new Date("2026-10-07T12:00:00.000Z"),
  totalAmount: 20,
  discountAmount: 0,
  coverCharge: 0,
  guestCount: 2,
  restaurant: { currency: "EUR" },
  table: { name: "Tavolo 1" },
  items: [{
    id: "order-item-1",
    menuItemId: "menu-local",
    nameSnapshot: "Margherita",
    priceSnapshot: 10,
    quantity: 2,
    status: "active",
    notes: "senza basilico",
    isComplimentary: false,
  }],
};

test("deterministic UUIDs remain stable across retries", () => {
  const first = deterministicUuid("ordynora:order:1");
  const second = deterministicUuid("ordynora:order:1");
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("Tilby discovery normalizes products and room tables", async () => {
  const calls = [];
  const result = await discoverProviderResources("tilby", {
    credentials: { accessToken: "secret" },
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("/items?")) {
        return jsonResponse(200, {
          page: 0,
          pages: 1,
          results: [{
            id: 10,
            name: "Margherita",
            sku: "PIZ-1",
            price1: 10,
            department_id: 3,
            department: { id: 3, name: "Cucina", vat_id: 2, vat: { id: 2, value: 10 } },
          }],
        });
      }
      if (url.includes("/rooms?")) {
        return jsonResponse(200, {
          page: 0,
          pages: 1,
          results: [{ id: 5, name: "Sala", tables: [{ id: 7, name: "Tavolo 1", covers: 4 }] }],
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(result.menuItems[0].metadata.department.id, 3);
  assert.equal(result.menuItems[0].metadata.vatPerc, 10);
  assert.equal(result.tables[0].metadata.roomId, 5);
  assert.equal(result.tables[0].metadata.tableId, 7);
});

test("Tilby creates one open sale with deterministic item identifiers", async () => {
  let posted;
  const mappings = [
    {
      entityType: "menu_item",
      localId: "menu-local",
      externalId: "10",
      metadata: { itemId: 10, sku: "PIZ-1", department: { id: 3, name: "Cucina", vat_id: 2 }, vatPerc: 10 },
    },
    {
      entityType: "table",
      localId: "table-local",
      externalId: "7",
      metadata: { tableId: 7, tableName: "Tavolo 1", roomId: 5, roomName: "Sala" },
    },
  ];
  const result = await executeProviderOrderOperation("tilby", {
    operation: "upsert_order",
    credentials: { accessToken: "secret" },
    config: {},
    order: { ...baseOrder, totalAmount: 18, discountAmount: 2 },
    mappings,
    fetchImpl: async (url, options) => {
      if (options?.method === "POST" && url.endsWith("/sales")) {
        posted = JSON.parse(options.body);
        return jsonResponse(201, { id: 91 });
      }
      if (url.includes("/sales?")) return jsonResponse(200, { page: 0, pages: 1, results: [] });
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(result.externalId, "91");
  assert.equal(posted.status, "open");
  assert.equal(posted.table_id, 7);
  assert.deepEqual(posted.tables, [{ table_id: 7, table_name: "Tavolo 1", room_id: 5, room_name: "Sala" }]);
  assert.equal(posted.amount, 20);
  assert.equal(posted.final_amount, 18);
  assert.equal(posted.sale_items[0].item_id, 10);
  assert.equal(posted.sale_items[0].quantity, 2);
  assert.equal(posted.sale_items[0].final_price, 9);
  assert.equal(posted.sale_items[0].uuid, deterministicUuid("ordynora:sale-item:order-item-1"));
  assert.equal(JSON.stringify(posted).includes("secret"), false);
});

test("Tilby updates the existing sale without echoing read-only top-level fields", async () => {
  let updated;
  let postCalls = 0;
  const itemUuid = deterministicUuid("ordynora:sale-item:order-item-1");
  const mappings = [
    {
      entityType: "menu_item",
      localId: "menu-local",
      externalId: "10",
      metadata: { itemId: 10, department: { id: 3, name: "Cucina", vat_id: 2 }, vatPerc: 10 },
    },
    {
      entityType: "table",
      localId: "table-local",
      externalId: "7",
      metadata: { tableId: 7, tableName: "Tavolo 1", roomId: 5, roomName: "Sala" },
    },
  ];
  const result = await executeProviderOrderOperation("tilby", {
    operation: "upsert_order",
    credentials: { accessToken: "secret" },
    order: baseOrder,
    mappings,
    externalId: "91",
    fetchImpl: async (url, options) => {
      if (url.endsWith("/sales/91") && !options?.method) {
        return jsonResponse(200, {
          sale: {
            id: 91,
            status: "open",
            readonly_field: "do-not-send",
            payments: [],
            sale_items: [{ id: 500, uuid: itemUuid }],
          },
        });
      }
      if (url.endsWith("/sales/91") && options?.method === "PUT") {
        updated = JSON.parse(options.body);
        return jsonResponse(200, { id: 91 });
      }
      if (options?.method === "POST") postCalls += 1;
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(result.action, "updated");
  assert.equal(postCalls, 0);
  assert.equal(updated.readonly_field, undefined);
  assert.equal(updated.payments, undefined);
  assert.equal(updated.sale_items[0].id, 500);
  assert.equal(updated.tables[0].room_name, "Sala");
});

for (const [caseName, remote] of [
  ["closed", { status: "closed", closed_at: "2026-11-06T10:00:00Z" }],
  ["stored", { status: "stored" }],
  ["partially paid", { status: "open", payments: [{ id: 1, amount: 5 }] }],
  ["documented", { status: "open", sale_documents: [{ id: 1 }] }],
]) {
  for (const operation of ["upsert_order", "delete_order"]) {
    test(`Tilby never changes a ${caseName} sale during ${operation}`, async () => {
      let writes = 0;
      await assert.rejects(() => executeProviderOrderOperation("tilby", {
        operation,
        credentials: { accessToken: "secret" },
        order: baseOrder,
        externalId: "91",
        mappings: [
          { entityType: "menu_item", localId: "menu-local", externalId: "10", metadata: { itemId: 10, department: { id: 3 }, vatPerc: 10 } },
          { entityType: "table", localId: "table-local", externalId: "7", metadata: { tableId: 7, tableName: "Tavolo 1", roomId: 5, roomName: "Sala" } },
        ],
        fetchImpl: async (_url, options) => {
          if (options.method && options.method !== "GET") writes += 1;
          return jsonResponse(200, { id: 91, ...remote });
        },
      }), (error) => error.code === "TILBY_SALE_LOCKED_IN_POS");
      assert.equal(writes, 0);
    });
  }
}

test("a fenced-out worker stops before any Cassa in Cloud request", async () => {
  let calls = 0;
  const leaseError = Object.assign(new Error("Lease lost"), { code: "INTEGRATION_LEASE_LOST" });
  await assert.rejects(() => executeProviderOrderOperation("teamsystem_cassa_in_cloud", {
    operation: "upsert_order", credentials: { apiKey: "api-secret" }, config: { salesPointId: "123" },
    order: baseOrder, mappings: [],
    beforeRequest: async () => { throw leaseError; },
    fetchImpl: async () => { calls += 1; return jsonResponse(200, {}); },
  }), (error) => error === leaseError);
  assert.equal(calls, 0);
});

test("Tilby cannot confirm a creation without the remote sale identifier", async () => {
  await assert.rejects(() => executeProviderOrderOperation("tilby", {
    operation: "upsert_order", credentials: { accessToken: "secret" }, order: baseOrder,
    mappings: [
      { entityType: "menu_item", localId: "menu-local", externalId: "10", metadata: { itemId: 10, department: { id: 3 }, vatPerc: 10 } },
      { entityType: "table", localId: "table-local", externalId: "7", metadata: { tableId: 7, tableName: "Tavolo 1", roomId: 5, roomName: "Sala" } },
    ],
    fetchImpl: async (_url, options) => options.method === "POST"
      ? jsonResponse(201, {}) : jsonResponse(200, { results: [], pages: 1 }),
  }), (error) => error.code === "TILBY_SALE_ID_MISSING" && error.retryable === true);
});

test("Cassa in Cloud discovery supports simple and multivariant products", async () => {
  const variantCalls = [];
  const result = await discoverProviderResources("teamsystem_cassa_in_cloud", {
    credentials: { apiKey: "api-secret" },
    config: { salesPointId: "sp-1" },
    fetchImpl: async (url) => {
      if (url.endsWith("/apikey/token")) return jsonResponse(200, { access_token: "temporary" });
      if (url.includes("/salespoint?")) {
        return jsonResponse(200, { salesPoints: [{ id: "sp-1", description: "Milano" }] });
      }
      if (url.includes("/products/p-1/variants?")) {
        variantCalls.push(url);
        return jsonResponse(200, {
          variants: [{ id: "v-1", description: "Acqua", prices: [{ idSalesPoint: "sp-1", value: 2 }] }],
        });
      }
      if (url.includes("/products/p-2/variants?")) {
        variantCalls.push(url);
        return jsonResponse(200, {
          variants: [{ id: "v-2", description: "Grande", prices: [{ idSalesPoint: "sp-1", value: 12 }] }],
        });
      }
      if (url.includes("/products?")) {
        return jsonResponse(200, {
          products: [
            {
              id: "p-1",
              description: "Acqua",
              multivariant: false,
              idDepartment: "dep-1",
              prices: [{ idSalesPoint: "sp-1", value: 2 }],
            },
            { id: "p-2", description: "Pizza", multivariant: true, idDepartment: "dep-1" },
          ],
          totalCount: 2,
        });
      }
      if (url.includes("/risto/tables?")) {
        return jsonResponse(200, { tables: [{ id: "table-1", description: "Tavolo 1", seatsAvailable: 4 }] });
      }
      if (url.includes("/departments?")) {
        return jsonResponse(200, { departments: [{ id: "dep-1", description: "Sala", idTax: "tax-1" }] });
      }
      if (url.includes("/taxes?")) {
        return jsonResponse(200, { taxes: [{ id: "tax-1", rate: 10 }] });
      }
      if (url.includes("/salesmodes?")) return jsonResponse(200, { salesModes: [] });
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(variantCalls.length, 2);
  assert.equal(result.menuItems.length, 2);
  const simple = result.menuItems.find((item) => item.id === "v-1");
  const variant = result.menuItems.find((item) => item.id === "v-2");
  assert.equal(simple.ready, true);
  assert.equal(simple.metadata.idProduct, "p-1");
  assert.equal(simple.metadata.idProductVariant, "v-1");
  assert.equal(simple.metadata.idSalesMode, null);
  assert.equal(simple.metadata.taxValue, 10);
  assert.equal(variant.metadata.idProductVariant, "v-2");
  assert.equal(result.tables[0].seats, 4);
});

test("Cassa in Cloud discovery follows pagination beyond the first 100 products", async () => {
  const starts = [];
  const result = await discoverProviderResources("teamsystem_cassa_in_cloud", {
    credentials: { apiKey: "api-secret" },
    config: { salesPointId: "1" },
    fetchImpl: async (url) => {
      if (url.endsWith("/apikey/token")) return jsonResponse(200, { access_token: "temporary" });
      if (url.includes("/salespoint?")) return jsonResponse(200, { salesPoints: [{ id: 1, description: "Roma" }] });
      if (url.includes("/products?")) {
        const start = Number(new URL(url).searchParams.get("start"));
        starts.push(start);
        const count = start === 0 ? 100 : 1;
        return jsonResponse(200, {
          products: Array.from({ length: count }, (_, index) => ({
            id: `p-${start + index}`,
            description: `Prodotto ${start + index}`,
            multivariant: false,
            idDepartment: "dep-1",
            prices: [{ idSalesPoint: 1, value: 1 }],
            variants: [{ id: `v-${start + index}`, description: `Prodotto ${start + index}` }],
          })),
          totalCount: 101,
        });
      }
      if (url.includes("/departments?")) return jsonResponse(200, { departments: [{ id: "dep-1", idTax: "tax-1" }] });
      if (url.includes("/taxes?")) return jsonResponse(200, { taxes: [{ id: "tax-1", rate: 10 }] });
      if (url.includes("/risto/tables?")) return jsonResponse(200, { tables: [] });
      if (url.includes("/salesmodes?")) return jsonResponse(200, { salesModes: [] });
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.deepEqual(starts, [0, 100]);
  assert.equal(result.menuItems.length, 101);
});

test("Cassa in Cloud sends an external TABLE order only after reconciliation", async () => {
  let batchPayload;
  let reconciliationUrl;
  const mappings = [
    {
      entityType: "menu_item",
      localId: "menu-local",
      externalId: "product-variant-10",
      metadata: {
        idProductVariant: "product-variant-10",
        idDepartment: "dep-1",
        idTax: "tax-10",
      },
    },
    {
      entityType: "table",
      localId: "table-local",
      externalId: "table-7",
      metadata: { tableId: "table-7" },
    },
  ];
  const result = await executeProviderOrderOperation("teamsystem_cassa_in_cloud", {
    operation: "upsert_order",
    credentials: { apiKey: "api-secret" },
    config: { salesPointId: "123", dueMinutes: "15" },
    order: { ...baseOrder, totalAmount: 18, discountAmount: 2 },
    mappings,
    fetchImpl: async (url, options) => {
      if (url.endsWith("/apikey/token")) return jsonResponse(200, { access_token: "temporary" });
      if (url.includes("/documents/orders?") && options?.method !== "POST") {
        reconciliationUrl = url;
        return jsonResponse(200, { orders: [], totalCount: 0 });
      }
      if (url.endsWith("/documents/orders/batch")) {
        batchPayload = JSON.parse(options.body);
        return jsonResponse(200, { batchResponse: { createDetails: [{ id: "external-order-1", externalId: "ordynora:order-1" }] } });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(result.externalId, "external-order-1");
  assert.equal(batchPayload.create[0].deliveryMode, "TABLE");
  assert.equal(batchPayload.create[0].isExternalOrder, true);
  assert.equal(batchPayload.create[0].document.idSalesPoint, 123);
  assert.equal(batchPayload.create[0].document.amount, 18);
  assert.equal(batchPayload.create[0].document.rows[0].idProduct, undefined);
  assert.equal(batchPayload.create[0].document.rows[0].idProductVariant, "product-variant-10");
  assert.equal(batchPayload.create[0].document.rows[0].idSalesMode, undefined);
  assert.equal(batchPayload.create[0].document.rows[0].percentageVariation, undefined);
  assert.equal(batchPayload.create[0].document.rows[1].subtotal, true);
  assert.equal(batchPayload.create[0].document.rows[1].percentageVariation, -10);
  assert.equal(batchPayload.create[0].document.rows[1].variationType, "CUSTOMER");
  assert.equal(typeof batchPayload.create[0].date, "number");
  assert.equal(typeof batchPayload.create[0].dueDate, "number");
  assert.ok(batchPayload.create[0].dueDate > batchPayload.create[0].date);
  const reconciliationQuery = new URL(reconciliationUrl).searchParams;
  assert.match(reconciliationQuery.get("datetimeFrom"), /^\d+$/);
  assert.match(reconciliationQuery.get("datetimeTo"), /^\d+$/);
  assert.ok(Number(reconciliationQuery.get("datetimeTo")) - Number(reconciliationQuery.get("datetimeFrom")) < 3 * 24 * 60 * 60 * 1000);
  assert.equal(JSON.stringify(batchPayload).includes("api-secret"), false);
  assert.equal(JSON.stringify(batchPayload).includes("temporary"), false);
});

test("Cassa in Cloud reconciles an existing externalId without creating a duplicate", async () => {
  let batchCalls = 0;
  const mappings = [
    {
      entityType: "menu_item",
      localId: "menu-local",
      externalId: "product-variant-10",
      metadata: { idProductVariant: "product-variant-10", idDepartment: "dep-1", idTax: "tax-10" },
    },
    { entityType: "table", localId: "table-local", externalId: "table-7", metadata: { tableId: "table-7" } },
  ];
  const result = await executeProviderOrderOperation("teamsystem_cassa_in_cloud", {
    operation: "upsert_order",
    credentials: { apiKey: "api-secret" },
    config: { salesPointId: "123" },
    order: baseOrder,
    mappings,
    fetchImpl: async (url) => {
      if (url.endsWith("/apikey/token")) return jsonResponse(200, { access_token: "temporary" });
      if (url.includes("/documents/orders?")) {
        return jsonResponse(200, { orders: [{ id: "already-there", externalId: "ordynora:order-1" }] });
      }
      if (url.endsWith("/documents/orders/batch")) batchCalls += 1;
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(result.action, "reconciled");
  assert.equal(result.externalId, "already-there");
  assert.equal(batchCalls, 0);
});

test("Cassa in Cloud refreshes an expired access token once", async () => {
  let tokenCalls = 0;
  let orderCalls = 0;
  const mappings = [
    {
      entityType: "menu_item",
      localId: "menu-local",
      externalId: "product-variant-10",
      metadata: { idProductVariant: "product-variant-10", idDepartment: "dep-1", idTax: "tax-10" },
    },
    { entityType: "table", localId: "table-local", externalId: "table-7", metadata: { tableId: "table-7" } },
  ];
  const result = await executeProviderOrderOperation("teamsystem_cassa_in_cloud", {
    operation: "upsert_order",
    credentials: { apiKey: "api-secret" },
    config: { salesPointId: "123" },
    order: baseOrder,
    mappings,
    fetchImpl: async (url, options) => {
      if (url.endsWith("/apikey/token")) {
        tokenCalls += 1;
        return jsonResponse(200, { access_token: `temporary-${tokenCalls}`, expires_in: 3600 });
      }
      if (url.includes("/documents/orders?")) {
        orderCalls += 1;
        if (orderCalls === 1) {
          assert.equal(options.headers.Authorization, "Bearer temporary-1");
          return jsonResponse(401, {});
        }
        assert.equal(options.headers.Authorization, "Bearer temporary-2");
        return jsonResponse(200, {
          orders: [{ id: "already-there", externalId: "ordynora:order-1" }],
          totalCount: 1,
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(result.action, "reconciled");
  assert.equal(tokenCalls, 2);
  assert.equal(orderCalls, 2);
});

test("Cassa in Cloud reconciliation searches beyond the first 100 orders", async () => {
  const starts = [];
  let batchCalls = 0;
  const mappings = [
    {
      entityType: "menu_item",
      localId: "menu-local",
      externalId: "product-variant-10",
      metadata: { idProductVariant: "product-variant-10", idDepartment: "dep-1", idTax: "tax-10" },
    },
    { entityType: "table", localId: "table-local", externalId: "table-7", metadata: { tableId: "table-7" } },
  ];
  const result = await executeProviderOrderOperation("teamsystem_cassa_in_cloud", {
    operation: "upsert_order",
    credentials: { apiKey: "api-secret" },
    config: { salesPointId: "123" },
    order: baseOrder,
    mappings,
    fetchImpl: async (url) => {
      if (url.endsWith("/apikey/token")) return jsonResponse(200, { access_token: "temporary" });
      if (url.includes("/documents/orders?")) {
        const start = Number(new URL(url).searchParams.get("start"));
        starts.push(start);
        if (start === 0) {
          return jsonResponse(200, {
            orders: Array.from({ length: 100 }, (_, index) => ({ id: `other-${index}`, externalId: `other:${index}` })),
            totalCount: 101,
          });
        }
        return jsonResponse(200, {
          orders: [{ id: "existing-second-page", externalId: "ordynora:order-1" }],
          totalCount: 101,
        });
      }
      if (url.endsWith("/documents/orders/batch")) batchCalls += 1;
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.deepEqual(starts, [0, 100]);
  assert.equal(result.externalId, "existing-second-page");
  assert.equal(result.action, "reconciled");
  assert.equal(batchCalls, 0);
});

test("an unmapped product blocks the job before any provider write", async () => {
  let called = false;
  await assert.rejects(
    () => executeProviderOrderOperation("tilby", {
      operation: "upsert_order",
      credentials: { accessToken: "secret" },
      order: baseOrder,
      mappings: [{ entityType: "table", localId: "table-local", externalId: "7", metadata: { tableId: 7 } }],
      fetchImpl: async () => { called = true; return jsonResponse(200, {}); },
    }),
    (error) => {
      assert.equal(error instanceof IntegrationMappingError, true);
      assert.equal(error.code, "INTEGRATION_MAPPING_REQUIRED");
      return true;
    }
  );
  assert.equal(called, false);
});
