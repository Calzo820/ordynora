import bcrypt from "bcrypt";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";

const DEMO_PASSWORD = "Ordynora2026!";
const RESTAURANT_SLUG = "demo";
const LEGACY_RESTAURANT_SLUG = "demo-restaurant";
const DEMO_TABLE_TOKEN_PREFIX = "demo-table";

function svgDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function demoLogo() {
  return svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="g" x1="80" x2="560" y1="80" y2="560" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0f172a"/>
      <stop offset=".56" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" rx="148" fill="url(#g)"/>
  <circle cx="320" cy="244" r="118" fill="#fffaf0"/>
  <path d="M206 362h228c18 0 32 14 32 32v12H174v-12c0-18 14-32 32-32Z" fill="#fffaf0"/>
  <path d="M230 250c36 46 144 46 180 0" fill="none" stroke="#0f172a" stroke-width="22" stroke-linecap="round"/>
  <path d="M260 176v76M304 168v84M348 176v76" stroke="#0f172a" stroke-width="16" stroke-linecap="round"/>
  <text x="320" y="514" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="#fffaf0">DEMO BISTRO</text>
</svg>`);
}

function dishImage(title, subtitle, colors) {
  const [bg, plate, accent, dark] = colors;
  return svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="${bg}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#020617" flood-opacity=".28"/>
    </filter>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)"/>
  <circle cx="1010" cy="130" r="170" fill="#ffffff" opacity=".13"/>
  <circle cx="160" cy="690" r="220" fill="#ffffff" opacity=".10"/>
  <ellipse cx="600" cy="408" rx="330" ry="210" fill="#fffaf0" filter="url(#shadow)"/>
  <ellipse cx="600" cy="408" rx="245" ry="148" fill="${plate}" opacity=".92"/>
  <circle cx="482" cy="368" r="58" fill="${accent}" opacity=".92"/>
  <circle cx="622" cy="446" r="74" fill="#f8fafc" opacity=".78"/>
  <circle cx="712" cy="346" r="48" fill="${accent}" opacity=".75"/>
  <path d="M424 478c92 58 260 50 348-18" fill="none" stroke="${dark}" stroke-width="24" stroke-linecap="round" opacity=".58"/>
  <path d="M492 298c58-34 146-34 210 0" fill="none" stroke="#fffaf0" stroke-width="18" stroke-linecap="round" opacity=".72"/>
  <text x="600" y="704" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="900" fill="#ffffff">${title}</text>
  <text x="600" y="752" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff" opacity=".82">${subtitle}</text>
</svg>`);
}

const imageThemes = {
  antipasto: ["#164e63", "#fef3c7", "#fb923c", "#0f172a"],
  primo: ["#7c2d12", "#fed7aa", "#f97316", "#431407"],
  pesce: ["#075985", "#bae6fd", "#22d3ee", "#082f49"],
  carne: ["#7f1d1d", "#fecaca", "#ef4444", "#450a0a"],
  vegetariano: ["#166534", "#dcfce7", "#22c55e", "#052e16"],
  dolce: ["#7e22ce", "#f3e8ff", "#f59e0b", "#3b0764"],
  drink: ["#0f766e", "#ccfbf1", "#14b8a6", "#042f2e"],
  vino: ["#881337", "#ffe4e6", "#e11d48", "#4c0519"],
};

