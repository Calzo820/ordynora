import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LocaleSwitcher from "../components/LocaleSwitcher";
import { useLocale } from "../context/LocaleContext";
import { useTranslatedContent } from "../hooks/useTranslatedContent";
import logoEasyMenu from "../assets/logo-easymenu.png";
import { demoDishImage } from "../lib/demoVisuals";
import "../styles/demo.css";

const WHATSAPP_NUMBER = "393240467723";
const localeFormats = { it: "it-IT", en: "en-GB", de: "de-DE", es: "es-ES", ru: "ru-RU" };

const translations = {
  it: {
    login: "Login demo reale", request: "Richiedi demo gratuita", kicker: "Demo pubblica senza registrazione", title: "Prova EasyMenu.",
    hero: "Tre percorsi, zero password: menu cliente, cucina live e cassa tavoli. In meno di un minuto capisci il prodotto.",
    paths: [["Prova come cliente", "Menu QR, allergeni, carrello e ordine."], ["Prova cucina", "Comande pronte da gestire."], ["Prova cassa", "Tavoli colorati e preconti."]],
    restaurant: "Ristorante demo", tablesReady: "24 tavoli già pronti", occupied: "Occupati", orders: "Ordini", liveTotal: "Totale live", panelCopy: "Menu completo, ordini di esempio e flusso operativo già configurato.",
    beta: "Demo gratuita · primi 3 ristoranti", betaTitle: "Ti attivo EasyMenu gratuitamente nel tuo ristorante.", betaCopy: "Setup menu, QR tavoli, cucina, cassa e prima prova servizio insieme.",
    tabs: { cucina: "Cucina e bar", cassa: "Cassa", tavoli: "Tavoli", menu: "Menu cliente" },
    statuses: { free: "Libero", occupied: "Occupato", ready: "Pronto", bill: "Conto", reserved: "Prenotato" },
    qrActive: "QR attivo", recommended: "Consigliato", allergens: "Allergeni", cart: "Carrello demo", total: "Totale", sendOrder: "Invia ordine demo", prebill: "Preconto", demoAccess: "Accessi demo", password: "Password", enterDemo: "Entra nella demo reale",
    areas: { kitchen: "Cucina", bar: "Bar" }, orderStatuses: { new: "Nuovo", working: "In lavorazione", ready: "Pronto" },
    roles: ["Proprietario", "Cucina", "Bar", "Cassa"],
    categories: { starters: "Antipasti", first: "Primi", mains: "Secondi", vegetarian: "Vegetariano", desserts: "Dolci", cocktails: "Cocktail", wines: "Vini" },
    menuNames: { tartare: "Tartare mediterranea", burrata: "Burrata e pomodorini", risotto: "Risotto limone e gambero", carbonara: "Carbonara croccante", filet: "Filetto al pepe verde", seabass: "Branzino alle erbe", parmigiana: "Parmigiana leggera", tiramisu: "Tiramisù espresso", spritz: "Spritz Signature", wine: "Calice Etna rosso", water: "Acqua frizzante" },
    whatsapp: "Ciao, vorrei richiedere la demo gratuita EasyMenu per il mio ristorante.",
  },
  en: {
    login: "Real demo login", request: "Request a free demo", kicker: "Public demo, no registration", title: "Try EasyMenu.", hero: "Three paths, no password: guest menu, live kitchen and table checkout. Understand the product in under a minute.",
    paths: [["Try as a guest", "QR menu, allergens, basket and order."], ["Try the kitchen", "Orders ready to manage."], ["Try checkout", "Colour-coded tables and pre-bills."]],
    restaurant: "Demo restaurant", tablesReady: "24 tables ready", occupied: "Occupied", orders: "Orders", liveTotal: "Live total", panelCopy: "A complete menu, sample orders and a pre-configured operational workflow.",
    beta: "Free demo · first 3 restaurants", betaTitle: "We will activate EasyMenu in your restaurant for free.", betaCopy: "Menu setup, table QR codes, kitchen, checkout and your first live trial together.",
    tabs: { cucina: "Kitchen & bar", cassa: "Checkout", tavoli: "Tables", menu: "Guest menu" }, statuses: { free: "Free", occupied: "Occupied", ready: "Ready", bill: "Bill", reserved: "Reserved" },
    qrActive: "QR active", recommended: "Recommended", allergens: "Allergens", cart: "Demo basket", total: "Total", sendOrder: "Send demo order", prebill: "Pre-bill", demoAccess: "Demo logins", password: "Password", enterDemo: "Enter the real demo",
    areas: { kitchen: "Kitchen", bar: "Bar" }, orderStatuses: { new: "New", working: "In progress", ready: "Ready" }, roles: ["Owner", "Kitchen", "Bar", "Checkout"],
    categories: { starters: "Starters", first: "First courses", mains: "Main courses", vegetarian: "Vegetarian", desserts: "Desserts", cocktails: "Cocktails", wines: "Wines" },
    menuNames: { tartare: "Mediterranean tartare", burrata: "Burrata and cherry tomatoes", risotto: "Lemon and prawn risotto", carbonara: "Crispy carbonara", filet: "Green pepper fillet", seabass: "Herb sea bass", parmigiana: "Light parmigiana", tiramisu: "Espresso tiramisu", spritz: "Signature Spritz", wine: "Glass of Etna red", water: "Sparkling water" },
    whatsapp: "Hello, I would like to request the free EasyMenu demo for my restaurant.",
  },
  de: {
    login: "Echte Demo öffnen", request: "Kostenlose Demo anfragen", kicker: "Öffentliche Demo ohne Registrierung", title: "EasyMenu testen.", hero: "Drei Bereiche, kein Passwort: Gästemenü, Live-Küche und Tischkasse. Das Produkt in weniger als einer Minute verstehen.",
    paths: [["Als Gast testen", "QR-Menü, Allergene, Warenkorb und Bestellung."], ["Küche testen", "Bestellungen direkt bearbeiten."], ["Kasse testen", "Farbige Tische und Zwischenrechnungen."]],
    restaurant: "Demo-Restaurant", tablesReady: "24 Tische vorbereitet", occupied: "Belegt", orders: "Bestellungen", liveTotal: "Live-Gesamt", panelCopy: "Vollständiges Menü, Beispielbestellungen und bereits eingerichteter Betriebsablauf.",
    beta: "Kostenlose Demo · erste 3 Restaurants", betaTitle: "Wir aktivieren EasyMenu kostenlos in Ihrem Restaurant.", betaCopy: "Menüeinrichtung, Tisch-QR-Codes, Küche, Kasse und erster Praxistest gemeinsam.",
    tabs: { cucina: "Küche & Bar", cassa: "Kasse", tavoli: "Tische", menu: "Gästemenü" }, statuses: { free: "Frei", occupied: "Belegt", ready: "Bereit", bill: "Rechnung", reserved: "Reserviert" },
    qrActive: "QR aktiv", recommended: "Empfohlen", allergens: "Allergene", cart: "Demo-Warenkorb", total: "Gesamt", sendOrder: "Demo-Bestellung senden", prebill: "Zwischenrechnung", demoAccess: "Demo-Zugänge", password: "Passwort", enterDemo: "Echte Demo öffnen",
    areas: { kitchen: "Küche", bar: "Bar" }, orderStatuses: { new: "Neu", working: "In Bearbeitung", ready: "Bereit" }, roles: ["Inhaber", "Küche", "Bar", "Kasse"],
    categories: { starters: "Vorspeisen", first: "Erste Gänge", mains: "Hauptgerichte", vegetarian: "Vegetarisch", desserts: "Desserts", cocktails: "Cocktails", wines: "Weine" },
    menuNames: { tartare: "Mediterranes Tatar", burrata: "Burrata mit Kirschtomaten", risotto: "Zitronen-Garnelen-Risotto", carbonara: "Knusprige Carbonara", filet: "Filet mit grünem Pfeffer", seabass: "Wolfsbarsch mit Kräutern", parmigiana: "Leichte Parmigiana", tiramisu: "Espresso-Tiramisù", spritz: "Signature Spritz", wine: "Glas Etna Rosso", water: "Sprudelwasser" },
    whatsapp: "Hallo, ich möchte die kostenlose EasyMenu-Demo für mein Restaurant anfragen.",
  },
  es: {
    login: "Acceso a la demo real", request: "Solicitar demo gratuita", kicker: "Demo pública sin registro", title: "Prueba EasyMenu.", hero: "Tres recorridos, sin contraseña: menú cliente, cocina en directo y caja de mesas. Entiende el producto en menos de un minuto.",
    paths: [["Probar como cliente", "Menú QR, alérgenos, carrito y pedido."], ["Probar cocina", "Pedidos listos para gestionar."], ["Probar caja", "Mesas por colores y precuentas."]],
    restaurant: "Restaurante demo", tablesReady: "24 mesas preparadas", occupied: "Ocupadas", orders: "Pedidos", liveTotal: "Total en directo", panelCopy: "Menú completo, pedidos de ejemplo y flujo operativo ya configurado.",
    beta: "Demo gratuita · primeros 3 restaurantes", betaTitle: "Activamos EasyMenu gratis en tu restaurante.", betaCopy: "Configuración del menú, QR de mesas, cocina, caja y primera prueba juntos.",
    tabs: { cucina: "Cocina y bar", cassa: "Caja", tavoli: "Mesas", menu: "Menú cliente" }, statuses: { free: "Libre", occupied: "Ocupada", ready: "Lista", bill: "Cuenta", reserved: "Reservada" },
    qrActive: "QR activo", recommended: "Recomendado", allergens: "Alérgenos", cart: "Carrito demo", total: "Total", sendOrder: "Enviar pedido demo", prebill: "Precuenta", demoAccess: "Accesos demo", password: "Contraseña", enterDemo: "Entrar en la demo real",
    areas: { kitchen: "Cocina", bar: "Bar" }, orderStatuses: { new: "Nuevo", working: "En preparación", ready: "Listo" }, roles: ["Propietario", "Cocina", "Bar", "Caja"],
    categories: { starters: "Entrantes", first: "Primeros", mains: "Segundos", vegetarian: "Vegetariano", desserts: "Postres", cocktails: "Cócteles", wines: "Vinos" },
    menuNames: { tartare: "Tartar mediterráneo", burrata: "Burrata y tomates cherry", risotto: "Risotto de limón y gambas", carbonara: "Carbonara crujiente", filet: "Solomillo a la pimienta verde", seabass: "Lubina a las hierbas", parmigiana: "Parmigiana ligera", tiramisu: "Tiramisú espresso", spritz: "Spritz Signature", wine: "Copa de Etna tinto", water: "Agua con gas" },
    whatsapp: "Hola, quiero solicitar la demo gratuita de EasyMenu para mi restaurante.",
  },
  ru: {
    login: "Войти в полное демо", request: "Запросить бесплатное демо", kicker: "Публичное демо без регистрации", title: "Попробуйте EasyMenu.", hero: "Три сценария без пароля: меню гостя, кухня в реальном времени и касса. Понять продукт можно меньше чем за минуту.",
    paths: [["Попробовать как гость", "QR-меню, аллергены, корзина и заказ."], ["Попробовать кухню", "Заказы готовы к обработке."], ["Попробовать кассу", "Цветные статусы столов и предварительные счета."]],
    restaurant: "Демо-ресторан", tablesReady: "24 стола готовы", occupied: "Занято", orders: "Заказы", liveTotal: "Сумма сейчас", panelCopy: "Полное меню, примеры заказов и уже настроенный рабочий процесс.",
    beta: "Бесплатное демо · первые 3 ресторана", betaTitle: "Мы бесплатно подключим EasyMenu в вашем ресторане.", betaCopy: "Настройка меню, QR-коды столов, кухня, касса и первый тест вместе.",
    tabs: { cucina: "Кухня и бар", cassa: "Касса", tavoli: "Столы", menu: "Меню гостя" }, statuses: { free: "Свободен", occupied: "Занят", ready: "Готов", bill: "Счёт", reserved: "Забронирован" },
    qrActive: "QR активен", recommended: "Рекомендуем", allergens: "Аллергены", cart: "Демо-корзина", total: "Итого", sendOrder: "Отправить демо-заказ", prebill: "Предварительный счёт", demoAccess: "Демо-доступы", password: "Пароль", enterDemo: "Открыть полное демо",
    areas: { kitchen: "Кухня", bar: "Бар" }, orderStatuses: { new: "Новый", working: "Готовится", ready: "Готов" }, roles: ["Владелец", "Кухня", "Бар", "Касса"],
    categories: { starters: "Закуски", first: "Первые блюда", mains: "Основные блюда", vegetarian: "Вегетарианское", desserts: "Десерты", cocktails: "Коктейли", wines: "Вина" },
    menuNames: { tartare: "Средиземноморский тартар", burrata: "Буррата с томатами", risotto: "Ризотто с лимоном и креветками", carbonara: "Хрустящая карбонара", filet: "Филе с зелёным перцем", seabass: "Сибас с травами", parmigiana: "Лёгкая пармиджана", tiramisu: "Тирамису с эспрессо", spritz: "Фирменный спритц", wine: "Бокал красного Etna", water: "Газированная вода" },
    whatsapp: "Здравствуйте, я хочу запросить бесплатное демо EasyMenu для моего ресторана.",
  },
};

