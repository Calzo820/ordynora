const HEADER_ALIASES = {
  name: ["name", "nome", "prodotto", "piatto"],
  shortDescription: ["shortdescription", "descrizione", "descrizionebreve", "ingredienti"],
  price: ["price", "prezzo"],
  costPrice: ["costprice", "costo", "costomateriaprima"],
  category: ["category", "categoria"],
  preparationArea: ["preparationarea", "area", "reparto", "stazione"],
  allergens: ["allergens", "allergeni"],
  vatRate: ["vatrate", "iva", "aliquotaiva"],
  isAvailable: ["isavailable", "disponibile", "attivo"],
  imageUrl: ["imageurl", "immagine", "foto"],
};

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function parseNumber(value) {
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return normalized === "" ? null : Number(normalized);
}

function parseBoolean(value, fallback = true) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return !["0", "no", "false", "non", "off"].includes(normalized);
}

function normalizeArea(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["bar", "bevande", "drink", "cocktail"].includes(normalized)) return "bar";
  return "kitchen";
}

export function parseMenuCsv(source) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = splitCsv(text, delimiter);
  if (rows.length < 2) return { items: [], errors: ["Il file non contiene righe prodotto."], delimiter };

  const headers = rows[0].map(normalizeHeader);
  const columnFor = (field) => headers.findIndex((header) => HEADER_ALIASES[field].includes(header));
  const columns = Object.fromEntries(Object.keys(HEADER_ALIASES).map((field) => [field, columnFor(field)]));
  const missing = ["name", "price"].filter((field) => columns[field] < 0);
  if (missing.length) {
    return { items: [], errors: [`Colonne obbligatorie mancanti: ${missing.join(", ")}.`], delimiter };
  }

  const items = [];
  const errors = [];
  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const value = (field) => columns[field] >= 0 ? row[columns[field]] : "";
    const name = value("name").trim();
    const price = parseNumber(value("price"));
    const costPrice = parseNumber(value("costPrice"));
    const vatRate = parseNumber(value("vatRate"));
    if (!name) errors.push(`Riga ${line}: nome mancante.`);
    if (!Number.isFinite(price) || price <= 0) errors.push(`Riga ${line}: prezzo non valido.`);
    if (!name || !Number.isFinite(price) || price <= 0) return;
    items.push({
      name,
      shortDescription: value("shortDescription").trim(),
      description: value("shortDescription").trim(),
      price,
      ...(Number.isFinite(costPrice) && costPrice >= 0 ? { costPrice } : {}),
      category: value("category").trim() || "Menu",
      preparationArea: normalizeArea(value("preparationArea")),
      allergens: value("allergens").split(/[|,]/).map((item) => item.trim()).filter(Boolean),
      vatRate: Number.isFinite(vatRate) ? vatRate : 10,
      isAvailable: parseBoolean(value("isAvailable"), true),
      imageUrl: value("imageUrl").trim(),
    });
  });

  if (items.length > 500) errors.push("Il file supera il limite di 500 prodotti per importazione.");
  return { items: items.slice(0, 500), errors, delimiter };
}

export const MENU_IMPORT_TEMPLATE = [
  "nome;descrizione;prezzo;categoria;reparto;allergeni;iva;disponibile;costo",
  "Carbonara;Guanciale, uova e pecorino;13,00;Primi;cucina;glutine|uova|latte;10;si;4,20",
  "Acqua naturale;Bottiglia 75cl;2,50;Bevande;bar;;22;si;0,60",
].join("\n");