const demoMenuItems = [
  {
    id: "demo-antipasto-1",
    name: "Tartare mediterranea",
    description: "Manzo battuto al coltello, capperi, limone, olio EVO e chips croccanti.",
    price: 14,
    category: "Antipasti",
    preparationArea: "kitchen",
    sortOrder: 1,
    imageUrl: dishImage("Tartare", "Antipasti", imageThemes.antipasto),
    allergens: ["senape"],
    isFeatured: true,
  },
  {
    id: "demo-antipasto-2",
    name: "Burrata e pomodorini confit",
    description: "Burrata fresca, pomodorini confit, basilico e pane tostato.",
    price: 11,
    category: "Antipasti",
    preparationArea: "kitchen",
    sortOrder: 2,
    imageUrl: dishImage("Burrata", "Antipasti", imageThemes.vegetariano),
    allergens: ["latte", "glutine"],
    isFeatured: true,
  },
  {
    id: "demo-antipasto-3",
    name: "Calamaro croccante",
    description: "Calamaro fritto leggero, maionese al lime e insalata di campo.",
    price: 13,
    category: "Antipasti",
    preparationArea: "kitchen",
    sortOrder: 3,
    imageUrl: dishImage("Calamaro", "Antipasti", imageThemes.pesce),
    allergens: ["glutine", "molluschi", "uova"],
  },
  {
    id: "demo-primo-1",
    name: "Carbonara croccante",
    description: "Rigatoni, guanciale, pecorino romano, uovo e pepe tostato.",
    price: 13,
    category: "Primi",
    preparationArea: "kitchen",
    sortOrder: 4,
    imageUrl: dishImage("Carbonara", "Primi", imageThemes.primo),
    allergens: ["glutine", "uova", "latte"],
    isFeatured: true,
  },
  {
    id: "demo-primo-2",
    name: "Risotto limone e gambero",
    description: "Riso mantecato, limone, gambero rosso e polvere di cappero.",
    price: 18,
    category: "Primi",
    preparationArea: "kitchen",
    sortOrder: 5,
    imageUrl: dishImage("Risotto", "Primi", imageThemes.pesce),
    allergens: ["crostacei", "latte"],
    isFeatured: true,
  },
  {
    id: "demo-primo-3",
    name: "Pacchero al ragu bianco",
    description: "Pacchero, vitello, rosmarino, fondo bruno e parmigiano.",
    price: 15,
    category: "Primi",
    preparationArea: "kitchen",
    sortOrder: 6,
    imageUrl: dishImage("Pacchero", "Primi", imageThemes.carne),
    allergens: ["glutine", "latte"],
  },
  {
    id: "demo-secondo-1",
    name: "Filetto al pepe verde",
    description: "Filetto di manzo, salsa al pepe verde e patata fondente.",
    price: 24,
    category: "Secondi",
    preparationArea: "kitchen",
    sortOrder: 7,
    imageUrl: dishImage("Filetto", "Secondi", imageThemes.carne),
    allergens: ["latte"],
    isFeatured: true,
  },
  {
    id: "demo-secondo-2",
    name: "Branzino alle erbe",
    description: "Branzino, erbe fini, verdure arrosto e salsa agrumata.",
    price: 21,
    category: "Secondi",
    preparationArea: "kitchen",
    sortOrder: 8,
    imageUrl: dishImage("Branzino", "Secondi", imageThemes.pesce),
    allergens: ["pesce"],
    isFeatured: true,
  },
  {
    id: "demo-secondo-3",
    name: "Parmigiana leggera",
    description: "Melanzana, pomodoro San Marzano, provola e basilico.",
    price: 12,
    category: "Secondi",
    preparationArea: "kitchen",
    sortOrder: 9,
    imageUrl: dishImage("Parmigiana", "Secondi", imageThemes.vegetariano),
    allergens: ["latte"],
  },
  {
    id: "demo-contorno-1",
    name: "Patate fondenti",
    description: "Patate, burro chiarificato, rosmarino e sale affumicato.",
    price: 5,
    category: "Contorni",
    preparationArea: "kitchen",
    sortOrder: 10,
    imageUrl: dishImage("Patate", "Contorni", imageThemes.primo),
    allergens: ["latte"],
  },
  {
    id: "demo-contorno-2",
    name: "Verdure di stagione",
    description: "Verdure grigliate, olio EVO e vinaigrette alle erbe.",
    price: 6,
    category: "Contorni",
    preparationArea: "kitchen",
    sortOrder: 11,
    imageUrl: dishImage("Verdure", "Contorni", imageThemes.vegetariano),
    allergens: [],
  },
  {
    id: "demo-dolce-1",
    name: "Tiramisù espresso",
    description: "Mascarpone, caffè espresso, cacao e biscotto leggero.",
    price: 7,
    category: "Dolci",
    preparationArea: "kitchen",
    sortOrder: 12,
    imageUrl: dishImage("Tiramisù", "Dolci", imageThemes.dolce),
    allergens: ["glutine", "latte", "uova"],
    isFeatured: true,
  },
  {
    id: "demo-dolce-2",
    name: "Cheesecake agrumi",
    description: "Crema al formaggio, crumble e gel agli agrumi.",
    price: 7,
    category: "Dolci",
    preparationArea: "kitchen",
    sortOrder: 13,
    imageUrl: dishImage("Cheesecake", "Dolci", imageThemes.dolce),
    allergens: ["glutine", "latte", "uova"],
  },
  {
    id: "demo-bar-1",
    name: "Acqua frizzante",
    description: "Bottiglia in vetro 75cl.",
    price: 2.5,
    category: "Bevande",
    preparationArea: "bar",
    sortOrder: 14,
    imageUrl: dishImage("Acqua", "Bevande", imageThemes.drink),
    allergens: [],
  },
  {
    id: "demo-bar-2",
    name: "Spritz Signature",
    description: "Aperol, prosecco, soda e arancia.",
    price: 8,
    category: "Cocktail",
    preparationArea: "bar",
    sortOrder: 15,
    imageUrl: dishImage("Spritz", "Cocktail", imageThemes.drink),
    allergens: ["solfiti"],
    isFeatured: true,
  },
  {
    id: "demo-bar-3",
    name: "Gin tonic botanico",
    description: "Gin dry, tonica premium, ginepro e scorza di limone.",
    price: 10,
    category: "Cocktail",
    preparationArea: "bar",
    sortOrder: 16,
    imageUrl: dishImage("Gin Tonic", "Cocktail", imageThemes.drink),
    allergens: [],
  },
  {
    id: "demo-vino-1",
    name: "Calice Etna rosso",
    description: "Selezione cantina, calice 12cl.",
    price: 7,
    category: "Vini",
    preparationArea: "bar",
    sortOrder: 17,
    imageUrl: dishImage("Etna Rosso", "Vini", imageThemes.vino),
    allergens: ["solfiti"],
  },
  {
    id: "demo-vino-2",
    name: "Calice Franciacorta",
    description: "Metodo classico, calice 10cl.",
    price: 9,
    category: "Vini",
    preparationArea: "bar",
    sortOrder: 18,
    imageUrl: dishImage("Franciacorta", "Vini", imageThemes.vino),
    allergens: ["solfiti"],
    isFeatured: true,
  },
  {
    id: "demo-special-1",
    name: "Polpo alla brace",
    description: "Polpo, crema di patate, paprika dolce e olio al prezzemolo.",
    price: 19,
    category: "Speciali",
    preparationArea: "kitchen",
    sortOrder: 19,
    imageUrl: dishImage("Polpo", "Speciali", imageThemes.pesce),
    allergens: ["molluschi"],
    isAvailable: false,
  },
  {
    id: "demo-special-2",
    name: "Menu degustazione Signature",
    description: "Percorso demo in tre portate con drink consigliato.",
    price: 34,
    category: "Speciali",
    preparationArea: "kitchen",
    sortOrder: 20,
    imageUrl: dishImage("Degustazione", "Speciali", imageThemes.antipasto),
    allergens: ["glutine", "latte", "uova"],
    isFeatured: true,
  },
];