const demoTables = Array.from({ length: 24 }, (_, index) => {
  const tableNumber = index + 1;
  const status = [2, 5, 9, 14, 18, 23].includes(tableNumber) ? "occupied" : [3, 12, 21].includes(tableNumber) ? "ready" : [7, 16, 22].includes(tableNumber) ? "bill" : [11, 20, 24].includes(tableNumber) ? "reserved" : "free";
  return { id: tableNumber, name: `T${tableNumber}`, seats: tableNumber % 5 === 0 ? 6 : tableNumber % 3 === 0 ? 2 : 4, status, total: status === "free" || status === "reserved" ? 0 : 18 + tableNumber * 4.5, time: status === "free" ? "-" : `${12 + tableNumber} min` };
});

const demoMenu = [
  { id: "tartare", category: "starters", price: 14, allergens: "senape", featured: true, theme: "antipasto" },
  { id: "burrata", category: "starters", price: 11, allergens: "latte, glutine", theme: "antipasto" },
  { id: "risotto", category: "first", price: 18, allergens: "crostacei, latte", featured: true, theme: "pesce" },
  { id: "carbonara", category: "first", price: 13, allergens: "glutine, uova, latte", theme: "primo" },
  { id: "filet", category: "mains", price: 24, allergens: "latte", featured: true, theme: "carne" },
  { id: "seabass", category: "mains", price: 21, allergens: "pesce", featured: true, theme: "pesce" },
  { id: "parmigiana", category: "vegetarian", price: 12, allergens: "latte", theme: "vegetariano" },
  { id: "tiramisu", category: "desserts", price: 7, allergens: "uova, latte, glutine", featured: true, theme: "dolce" },
  { id: "spritz", category: "cocktails", price: 8, allergens: "solfiti", featured: true, theme: "drink" },
  { id: "wine", category: "wines", price: 7, allergens: "solfiti", theme: "vino" },
].map((item) => ({ ...item, imageUrl: demoDishImage(item.id, item.category, item.theme) }));

