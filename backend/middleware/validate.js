const DEFAULT_LIMITS = {
  string: 500,
  notes: 1000,
  name: 120,
  items: 80,
};

function text(value, max = DEFAULT_LIMITS.string) {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
  return clean || null;
}

function positiveInt(value, max = 99) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1) return null;
  return Math.min(i, max);
}

function bad(res, message, details = {}) {
  return res.status(400).json({ message, details });
}

export function validatePublicOrderPayload(req, res, next) {
  const body = req.body || {};
  const restaurantSlug = text(body.restaurantSlug, 120);
  const tableToken = text(body.tableToken, 160);
  const items = Array.isArray(body.items) ? body.items.slice(0, DEFAULT_LIMITS.items) : [];

  if (!restaurantSlug || !tableToken) return bad(res, "restaurantSlug e tableToken sono obbligatori");
  if (!items.length) return bad(res, "L'ordine deve contenere almeno un articolo");

  const normalizedItems = items
    .map((item) => ({
      menuItemId: text(item?.menuItemId, 120),
      quantity: positiveInt(item?.quantity, 50),
      notes: text(item?.notes, 300),
      courseNumber: positiveInt(item?.courseNumber ?? 1, 4) || 1,
    }))
    .filter((item) => item.menuItemId && item.quantity);

  if (!normalizedItems.length) return bad(res, "Nessun articolo valido nell'ordine");

  req.body = {
    ...body,
    restaurantSlug,
    tableToken,
    customerName: text(body.customerName, DEFAULT_LIMITS.name),
    notes: text(body.notes, DEFAULT_LIMITS.notes),
    clientRequestId: text(body.clientRequestId, 120),
    items: normalizedItems,
  };
  return next();
}

export function validateOrderStatusPayload(req, res, next) {
  const allowed = new Set(["pending", "in_progress", "ready", "served", "cancelled"]);
  const status = text(req.body?.status, 40);
  if (!status || !allowed.has(status)) return bad(res, "Status ordine non valido", { allowed: [...allowed] });
  req.body = { ...req.body, status };
  return next();
}

export function validateExtraPayload(req, res, next) {
  const name = text(req.body?.name, DEFAULT_LIMITS.name);
  const price = Number(req.body?.price);
  const quantity = positiveInt(req.body?.quantity ?? 1, 50) || 1;
  if (!name || !Number.isFinite(price) || price < 0 || price > 9999) {
    return bad(res, "Nome e prezzo extra sono obbligatori");
  }
  req.body = { ...req.body, name, price, quantity };
  return next();
}