function dateAt(daysFromToday, hour = 12, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function dateInDays(daysFromToday) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date;
}

function vatRateForCategory(category) {
  return ["Bevande", "Cocktail", "Vini"].includes(category) ? 22 : 10;
}

function orderTotal(items) {
  const byId = new Map(demoMenuItems.map((item) => [item.id, item]));
  return items.reduce((sum, item) => sum + Number(byId.get(item.menuItemId)?.price || 0) * item.quantity, 0);
}

function orderItemsData(items) {
  return items.map((item) => {
    const menuItem = demoMenuItems.find((menu) => menu.id === item.menuItemId);
    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      notes: item.notes || null,
      nameSnapshot: menuItem.name,
      priceSnapshot: menuItem.price,
      categorySnapshot: menuItem.category,
      preparationArea: menuItem.preparationArea,
      courseNumber: Number(item.courseNumber || 1),
      releasedAt: new Date(),
    };
  });
}

async function upsertDemoOrder({
  id,
  restaurantId,
  table,
  status,
  paymentStatus = "unpaid",
  paymentMethod = null,
  customerName,
  items,
  notes,
  createdAt = new Date(),
  closedAt = null,
  orderNumber = 1,
}) {
  if (!table) throw new Error(`Tavolo demo mancante per ordine ${id}`);

  const sessionId = `${id}-session`;
  const totalAmount = orderTotal(items);
  const sessionStatus = closedAt ? "closed" : paymentStatus === "pending" ? "closing" : "open";

  await prisma.tableSession.upsert({
    where: { id: sessionId },
    update: {
      restaurantId,
      tableId: table.id,
      status: sessionStatus,
      guestName: customerName,
      notes,
      totalAmount,
      openedAt: createdAt,
      closedAt,
    },
    create: {
      id: sessionId,
      restaurantId,
      tableId: table.id,
      status: sessionStatus,
      guestName: customerName,
      notes,
      totalAmount,
      openedAt: createdAt,
      closedAt,
    },
  });

  await prisma.orderItem.deleteMany({ where: { orderId: id } });
  await prisma.paymentTransaction.deleteMany({ where: { orderId: id } });

  const baseOrder = {
    restaurantId,
    tableId: table.id,
    tableSessionId: sessionId,
    customerName,
    notes,
    status,
    paymentStatus,
    paymentMethod,
    totalAmount,
    orderNumber,
    source: "qr",
    createdAt,
    updatedAt: closedAt || createdAt,
    acceptedAt: ["in_progress", "ready", "served"].includes(status) ? createdAt : null,
    readyAt: ["ready", "served"].includes(status) ? new Date(createdAt.getTime() + 10 * 60 * 1000) : null,
    servedAt: status === "served" ? closedAt || new Date(createdAt.getTime() + 24 * 60 * 1000) : null,
    closedAt,
    paidAt: paymentStatus === "paid" ? closedAt || createdAt : null,
  };

  await prisma.order.upsert({
    where: { id },
    update: {
      ...baseOrder,
      items: { create: orderItemsData(items) },
    },
    create: {
      id,
      publicToken: crypto.randomUUID(),
      ...baseOrder,
      items: { create: orderItemsData(items) },
    },
  });

  if (paymentStatus === "paid") {
    await prisma.paymentTransaction.create({
      data: {
        id: `${id}-payment`,
        restaurantId,
        orderId: id,
        provider: "demo",
        amount: totalAmount,
        currency: "EUR",
        status: "paid",
        paidAt: closedAt || createdAt,
        createdAt: closedAt || createdAt,
      },
    });
  }
}

