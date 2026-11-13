import crypto from "node:crypto";
import {
  CONNECTOR_ENDPOINTS,
  PosConnectionError,
  getTeamSystemAccessToken,
  invalidateTeamSystemAccessToken,
  requestProviderJson,
} from "./connectors.js";

const MAX_REMOTE_RECORDS = 500;
const ORDYNORA_CHANNEL = "Ordynora";
const discoveryCache = new Map();

export class IntegrationMappingError extends Error {
  constructor(message, { code = "INTEGRATION_MAPPING_REQUIRED", details = [] } = {}) {
    super(message);
    this.name = "IntegrationMappingError";
    this.code = code;
    this.details = details;
    this.retryable = false;
  }
}

function list(value, ...keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function clean(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round(number(value) * 100) / 100;
}

function decimal(value, precision = 6) {
  const factor = 10 ** precision;
  return Math.round(number(value) * factor) / factor;
}

function numericOrString(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(value).trim() !== "" ? parsed : value;
}

export function deterministicUuid(value) {
  const bytes = crypto.createHash("sha256").update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createTilbyClient(credentials, { fetchImpl = globalThis.fetch, timeoutMs, beforeRequest } = {}) {
  const request = async (path, options = {}, requestOptions = {}) => requestProviderJson(
    `${CONNECTOR_ENDPOINTS.tilbyApi}${path}`,
    {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${credentials.accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    },
    {
      fetchImpl,
      timeoutMs,
      providerName: "Tilby",
      beforeRequest,
      ...requestOptions,
    }
  );
  return { request };
}

async function createCassaClient(credentials, { fetchImpl = globalThis.fetch, timeoutMs, beforeRequest } = {}) {
  let token = await getTeamSystemAccessToken(credentials, { fetchImpl, timeoutMs, beforeRequest });
  const requestWithToken = async (path, options, requestOptions) => requestProviderJson(
    `${CONNECTOR_ENDPOINTS.teamSystemApi}${path}`,
    {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Version": "1.0.0",
        "X-Requested-With": ORDYNORA_CHANNEL,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    },
    {
      fetchImpl,
      timeoutMs,
      providerName: "Cassa in Cloud",
      beforeRequest,
      ...requestOptions,
    }
  );
  const request = async (path, options = {}, requestOptions = {}) => {
    try {
      return await requestWithToken(path, options, requestOptions);
    } catch (error) {
      if (error?.providerStatus !== 401) throw error;
      invalidateTeamSystemAccessToken(credentials);
      token = await getTeamSystemAccessToken(credentials, {
        fetchImpl,
        timeoutMs,
        forceRefresh: true,
        beforeRequest,
      });
      return requestWithToken(path, options, requestOptions);
    }
  };
  return { request };
}

async function tilbyPaged(client, path) {
  const output = [];
  for (let page = 0; output.length < MAX_REMOTE_RECORDS; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const { body } = await client.request(`${path}${separator}pagination=true&per_page=100&page=${page}`);
    const rows = list(body, "results");
    output.push(...rows);
    const pages = Math.max(1, number(body?.pages, 1));
    if (!body?.results || page + 1 >= pages || rows.length === 0) break;
  }
  return output.slice(0, MAX_REMOTE_RECORDS);
}

async function cassaPaged(client, path, responseKeys) {
  const output = [];
  const keys = Array.isArray(responseKeys) ? responseKeys : [responseKeys];
  for (let start = 0; output.length < MAX_REMOTE_RECORDS; start += 100) {
    const separator = path.includes("?") ? "&" : "?";
    const { body } = await client.request(`${path}${separator}start=${start}&limit=100`);
    const rows = list(body, ...keys);
    output.push(...rows);
    const hasTotalCount = body?.totalCount !== undefined && body?.totalCount !== null;
    const totalCount = Number(body?.totalCount);
    if (rows.length < 100 || (hasTotalCount && Number.isFinite(totalCount) && output.length >= totalCount)) break;
  }
  return output.slice(0, MAX_REMOTE_RECORDS);
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const output = new Array(values.length);
  let next = 0;
  async function runner() {
    while (next < values.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length || 1) }, runner));
  return output;
}

function normalizeTilbyItem(item) {
  const department = item?.department || {};
  const vat = department?.vat || {};
  const departmentId = item?.department_id ?? department?.id;
  const vatPerc = number(item?.vat_perc ?? vat?.value, NaN);
  return {
    id: clean(item?.id),
    name: clean(item?.name || item?.order_name || `Articolo ${item?.id}`),
    sku: clean(item?.sku || item?.code),
    price: money(item?.price1),
    ready: Boolean(item?.id && departmentId !== undefined && Number.isFinite(vatPerc)),
    metadata: {
      itemId: item?.id,
      sku: clean(item?.sku || item?.code),
      department: {
        id: numericOrString(departmentId),
        name: clean(department?.name || "Reparto"),
        vat_id: numericOrString(department?.vat_id ?? vat?.id),
      },
      vatPerc,
      categoryId: item?.category_id ?? item?.category?.id ?? null,
      categoryName: clean(item?.category?.name),
    },
  };
}

async function discoverTilby(credentials, options) {
  const client = createTilbyClient(credentials, options);
  const [items, rooms] = await Promise.all([
    tilbyPaged(client, "/items"),
    tilbyPaged(client, "/rooms"),
  ]);
  const menuItems = items
    .filter((item) => !item?.deleted_at && item?.on_sale !== false)
    .map(normalizeTilbyItem)
    .filter((item) => item.id);
  const tables = rooms.flatMap((room) => list(room?.tables).map((table) => ({
    id: clean(table?.id),
    name: clean(table?.name || `Tavolo ${table?.id}`),
    code: clean(table?.name),
    seats: number(table?.covers),
    metadata: {
      tableId: numericOrString(table?.id),
      tableName: clean(table?.name),
      roomId: numericOrString(room?.id),
      roomName: clean(room?.name),
    },
  }))).filter((table) => table.id);
  return {
    salesPoints: [],
    menuItems,
    tables,
    warnings: menuItems.some((item) => !item.ready)
      ? ["Alcuni articoli Tilby non hanno reparto o IVA completi e non possono essere mappati."]
      : [],
  };
}

function cassaSalesPoint(point) {
  return {
    id: clean(point?.id ?? point?.idSalesPoint),
    name: clean(point?.description || point?.name || `Punto vendita ${point?.id ?? point?.idSalesPoint}`),
  };
}

async function discoverCassa(credentials, config, options) {
  const client = await createCassaClient(credentials, options);
  const { body: salesPointBody } = await client.request("/salespoint?hasActiveLicense=true");
  const salesPoints = list(salesPointBody, "salesPoint", "salesPoints").map(cassaSalesPoint).filter((row) => row.id);
  const configuredId = clean(config?.salesPointId);
  const selected = salesPoints.find((point) => point.id === configuredId)
    || (salesPoints.length === 1 ? salesPoints[0] : null);

  if (!selected) {
    return {
      salesPoints,
      menuItems: [],
      tables: [],
      suggestedConfig: salesPoints.length === 1 ? { salesPointId: salesPoints[0].id } : null,
      warnings: [salesPoints.length
        ? "Seleziona l'ID del punto vendita e salva di nuovo la configurazione."
        : "Nessun punto vendita con licenza API attiva è stato restituito da Cassa in Cloud."],
    };
  }

  const salesPointQuery = `idsSalesPoint=${encodeURIComponent(selected.id)}`;
  const [products, tables, departments, taxes, salesModes] = await Promise.all([
    cassaPaged(client, `/products?${salesPointQuery}`, ["products", "product"]),
    cassaPaged(client, `/risto/tables?${salesPointQuery}`, ["tables", "table"]),
    cassaPaged(client, `/departments?${salesPointQuery}`, ["departments", "department"]),
    cassaPaged(client, `/taxes?${salesPointQuery}`, ["taxes", "tax"]),
    cassaPaged(client, `/salesmodes?${salesPointQuery}`, ["salesModes", "salesmodes", "salesMode"]),
  ]);

  const departmentById = new Map(departments.map((row) => [clean(row?.id), row]));
  const taxById = new Map(taxes.map((row) => [clean(row?.id), row]));
  const defaultSalesMode = salesModes[0] || null;
  const variantsPerProduct = await mapWithConcurrency(products, 6, async (product) => {
    if (Array.isArray(product?.variants) && product.variants.length) return product.variants;
    return cassaPaged(
      client,
      `/products/${encodeURIComponent(product.id)}/variants`,
      ["variants", "productVariants"]
    );
  });

  const menuItems = products.flatMap((product, productIndex) => {
    if (product?.enableForRisto === false || product?.enableForSale === false || product?.deleted) return [];
    const variants = variantsPerProduct[productIndex]?.length ? variantsPerProduct[productIndex] : [null];
    return variants.map((variant) => {
      const departmentId = clean(variant?.idDepartment ?? product?.idDepartment);
      const department = departmentById.get(departmentId) || {};
      const taxId = clean(variant?.idTax ?? product?.idTax ?? department?.idTax);
      const tax = taxById.get(taxId) || {};
      const prices = list(variant?.prices, "prices").length ? variant.prices : list(product?.prices, "prices");
      const price = prices.find((row) => clean(row?.idSalesPoint) === selected.id) || prices[0] || {};
      const salesModeId = clean(price?.idSalesMode ?? variant?.idSalesMode ?? product?.idSalesMode ?? defaultSalesMode?.id);
      const productId = clean(product?.id ?? product?.idProduct);
      const variantId = clean(variant?.id ?? variant?.idProductVariant);
      const resourceId = variantId || productId;
      const suffix = clean(variant?.description || variant?.descriptionLabel);
      const productName = clean(product?.description || product?.descriptionLabel || `Prodotto ${product?.id}`);
      const selectedSalesMode = salesModes.find((row) => clean(row?.id) === salesModeId) || defaultSalesMode || {};
      return {
        id: resourceId,
        name: suffix && suffix.toLowerCase() !== productName.toLowerCase() ? `${productName} · ${suffix}` : productName,
        sku: clean(variant?.externalId || product?.externalId || product?.internalId),
        price: money(price?.value),
        ready: Boolean(resourceId && productId && variantId && departmentId && taxId),
        metadata: {
          idProduct: productId,
          idProductVariant: variantId || null,
          multivariant: Boolean(product?.multivariant),
          idDepartment: departmentId,
          idTax: taxId,
          idSalesMode: salesModeId || null,
          departmentName: clean(department?.description || department?.name),
          taxValue: number(tax?.rate ?? tax?.value ?? tax?.percentage, 0),
          salesModeName: clean(selectedSalesMode?.description || selectedSalesMode?.name),
        },
      };
    });
  }).filter((item) => item.id);

  return {
    salesPoints,
    selectedSalesPoint: selected,
    suggestedConfig: configuredId ? null : { salesPointId: selected.id },
    menuItems,
    tables: tables.map((table) => ({
      id: clean(table?.id ?? table?.idTable),
      name: clean(table?.description || table?.name || `Tavolo ${table?.id ?? table?.idTable}`),
      code: clean(table?.externalId || table?.code),
      seats: number(table?.seatsAvailable ?? table?.seats ?? table?.covers),
      metadata: { tableId: clean(table?.id ?? table?.idTable) },
    })).filter((table) => table.id),
    warnings: menuItems.some((item) => !item.ready)
      ? ["Alcuni prodotti Cassa in Cloud non hanno variante, reparto o IVA completi e non possono essere abbinati finché non vengono corretti nel gestionale."]
      : [],
  };
}

async function discoverProviderResourcesUncached(provider, {
  credentials = {},
  config = {},
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  if (provider === "tilby") return discoverTilby(credentials, { fetchImpl, timeoutMs });
  if (provider === "teamsystem_cassa_in_cloud") {
    return discoverCassa(credentials, config, { fetchImpl, timeoutMs });
  }
  throw new PosConnectionError("Questo gestionale non dispone di un connettore automatico", {
    code: "POS_PROVIDER_UNSUPPORTED",
  });
}

function discoveryCacheDuration() {
  const configured = Number(process.env.INTEGRATION_DISCOVERY_CACHE_MS || 120000);
  return Number.isFinite(configured) ? Math.max(0, Math.min(10 * 60 * 1000, configured)) : 120000;
}

function discoveryCacheKey(provider, credentials, config) {
  return crypto.createHash("sha256").update(JSON.stringify({ provider, credentials, config })).digest("hex");
}

export async function discoverProviderResources(provider, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cacheMs = discoveryCacheDuration();
  const useCache = fetchImpl === globalThis.fetch && cacheMs > 0;
  if (!useCache) return discoverProviderResourcesUncached(provider, { ...options, fetchImpl });

  const key = discoveryCacheKey(provider, options.credentials || {}, options.config || {});
  const cached = discoveryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.pending) return cached.pending;
  const pending = discoverProviderResourcesUncached(provider, { ...options, fetchImpl });
  discoveryCache.set(key, { pending, expiresAt: 0 });
  let value;
  try {
    value = await pending;
  } catch (error) {
    if (discoveryCache.get(key)?.pending === pending) discoveryCache.delete(key);
    throw error;
  }
  if (discoveryCache.size > 250) {
    for (const [cacheKey, entry] of discoveryCache) {
      if (entry.expiresAt <= Date.now()) discoveryCache.delete(cacheKey);
    }
  }
  discoveryCache.set(key, { value, expiresAt: Date.now() + cacheMs });
  return value;
}

function mappingIndex(mappings = []) {
  return new Map(mappings.map((mapping) => [`${mapping.entityType}:${mapping.localId}`, mapping]));
}

function requireMapping(index, entityType, localId, label) {
  const mapping = index.get(`${entityType}:${localId}`);
  if (!mapping) {
    throw new IntegrationMappingError(`Manca la mappatura per ${label}.`, {
      details: [{ entityType, localId, label }],
    });
  }
  return mapping;
}

function activeOrderItems(order) {
  return (order.items || []).filter((item) => item.status !== "voided" && number(item.quantity) > 0);
}

function ensureOrderCanExport(order, mappings) {
  const index = mappingIndex(mappings);
  const table = requireMapping(index, "table", order.tableId, `il tavolo ${order.table?.name || order.tableId}`);
  const items = activeOrderItems(order).map((item) => ({
    item,
    mapping: requireMapping(
      index,
      "menu_item",
      item.menuItemId || "__extra__",
      item.menuItemId ? item.nameSnapshot : `l'extra “${item.nameSnapshot}”`
    ),
  }));
  const coverTotal = money(number(order.coverCharge) * (order.coverChargePerGuest ? number(order.guestCount, 1) : 1));
  const cover = coverTotal > 0
    ? requireMapping(index, "menu_item", "__cover__", "il coperto")
    : null;
  return { table, items, cover, coverTotal };
}

function tilbySalePayload(order, mappings) {
  const context = ensureOrderCanExport(order, mappings);
  const sellerId = 0;
  const sellerName = ORDYNORA_CHANNEL;
  const saleItems = context.items.map(({ item, mapping }) => {
    const metadata = mapping.metadata || {};
    const department = metadata.department || {};
    const vatPerc = number(metadata.vatPerc, NaN);
    if (!department.id || !Number.isFinite(vatPerc)) {
      throw new IntegrationMappingError(`La mappatura Tilby di “${item.nameSnapshot}” non contiene reparto e IVA.`, {
        code: "INTEGRATION_MAPPING_INCOMPLETE",
        details: [{ entityType: "menu_item", localId: item.menuItemId || "__extra__" }],
      });
    }
    const unitPrice = item.isComplimentary ? 0 : money(item.priceSnapshot);
    return {
      department: { id: numericOrString(department.id), vat_id: numericOrString(department.vat_id) },
      department_id: numericOrString(department.id),
      department_name: clean(department.name || "Reparto"),
      vat_perc: vatPerc,
      item_id: metadata.itemId ? numericOrString(metadata.itemId) : undefined,
      name: clean(item.nameSnapshot, 255),
      notes: clean(item.notes, 500) || null,
      price: unitPrice,
      final_price: unitPrice,
      final_net_price: money(unitPrice / (1 + vatPerc / 100)),
      quantity: number(item.quantity, 1),
      type: unitPrice === 0 ? "gift" : "sale",
      seller_id: sellerId,
      seller_name: sellerName,
      sku: clean(metadata.sku) || undefined,
      uuid: deterministicUuid(`ordynora:sale-item:${item.id}`),
      price_changes: [],
    };
  });

  if (context.cover) {
    const metadata = context.cover.metadata || {};
    const department = metadata.department || {};
    const vatPerc = number(metadata.vatPerc, NaN);
    if (!department.id || !Number.isFinite(vatPerc)) {
      throw new IntegrationMappingError("La mappatura Tilby del coperto non contiene reparto e IVA.", {
        code: "INTEGRATION_MAPPING_INCOMPLETE",
        details: [{ entityType: "menu_item", localId: "__cover__" }],
      });
    }
    const quantity = order.coverChargePerGuest ? number(order.guestCount, 1) : 1;
    const unitPrice = money(order.coverCharge);
    saleItems.push({
      department: { id: numericOrString(department.id), vat_id: numericOrString(department.vat_id) },
      department_id: numericOrString(department.id),
      department_name: clean(department.name || "Reparto"),
      vat_perc: vatPerc,
      item_id: metadata.itemId ? numericOrString(metadata.itemId) : undefined,
      name: "Coperto",
      price: unitPrice,
      final_price: unitPrice,
      final_net_price: money(unitPrice / (1 + vatPerc / 100)),
      quantity,
      type: "sale",
      seller_id: sellerId,
      seller_name: sellerName,
      uuid: deterministicUuid(`ordynora:cover:${order.id}`),
      price_changes: [],
    });
  }

  const tableMeta = context.table.metadata || {};
  const amount = money(saleItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const discount = money(Math.max(0, Math.min(amount, number(order.discountAmount))));
  const discountFactor = amount > 0 ? (amount - discount) / amount : 1;
  const discountedItems = saleItems.map((item) => {
    const finalPrice = decimal(item.price * discountFactor);
    return {
      ...item,
      final_price: finalPrice,
      final_net_price: decimal(finalPrice / (1 + item.vat_perc / 100)),
    };
  });
  const finalAmount = money(discountedItems.reduce(
    (sum, item) => sum + item.final_price * item.quantity,
    0
  ));
  const finalNetAmount = money(discountedItems.reduce(
    (sum, item) => sum + item.final_net_price * item.quantity,
    0
  ));
  const tableId = tableMeta.tableId ?? context.table.externalId;
  const tableName = clean(tableMeta.tableName || order.table?.name, 25);
  const roomId = tableMeta.roomId;
  const roomName = clean(tableMeta.roomName, 25);
  const missingTableFields = [
    ["tableId", tableId],
    ["tableName", tableName],
    ["roomId", roomId],
    ["roomName", roomName],
  ].filter(([, value]) => value === undefined || value === null || clean(value) === "").map(([key]) => key);
  if (missingTableFields.length) {
    throw new IntegrationMappingError("La mappatura Tilby del tavolo non contiene sala e tavolo completi.", {
      code: "INTEGRATION_MAPPING_INCOMPLETE",
      details: [{ entityType: "table", localId: order.tableId, missing: missingTableFields }],
    });
  }
  return {
    uuid: deterministicUuid(`ordynora:sale:${order.id}`),
    external_id: `ordynora:${order.id}`,
    currency: order.restaurant?.currency || "EUR",
    name: clean(`Ordynora ${order.orderNumber || order.id}`, 30),
    open_at: new Date(order.createdAt || Date.now()).toISOString(),
    seller_id: sellerId,
    seller_name: sellerName,
    status: "open",
    order_type: "normal",
    covers: number(order.guestCount, 1),
    table_id: numericOrString(tableId),
    table_name: tableName,
    room_id: numericOrString(roomId),
    room_name: roomName,
    tables: [{
      table_id: numericOrString(tableId),
      table_name: tableName,
      room_id: numericOrString(roomId),
      room_name: roomName,
    }],
    notes: clean([order.notes, `Ordynora ${order.id}`].filter(Boolean).join(" · "), 1000),
    amount,
    final_amount: finalAmount,
    final_net_amount: finalNetAmount,
    price_changes: discount > 0
      ? [{ description: "Sconto Ordynora", index: 0, type: "discount_fix", value: discount }]
      : [],
    sale_items: discountedItems,
  };
}

async function findTilbySale(client, saleUuid) {
  const { body } = await client.request(`/sales?pagination=true&per_page=2&page=0&uuid=${encodeURIComponent(saleUuid)}`);
  return list(body, "results").find((sale) => sale?.uuid === saleUuid) || null;
}

async function getTilbySale(client, saleId) {
  const { body, status } = await client.request(
    `/sales/${encodeURIComponent(saleId)}`,
    {},
    { acceptedStatuses: [404] }
  );
  return status === 404 ? null : (body?.sale || body);
}

function mergeTilbySale(current, payload) {
  if (!current || typeof current !== "object") return payload;
  const itemsByUuid = new Map(list(current.sale_items).map((item) => [item.uuid, item]));
  return {
    ...payload,
    sale_items: payload.sale_items.map((item) => ({ ...(itemsByUuid.get(item.uuid) || {}), ...item })),
  };
}

function assertTilbySaleEditable(sale) {
  if (!sale) return;
  const paidOrDocumented = list(sale.payments).length > 0 || list(sale.sale_documents).length > 0;
  if ((sale.status && sale.status !== "open") || sale.closed_at || paidOrDocumented) {
    throw new IntegrationMappingError(
      "La vendita Tilby è già chiusa, pagata o contiene documenti. Non viene riaperta né modificata: verifica il conto nel gestionale.",
      { code: "TILBY_SALE_LOCKED_IN_POS" }
    );
  }
}

async function upsertTilbyOrder({ credentials, order, mappings, externalId, options }) {
  const client = createTilbyClient(credentials, options);
  const payload = tilbySalePayload(order, mappings);
  let current = externalId ? await getTilbySale(client, externalId) : await findTilbySale(client, payload.uuid);
  if (!current && externalId) current = await findTilbySale(client, payload.uuid);
  if (current?.id) {
    assertTilbySaleEditable(current);
    const { body } = await client.request(`/sales/${encodeURIComponent(current.id)}`, {
      method: "PUT",
      body: JSON.stringify(mergeTilbySale(current, payload)),
    });
    return { externalId: clean(body?.id ?? current.id), action: "updated", providerUuid: payload.uuid };
  }
  try {
    const { body } = await client.request("/sales", { method: "POST", body: JSON.stringify(payload) });
    const createdId = clean(body?.id ?? body?.sale?.id);
    if (!createdId) {
      throw new PosConnectionError("Tilby non ha restituito l'identificativo della vendita. L'invio verrà riconciliato prima di riprovare.", {
        code: "TILBY_SALE_ID_MISSING", retryable: true,
      });
    }
    return { externalId: createdId, action: "created", providerUuid: payload.uuid };
  } catch (error) {
    if (![409, 422].includes(error?.providerStatus)) throw error;
    current = await findTilbySale(client, payload.uuid);
    if (!current?.id) throw error;
    assertTilbySaleEditable(current);
    const { body } = await client.request(`/sales/${encodeURIComponent(current.id)}`, {
      method: "PUT",
      body: JSON.stringify(mergeTilbySale(current, payload)),
    });
    return { externalId: clean(body?.id ?? current.id), action: "reconciled", providerUuid: payload.uuid };
  }
}

async function deleteTilbyOrder({ credentials, order, externalId, options }) {
  const client = createTilbyClient(credentials, options);
  const saleUuid = deterministicUuid(`ordynora:sale:${order.id}`);
  const current = externalId ? await getTilbySale(client, externalId) : await findTilbySale(client, saleUuid);
  if (!current?.id) return { externalId: null, action: "already_absent", providerUuid: saleUuid };
  assertTilbySaleEditable(current);
  const response = await client.request(
    `/sales/${encodeURIComponent(current.id)}`,
    { method: "DELETE" },
    { acceptedStatuses: [404] }
  );
  return {
    externalId: clean(current.id),
    action: response.status === 404 ? "already_absent" : "deleted",
    providerUuid: saleUuid,
  };
}

function cassaRows(order, mappings) {
  const context = ensureOrderCanExport(order, mappings);
  const grossAmount = money([
    ...context.items.map(({ item }) => (item.isComplimentary ? 0 : number(item.priceSnapshot) * number(item.quantity, 1))),
    context.coverTotal,
  ].reduce((sum, value) => sum + value, 0));
  const discount = money(Math.max(0, Math.min(grossAmount, number(order.discountAmount))));
  const percentageVariation = grossAmount > 0 && discount > 0
    ? decimal((discount / grossAmount) * 100)
    : null;

  function productReference(metadata) {
    const idProductVariant = clean(metadata.idProductVariant);
    if (idProductVariant) return { idProductVariant };
    return {};
  }

  function validateMetadata(metadata, label, localId) {
    const missing = [];
    if (!clean(metadata.idProductVariant)) missing.push("idProductVariant");
    if (!clean(metadata.idDepartment)) missing.push("idDepartment");
    if (!clean(metadata.idTax)) missing.push("idTax");
    if (missing.length) {
      throw new IntegrationMappingError(label, {
        code: "INTEGRATION_MAPPING_INCOMPLETE",
        details: [{ entityType: "menu_item", localId, missing }],
      });
    }
  }

  const rows = context.items.map(({ item, mapping }, index) => {
    const metadata = mapping.metadata || {};
    validateMetadata(
      metadata,
      `La mappatura Cassa in Cloud di “${item.nameSnapshot}” è incompleta.`,
      item.menuItemId || "__extra__"
    );
    return {
      rowNumber: index + 1,
      ...productReference(metadata),
      idDepartment: clean(metadata.idDepartment),
      idTax: clean(metadata.idTax),
      ...(clean(metadata.idSalesMode) ? { idSalesMode: clean(metadata.idSalesMode) } : {}),
      quantity: number(item.quantity, 1),
      price: item.isComplimentary ? 0 : money(item.priceSnapshot),
      note: clean(item.notes, 500) || undefined,
      subtotal: false,
      shippingCost: false,
      menu: false,
      composition: false,
    };
  });
  if (context.cover) {
    const metadata = context.cover.metadata || {};
    validateMetadata(metadata, "La mappatura Cassa in Cloud del coperto è incompleta.", "__cover__");
    rows.push({
      rowNumber: rows.length + 1,
      ...productReference(metadata),
      idDepartment: clean(metadata.idDepartment),
      idTax: clean(metadata.idTax),
      ...(clean(metadata.idSalesMode) ? { idSalesMode: clean(metadata.idSalesMode) } : {}),
      quantity: order.coverChargePerGuest ? number(order.guestCount, 1) : 1,
      price: money(order.coverCharge),
      subtotal: false,
      shippingCost: false,
      menu: false,
      composition: false,
    });
  }
  if (percentageVariation) {
    rows.push({
      rowNumber: rows.length + 1,
      subtotal: true,
      shippingCost: false,
      menu: false,
      composition: false,
      percentageVariation: -percentageVariation,
      variationType: "CUSTOMER",
      note: "Sconto Ordynora",
    });
  }
  return { rows, tableMapping: context.table };
}

function cassaOrderPayload(order, mappings, config) {
  const salesPointId = clean(config?.salesPointId);
  if (!salesPointId) {
    throw new IntegrationMappingError("Seleziona il punto vendita Cassa in Cloud prima di attivare la sincronizzazione.", {
      code: "INTEGRATION_SALES_POINT_REQUIRED",
    });
  }
  const { rows, tableMapping } = cassaRows(order, mappings);
  const dueMinutes = Math.max(5, Math.min(120, number(config?.dueMinutes, 15)));
  const createdAt = Date.now();
  return {
    externalId: `ordynora:${order.id}`,
    internalWorkflowStatus: "PENDING",
    isExternalOrder: true,
    status: "NOT_PROCESSED",
    date: createdAt,
    dueDate: createdAt + dueMinutes * 60 * 1000,
    deliveryMode: "TABLE",
    idTable: clean(tableMapping.metadata?.tableId ?? tableMapping.externalId),
    deliveryChannel: ORDYNORA_CHANNEL,
    prepay: false,
    document: {
      idSalesPoint: numericOrString(salesPointId),
      amount: money(order.totalAmount),
      note: clean(order.notes, 1000) || undefined,
      description: clean(`Ordynora · ${order.table?.name || "Tavolo"} · ordine ${order.orderNumber}`, 500),
      rows,
    },
  };
}

async function findCassaOrder(client, order, config) {
  const createdAt = new Date(order.createdAt || Date.now()).getTime();
  const from = String(createdAt - 24 * 60 * 60 * 1000);
  const to = String(createdAt + 47 * 60 * 60 * 1000);
  const salesPointId = clean(config?.salesPointId);
  const externalId = `ordynora:${order.id}`;
  for (let start = 0; start < MAX_REMOTE_RECORDS; start += 100) {
    const query = new URLSearchParams({
      start: String(start),
      limit: "100",
      datetimeFrom: from,
      datetimeTo: to,
      calculatedAmount: "true",
    });
    if (salesPointId) query.set("idsSalesPoint", salesPointId);
    const { body } = await client.request(`/documents/orders?${query.toString()}`);
    const rows = list(body, "orders");
    const match = rows.find((row) => row?.externalId === externalId);
    if (match) return match;
    const totalCount = Number(body?.totalCount);
    if (rows.length < 100 || (Number.isFinite(totalCount) && start + rows.length >= totalCount)) break;
  }
  return null;
}

async function createCassaOrder({ credentials, config, order, mappings, externalId, options }) {
  const client = await createCassaClient(credentials, options);
  if (externalId) return { externalId: clean(externalId), action: "already_exported" };
  let current = await findCassaOrder(client, order, config);
  if (current?.id) return { externalId: clean(current.id), action: "reconciled" };
  const payload = cassaOrderPayload(order, mappings, config);
  try {
    const { body } = await client.request("/documents/orders/batch", {
      method: "POST",
      body: JSON.stringify({ create: [payload] }),
    });
    const errorDetail = list(body?.batchError, "createErrorDetails")[0]
      || list(body, "createErrorDetails")[0];
    if (errorDetail) {
      throw new IntegrationMappingError(
        `Cassa in Cloud ha rifiutato la comanda: ${clean(errorDetail.msg || "dati non validi", 300)}`,
        { code: "CASSA_ORDER_REJECTED", details: [{ externalId: payload.externalId }] }
      );
    }
    const detail = list(body?.batchResponse, "createDetails")[0]
      || list(body, "createDetails")[0];
    if (!detail?.id) {
      throw new PosConnectionError("Cassa in Cloud non ha restituito l'identificativo della comanda creata.", {
        code: "CASSA_ORDER_ID_MISSING",
        retryable: true,
      });
    }
    return { externalId: clean(detail.id), action: "created", providerExternalId: payload.externalId };
  } catch (error) {
    if (![409, 422].includes(error?.providerStatus)) throw error;
    current = await findCassaOrder(client, order, config);
    if (!current?.id) throw error;
    return { externalId: clean(current.id), action: "reconciled", providerExternalId: payload.externalId };
  }
}

export async function executeProviderOrderOperation(provider, {
  operation,
  credentials,
  config,
  order,
  mappings,
  externalId = null,
  fetchImpl = globalThis.fetch,
  timeoutMs,
  beforeRequest,
} = {}) {
  const options = { fetchImpl, timeoutMs, beforeRequest };
  if (provider === "tilby") {
    if (operation === "delete_order") {
      return deleteTilbyOrder({ credentials, order, externalId, options });
    }
    return upsertTilbyOrder({ credentials, order, mappings, externalId, options });
  }
  if (provider === "teamsystem_cassa_in_cloud") {
    if (operation === "delete_order") {
      throw new IntegrationMappingError(
        "La comanda è già in Cassa in Cloud: annullala dal gestionale per mantenere coerente la parte fiscale.",
        { code: "CASSA_DELETE_IN_POS_REQUIRED" }
      );
    }
    return createCassaOrder({ credentials, config, order, mappings, externalId, options });
  }
  throw new IntegrationMappingError("Connettore automatico non disponibile", {
    code: "INTEGRATION_PROVIDER_UNSUPPORTED",
  });
}