const demoOrders = [
  { table: "T2", area: "kitchen", time: "03:12", status: "new", items: [["risotto"], ["filet"]] },
  { table: "T5", area: "bar", time: "05:40", status: "working", items: [["spritz", " x2"], ["water"]] },
  { table: "T9", area: "kitchen", time: "11:06", status: "ready", items: [["carbonara"], ["parmigiana"]] },
  { table: "T12", area: "bar", time: "02:18", status: "ready", items: [["wine", " x2"]] },
];

const demoEmails = ["owner@demo.test", "cucina@demo.test", "bar@demo.test", "cassa@demo.test"];

function money(value, locale, compact = false) {
  return new Intl.NumberFormat(localeFormats[locale] || "it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 0 : 2 }).format(Number(value || 0));
}

export default function Demo() {
  const { locale } = useLocale();
  const { content: t, isTranslating } = useTranslatedContent("demo", translations);
  const [view, setView] = useState("cucina");
  const requestUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.whatsapp)}`;

  const stats = useMemo(() => ({
    occupied: demoTables.filter((table) => ["occupied", "ready", "bill"].includes(table.status)).length,
    total: demoTables.reduce((sum, table) => sum + table.total, 0),
  }), []);

  const itemName = (id) => t.menuNames[id] || id;

  return (
    <main className="demo-page" aria-busy={isTranslating}>
      <header className="demo-topbar">
        <Link to="/" className="demo-brand"><img src={logoEasyMenu} alt="EasyMenu" /><span>EasyMenu Demo</span></Link>
        <div className="demo-actions"><LocaleSwitcher variant="light" /><Link to="/login">{t.login}</Link><a className="is-strong" href={requestUrl} target="_blank" rel="noreferrer">{t.request}</a></div>
      </header>

      <section className="demo-hero">
        <div><span className="demo-kicker">{t.kicker}</span><h1>{t.title}</h1><p className="demo-hero-copy">{t.hero}</p>
          <div className="demo-hero-actions" aria-label="Demo">
            {["menu", "cucina", "cassa"].map((id, index) => <button key={id} type="button" onClick={() => setView(id)}><span>{index + 1}</span><strong>{t.paths[index][0]}</strong><small>{t.paths[index][1]}</small></button>)}
          </div>
        </div>
        <div className="demo-live-panel"><span>{t.restaurant}</span><strong>{t.tablesReady}</strong><div className="demo-kpis"><div><span>{t.occupied}</span><strong>{stats.occupied}</strong></div><div><span>{t.orders}</span><strong>{demoOrders.length}</strong></div><div><span>{t.liveTotal}</span><strong>{money(stats.total, locale, true)}</strong></div></div><p>{t.panelCopy}</p></div>
      </section>

      <section className="demo-beta-strip"><div><span>{t.beta}</span><strong>{t.betaTitle}</strong><small>{t.betaCopy}</small></div><a href={requestUrl} target="_blank" rel="noreferrer">{t.request}</a></section>

      <nav className="demo-tabs" aria-label="Demo"><>{Object.entries(t.tabs).map(([id, label]) => <button key={id} type="button" className={view === id ? "is-active" : ""} onClick={() => setView(id)}>{label}</button>)}</></nav>

      {view === "tavoli" ? <section className="demo-table-grid">{demoTables.map((table) => <article key={table.id} className={`demo-table-card ${table.status}`}><div><strong>{table.name}</strong><span>{t.qrActive}</span></div><div className="demo-table-bottom"><span>{t.statuses[table.status]}</span><b>{table.total ? money(table.total, locale) : table.time}</b></div></article>)}</section> : null}

      {view === "menu" ? <section className="demo-split"><div className="demo-menu-grid">{demoMenu.map((item) => <article className="demo-menu-card" key={item.id}><img src={item.imageUrl} alt="" /><div><div className="demo-menu-meta"><span>{t.categories[item.category]}</span>{item.featured ? <b>{t.recommended}</b> : null}</div><h3>{itemName(item.id)}</h3><p>{t.allergens}: {item.allergens}</p><strong>{money(item.price, locale)}</strong></div></article>)}</div><aside className="demo-side-panel"><h2>{t.cart}</h2><div className="demo-check-row"><span>{itemName("risotto")}</span><b>{money(18, locale)}</b></div><div className="demo-check-row"><span>{itemName("spritz")}</span><b>{money(8, locale)}</b></div><div className="demo-total"><span>{t.total}</span><strong>{money(26, locale)}</strong></div><button className="demo-primary" type="button" onClick={() => setView("cucina")}>{t.sendOrder}</button></aside></section> : null}

      {view === "cucina" ? <section className="demo-orders-grid">{demoOrders.map((order) => <article key={`${order.table}-${order.time}`} className={`demo-order-card ${order.status === "ready" ? "ready" : ""}`}><div className="demo-order-head"><div><strong>{order.table}</strong><span>{t.areas[order.area]}</span></div><b>{order.time}</b></div><ul>{order.items.map(([id, suffix = ""]) => <li key={`${id}${suffix}`}>{itemName(id)}{suffix}</li>)}</ul><span className="demo-order-status">{t.orderStatuses[order.status]}</span></article>)}</section> : null}

      {view === "cassa" ? <section className="demo-split"><div className="demo-cash-list">{demoTables.filter((table) => table.total > 0).map((table) => <article key={table.id} className="demo-cash-row"><div><strong>{table.name}</strong><span>{t.statuses[table.status]} · {table.time}</span></div><b>{money(table.total, locale)}</b><button type="button">{t.prebill}</button></article>)}</div><aside className="demo-side-panel dark"><h2>{t.demoAccess}</h2>{demoEmails.map((email, index) => <div className="demo-login-row" key={email}><span>{t.roles[index]}</span><b>{email}</b></div>)}<p>{t.password}: EasyMenu2026!</p><Link className="demo-primary light" to="/login">{t.enterDemo}</Link></aside></section> : null}
    </main>
  );
}