async function resetDemoRestaurant(restaurantId) {
  await prisma.paymentTransaction.deleteMany({ where: { restaurantId } });
  await prisma.orderStatusHistory.deleteMany({ where: { order: { restaurantId } } });
  await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
  await prisma.order.deleteMany({ where: { restaurantId } });
  await prisma.tableSession.deleteMany({ where: { restaurantId } });
  await prisma.reservation.deleteMany({ where: { restaurantId } });
  await prisma.menuItem.deleteMany({ where: { restaurantId } });
  await prisma.table.deleteMany({ where: { restaurantId } });
  await prisma.errorLog.deleteMany({ where: { restaurantId } });
}

async function main() {
  console.log("Ricreo account demo completo Ordynora...");

  const legacy = await prisma.restaurant.findUnique({ where: { slug: LEGACY_RESTAURANT_SLUG } });
  if (legacy && legacy.slug !== RESTAURANT_SLUG) {
    await prisma.restaurant.delete({ where: { id: legacy.id } });
  }

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: RESTAURANT_SLUG },
    update: {
      name: "Ordynora Demo Bistro",
      logoUrl: demoLogo(),
      primaryColor: "#0f766e",
      currency: "EUR",
      isActive: true,
      plan: "growth",
      settingsJson: {
        onboarding: {
          autoSetupCompleted: true,
          importCompleted: true,
          qrPrinted: true,
          menuChecked: true,
          staffReady: true,
          demoComplete: true,
          updatedAt: new Date().toISOString(),
        },
      },
    },
    create: {
      name: "Ordynora Demo Bistro",
      slug: RESTAURANT_SLUG,
      logoUrl: demoLogo(),
      primaryColor: "#0f766e",
      currency: "EUR",
      isActive: true,
      plan: "growth",
      settingsJson: {
        onboarding: {
          autoSetupCompleted: true,
          importCompleted: true,
          qrPrinted: true,
          menuChecked: true,
          staffReady: true,
          demoComplete: true,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });

  await resetDemoRestaurant(restaurant.id);

  const demoAccessUntil = dateInDays(30);
  await prisma.saaSSubscription.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      plan: "growth",
      status: "trialing",
      trialEndsAt: demoAccessUntil,
      currentPeriodEnd: demoAccessUntil,
      cancelAtPeriodEnd: false,
    },
    create: {
      restaurantId: restaurant.id,
      plan: "growth",
      status: "trialing",
      trialEndsAt: demoAccessUntil,
      currentPeriodEnd: demoAccessUntil,
      cancelAtPeriodEnd: false,
    },
  });

  for (let index = 1; index <= 24; index += 1) {
    await prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        name: `Tavolo ${index}`,
        code: `T${index}`,
        qrToken: `${DEMO_TABLE_TOKEN_PREFIX}-${index}`,
        seats: 4,
        zone: null,
        sortOrder: index,
        isActive: true,
      },
    });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = [
    { name: "Owner Demo", email: "owner@demo.test", role: "owner" },
    { name: "Admin Demo", email: "admin@demo.test", role: "admin" },
    { name: "Cucina Demo", email: "cucina@demo.test", role: "kitchen" },
    { name: "Bar Demo", email: "bar@demo.test", role: "bar" },
    { name: "Sala Demo", email: "sala@demo.test", role: "waiter" },
    { name: "Cassa Demo", email: "cassa@demo.test", role: "cashier" },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        restaurantId: restaurant.id,
        name: user.name,
        role: user.role,
        isActive: true,
        passwordHash,
      },
      create: {
        restaurantId: restaurant.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: true,
        passwordHash,
      },
    });
  }

  for (const item of demoMenuItems) {
    await prisma.menuItem.create({
      data: {
        ...item,
        restaurantId: restaurant.id,
        shortDescription: item.description,
        vatRate: vatRateForCategory(item.category),
        isFeatured: Boolean(item.isFeatured),
        isAvailable: item.isAvailable !== false,
        isDeleted: false,
      },
    });
  }

  const tables = await prisma.table.findMany({ where: { restaurantId: restaurant.id } });
  const byCode = new Map(tables.map((table) => [table.code, table]));

  await prisma.reservation.createMany({
    data: [
      { restaurantId: restaurant.id, tableId: byCode.get("T3")?.id, customerName: "Luca Bianchi", phone: "+39 333 111 2233", date: dateAt(0, 20, 15), time: "20:15", guests: 4, notes: "Compleanno, preferisce tavolo tranquillo", status: "booked" },
      { restaurantId: restaurant.id, tableId: byCode.get("T8")?.id, customerName: "Sara Conti", phone: "+39 333 444 5566", date: dateAt(0, 21, 0), time: "21:00", guests: 2, notes: "Allergia frutta a guscio", status: "booked" },
      { restaurantId: restaurant.id, tableId: byCode.get("T12")?.id, customerName: "Marco De Luca", phone: "+39 333 777 8899", date: dateAt(1, 19, 45), time: "19:45", guests: 6, notes: "Richiesto seggiolone", status: "booked" },
      { restaurantId: restaurant.id, tableId: byCode.get("T15")?.id, customerName: "Giulia Ferri", phone: "+39 333 222 4455", date: dateAt(1, 20, 30), time: "20:30", guests: 3, notes: "Arriveranno con cane piccolo", status: "booked" },
      { restaurantId: restaurant.id, tableId: byCode.get("T5")?.id, customerName: "Cliente arrivato", phone: "+39 333 000 0000", date: dateAt(0, 19, 30), time: "19:30", guests: 2, notes: "Demo stato arrivata", status: "seated" },
    ],
  });

  const liveOrders = [
    {
      id: "demo-order-live-1",
      table: "T1",
      status: "pending",
      customerName: "Tavolo demo 1",
      notes: "Ordine appena arrivato",
      items: [{ menuItemId: "demo-primo-1", quantity: 2 }, { menuItemId: "demo-bar-2", quantity: 2 }],
      orderNumber: 101,
      createdAt: dateAt(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 6)),
    },
    {
      id: "demo-order-live-2",
      table: "T4",
      status: "in_progress",
      customerName: "Tavolo demo 4",
      notes: "Secondo giro",
      items: [{ menuItemId: "demo-secondo-1", quantity: 1 }, { menuItemId: "demo-contorno-1", quantity: 1 }, { menuItemId: "demo-vino-1", quantity: 2 }],
      orderNumber: 102,
      createdAt: dateAt(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 15)),
    },
    {
      id: "demo-order-live-3",
      table: "T7",
      status: "ready",
      customerName: "Tavolo demo 7",
      notes: "Da servire",
      items: [{ menuItemId: "demo-secondo-2", quantity: 2 }, { menuItemId: "demo-contorno-2", quantity: 2 }],
      orderNumber: 103,
      createdAt: dateAt(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 24)),
    },
    {
      id: "demo-order-live-4",
      table: "T10",
      status: "in_progress",
      paymentStatus: "pending",
      customerName: "Tavolo demo 10",
      notes: "Conto richiesto dal cliente",
      items: [{ menuItemId: "demo-primo-2", quantity: 1 }, { menuItemId: "demo-dolce-1", quantity: 2 }, { menuItemId: "demo-vino-2", quantity: 2 }],
      orderNumber: 104,
      createdAt: dateAt(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 34)),
    },
  ];

  for (const order of liveOrders) {
    await upsertDemoOrder({
      ...order,
      restaurantId: restaurant.id,
      table: byCode.get(order.table),
    });
  }

  const historyOrders = [
    ["demo-order-history-1", -1, "T2", "card", [{ menuItemId: "demo-primo-2", quantity: 2 }, { menuItemId: "demo-bar-2", quantity: 2 }, { menuItemId: "demo-dolce-1", quantity: 2 }]],
    ["demo-order-history-2", -2, "T6", "cash", [{ menuItemId: "demo-secondo-1", quantity: 1 }, { menuItemId: "demo-vino-1", quantity: 2 }]],
    ["demo-order-history-3", -3, "T9", "card", [{ menuItemId: "demo-primo-1", quantity: 3 }, { menuItemId: "demo-contorno-2", quantity: 2 }]],
    ["demo-order-history-4", -4, "T11", "satispay", [{ menuItemId: "demo-special-2", quantity: 2 }, { menuItemId: "demo-vino-2", quantity: 2 }]],
    ["demo-order-history-5", -5, "T14", "card", [{ menuItemId: "demo-secondo-2", quantity: 2 }, { menuItemId: "demo-bar-3", quantity: 2 }]],
    ["demo-order-history-6", -6, "T18", "cash", [{ menuItemId: "demo-antipasto-2", quantity: 2 }, { menuItemId: "demo-primo-3", quantity: 2 }]],
    ["demo-order-history-7", -8, "T20", "online", [{ menuItemId: "demo-antipasto-1", quantity: 1 }, { menuItemId: "demo-secondo-3", quantity: 2 }, { menuItemId: "demo-dolce-2", quantity: 2 }]],
    ["demo-order-history-8", -10, "T22", "card", [{ menuItemId: "demo-primo-2", quantity: 1 }, { menuItemId: "demo-secondo-1", quantity: 1 }, { menuItemId: "demo-vino-2", quantity: 1 }]],
  ];

  let orderNumber = 201;
  for (const [id, daysAgo, tableCode, paymentMethod, items] of historyOrders) {
    const createdAt = dateAt(daysAgo, 20, 10 + (orderNumber % 35));
    const closedAt = new Date(createdAt.getTime() + 58 * 60 * 1000);
    await upsertDemoOrder({
      id,
      restaurantId: restaurant.id,
      table: byCode.get(tableCode),
      status: "served",
      paymentStatus: "paid",
      paymentMethod,
      customerName: `Storico ${tableCode}`,
      notes: "Ordine storico demo per statistiche",
      items,
      createdAt,
      closedAt,
      orderNumber,
    });
    orderNumber += 1;
  }

  await prisma.orderCounter.upsert({
    where: { restaurantId: restaurant.id },
    update: { nextNumber: 300 },
    create: { restaurantId: restaurant.id, nextNumber: 300 },
  });

  console.log("OK. Demo completa pronta.");
  console.log(`Ristorante: Ordynora Demo Bistro (${RESTAURANT_SLUG})`);
  console.log(`Logo: presente`);
  console.log(`Tavoli: 24 con QR demo-table-1 ... demo-table-24`);
  console.log(`Menu: ${demoMenuItems.length} prodotti con foto SVG integrate`);
  console.log("Ordini live: cucina/bar/cassa/tavoli popolati");
  console.log("Statistiche: storico pagato negli ultimi 10 giorni");
  console.log(`Menu cliente: /menu/${RESTAURANT_SLUG}/${DEMO_TABLE_TOKEN_PREFIX}-1`);
  console.log(`Login owner: owner@demo.test / ${DEMO_PASSWORD}`);
  console.log("Login staff: cucina@demo.test, bar@demo.test, sala@demo.test, cassa@demo.test");
}

main()
  .catch((error) => {
    console.error("Errore creazione demo completa:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
