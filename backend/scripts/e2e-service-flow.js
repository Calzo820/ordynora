const apiUrl = String(process.env.E2E_API_URL || "http://localhost:5000").replace(/\/$/, "");
const password = process.env.E2E_PASSWORD || "Ordynora2026!";
const ownerEmail = process.env.E2E_OWNER_EMAIL || "owner@demo.test";
const kitchenEmail = process.env.E2E_KITCHEN_EMAIL || "cucina@demo.test";
const barEmail = process.env.E2E_BAR_EMAIL || "bar@demo.test";
const waiterEmail = process.env.E2E_WAITER_EMAIL || "sala@demo.test";
const cashierEmail = process.env.E2E_CASHIER_EMAIL || "cassa@demo.test";

if (String(process.env.E2E_ALLOW_WRITE || "").toLowerCase() !== "true") {
  console.error("Test annullato: imposta E2E_ALLOW_WRITE=true solo su un ambiente demo.");
  process.exit(2);
}

async function request(path, { method = "GET", token, body, idempotencyKey } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${data?.message || response.status}`);
  return data;
}

async function login(email) {
  const result = await request("/auth/login", { method: "POST", body: { email, password } });
  if (!result?.token) throw new Error(`Login incompleto per ${email}`);
  return result;
}

let ownerToken = "";
try {
  await request("/ready");
  if (String(process.env.E2E_PREPARE_DEMO || "").toLowerCase() === "true") {
    await request("/demo/ensure", { method: "POST", body: {} });
  }

  const owner = await login(ownerEmail);
  ownerToken = owner.token;
  const [tablesResult, menuResult] = await Promise.all([
    request("/tables", { token: ownerToken }),
    request("/menu", { token: ownerToken }),
  ]);
  const tables = Array.isArray(tablesResult) ? tablesResult : tablesResult?.tables || [];
  const menu = Array.isArray(menuResult) ? menuResult : menuResult?.items || [];
  const table = tables.find((item) => item.isActive !== false && item.qrToken);
  const kitchenProduct = menu.find((item) => item.isAvailable !== false && item.isDeleted !== true && item.preparationArea === "kitchen");
  const barProduct = menu.find((item) => item.isAvailable !== false && item.isDeleted !== true && item.preparationArea === "bar");
  if (!table || !kitchenProduct || !barProduct || !owner.restaurant?.slug) {
    throw new Error("Demo incompleta: servono ristorante, tavolo, un prodotto cucina e un prodotto bar.");
  }

  const flowId = `e2e-${Date.now()}`;
  const created = await request("/orders/public", {
    method: "POST",
    body: {
      restaurantSlug: owner.restaurant.slug,
      tableToken: table.qrToken,
      customerName: "Test automatico Ordynora",
      notes: `Test automatico ${flowId} su database staging dedicato`,
      clientRequestId: flowId,
      items: [
        { menuItemId: kitchenProduct.id, quantity: 1, courseNumber: 2 },
        { menuItemId: barProduct.id, quantity: 1, courseNumber: 1 },
      ],
    },
    idempotencyKey: flowId,
  });
  const createdOrderId = created?.order?.id;
  if (!createdOrderId) throw new Error("Ordine di test non creato.");

  const duplicate = await request("/orders/public", {
    method: "POST",
    body: {
      restaurantSlug: owner.restaurant.slug,
      tableToken: table.qrToken,
      clientRequestId: flowId,
      items: [{ menuItemId: kitchenProduct.id, quantity: 1 }],
    },
    idempotencyKey: flowId,
  });
  if (duplicate?.order?.id !== createdOrderId) throw new Error("L'idempotenza dell'ordine cliente non ha bloccato il duplicato.");

  const bar = await login(barEmail);
  await request(`/orders/${createdOrderId}/status`, { method: "PATCH", token: bar.token, body: { status: "in_progress" } });
  await request(`/orders/${createdOrderId}/status`, { method: "PATCH", token: bar.token, body: { status: "ready" } });

  const waiter = await login(waiterEmail);
  const releasedCourse = await request(`/orders/${createdOrderId}/courses/2/release`, {
    method: "POST",
    token: waiter.token,
    body: {},
  });
  if (releasedCourse?.courseNumber !== 2) throw new Error("La seconda portata non è stata inviata dalla sala.");

  const kitchen = await login(kitchenEmail);
  await request(`/orders/${createdOrderId}/status`, { method: "PATCH", token: kitchen.token, body: { status: "in_progress" } });
  await request(`/orders/${createdOrderId}/status`, { method: "PATCH", token: kitchen.token, body: { status: "ready" } });

  await request(`/orders/${createdOrderId}/status`, { method: "PATCH", token: waiter.token, body: { status: "served" } });

  const cashier = await login(cashierEmail);
  const depositKey = `deposit:${flowId}`;
  await request(`/orders/${createdOrderId}/payments`, {
    method: "POST",
    token: cashier.token,
    idempotencyKey: depositKey,
    body: { method: "cash", amount: 1, label: "Acconto E2E", clientRequestId: depositKey },
  });
  const duplicateDeposit = await request(`/orders/${createdOrderId}/payments`, {
    method: "POST",
    token: cashier.token,
    idempotencyKey: depositKey,
    body: { method: "cash", amount: 1, label: "Acconto E2E", clientRequestId: depositKey },
  });
  if (!duplicateDeposit?.alreadyProcessed) throw new Error("L'idempotenza dell'acconto non ha bloccato il duplicato.");

  const closeKey = `close:${flowId}`;
  await request(`/orders/${createdOrderId}/close`, {
    method: "POST",
    token: cashier.token,
    idempotencyKey: closeKey,
    body: { paymentMethod: "card", discount: 0, extra: 0, clientRequestId: closeKey },
  });
  const duplicateClose = await request(`/orders/${createdOrderId}/close`, {
    method: "POST",
    token: cashier.token,
    idempotencyKey: closeKey,
    body: { paymentMethod: "card", clientRequestId: closeKey },
  });
  if (!duplicateClose?.alreadyProcessed) throw new Error("L'idempotenza della chiusura non ha bloccato il duplicato.");

  const history = await request("/orders?history=true", { token: ownerToken });
  const historyRows = Array.isArray(history) ? history : history?.orders || [];
  const completed = historyRows.find((order) => order.id === createdOrderId);
  if (!completed || completed.status !== "served" || completed.paymentStatus !== "paid") {
    throw new Error("Chiusura in cassa non confermata nello storico.");
  }

  await request("/analytics/summary?days=7", { token: ownerToken });
  await request("/cash/summary", { token: cashier.token });
  console.log(JSON.stringify({
    ok: true,
    steps: ["backend", "login e ruoli", "menu e tavolo", "ordine cliente", "anti-duplicato", "bar", "chiamata seconda portata", "cucina", "consegna cameriere", "acconto", "conto", "pagamento", "chiusura", "storico", "statistiche", "riepilogo cassa"],
    orderId: createdOrderId,
    note: "Il record resta nel database staging come evidenza del test; usa un database E2E dedicato.",
  }, null, 2));
} catch (error) {
  console.error(`TEST SERVIZIO FALLITO: ${error.message}`);
  process.exitCode = 1;
}
