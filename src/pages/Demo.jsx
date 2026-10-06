import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LocaleSwitcher from "../components/LocaleSwitcher";
import { useLocale } from "../context/LocaleContext";
import { useTranslatedContent } from "../hooks/useTranslatedContent";
import { ORDYNORA_LOGO_URL as logoOrdynora } from "../lib/brand";
import { DEMO_JOURNEY, DEMO_ORDER, DEMO_TOTAL_MINUTES, getDemoJourneyIndex, getDemoJourneyStep, getDemoOrdersAfterOrder, getDemoTablesAfterOrder } from "../lib/demoJourney";
import { demoDishImage } from "../lib/demoVisuals";
import "../styles/demo.css";

const WHATSAPP_NUMBER = "393240467723";
const localeFormats = { it: "it-IT", en: "en-GB", de: "de-DE", es: "es-ES", ru: "ru-RU" };

const translations = {
  it: {
    login: "Login demo reale", request: "Richiedi demo gratuita", kicker: "Demo pubblica senza registrazione", title: "Prova Ordynora.",
    hero: "Segui un ordine dal QR al conto e guarda cosa vede ogni ruolo. Cinque passaggi, dieci minuti, nessuna configurazione.",
    paths: [["Prova come cliente", "Menu QR, allergeni, carrello e ordine."], ["Prova cucina", "Comande pronte da gestire."], ["Prova cassa", "Tavoli colorati e preconti."]],
    restaurant: "Ristorante demo", tablesReady: "24 tavoli già pronti", occupied: "Occupati", orders: "Ordini", liveTotal: "Totale live", panelCopy: "Menu completo, ordini di esempio e flusso operativo già configurato.",
    beta: "Demo gratuita · primi 3 ristoranti", betaTitle: "Ti attivo Ordynora gratuitamente nel tuo ristorante.", betaCopy: "Setup menu, QR tavoli, cucina, cassa e prima prova servizio insieme.",
    tabs: { cucina: "Cucina e bar", cassa: "Cassa", tavoli: "Tavoli", menu: "Menu cliente", risultati: "Risultati" },
    statuses: { free: "Libero", occupied: "Occupato", ready: "Pronto", bill: "Conto", reserved: "Prenotato" },
    qrActive: "QR attivo", recommended: "Consigliato", allergens: "Allergeni", cart: "Carrello demo", total: "Totale", sendOrder: "Invia ordine demo", prebill: "Preconto", demoAccess: "Accessi demo", password: "Password", enterDemo: "Entra nella demo reale",
    areas: { kitchen: "Cucina", bar: "Bar" }, orderStatuses: { new: "Nuovo", working: "In lavorazione", ready: "Pronto" },
    roles: ["Proprietario", "Cucina", "Bar", "Cassa"],
    categories: { starters: "Antipasti", first: "Primi", mains: "Secondi", vegetarian: "Vegetariano", desserts: "Dolci", cocktails: "Cocktail", wines: "Vini" },
    menuNames: { tartare: "Tartare mediterranea", burrata: "Burrata e pomodorini", risotto: "Risotto limone e gambero", carbonara: "Carbonara croccante", filet: "Filetto al pepe verde", seabass: "Branzino alle erbe", parmigiana: "Parmigiana leggera", tiramisu: "Tiramisù espresso", spritz: "Spritz Signature", wine: "Calice Etna rosso", water: "Acqua frizzante" },
    whatsapp: "Ciao, vorrei richiedere la demo gratuita Ordynora per il mio ristorante.",
  },
  en: {
    login: "Real demo login", request: "Request a free demo", kicker: "Public demo, no registration", title: "Try Ordynora.", hero: "Follow an order from QR code to payment and see what every role sees. Five steps, ten minutes, no setup.",
    paths: [["Try as a guest", "QR menu, allergens, basket and order."], ["Try the kitchen", "Orders ready to manage."], ["Try checkout", "Colour-coded tables and pre-bills."]],
    restaurant: "Demo restaurant", tablesReady: "24 tables ready", occupied: "Occupied", orders: "Orders", liveTotal: "Live total", panelCopy: "A complete menu, sample orders and a pre-configured operational workflow.",
    beta: "Free demo · first 3 restaurants", betaTitle: "We will activate Ordynora in your restaurant for free.", betaCopy: "Menu setup, table QR codes, kitchen, checkout and your first live trial together.",
    tabs: { cucina: "Kitchen & bar", cassa: "Checkout", tavoli: "Tables", menu: "Guest menu", risultati: "Results" }, statuses: { free: "Free", occupied: "Occupied", ready: "Ready", bill: "Bill", reserved: "Reserved" },
    qrActive: "QR active", recommended: "Recommended", allergens: "Allergens", cart: "Demo basket", total: "Total", sendOrder: "Send demo order", prebill: "Pre-bill", demoAccess: "Demo logins", password: "Password", enterDemo: "Enter the real demo",
    areas: { kitchen: "Kitchen", bar: "Bar" }, orderStatuses: { new: "New", working: "In progress", ready: "Ready" }, roles: ["Owner", "Kitchen", "Bar", "Checkout"],
    categories: { starters: "Starters", first: "First courses", mains: "Main courses", vegetarian: "Vegetarian", desserts: "Desserts", cocktails: "Cocktails", wines: "Wines" },
    menuNames: { tartare: "Mediterranean tartare", burrata: "Burrata and cherry tomatoes", risotto: "Lemon and prawn risotto", carbonara: "Crispy carbonara", filet: "Green pepper fillet", seabass: "Herb sea bass", parmigiana: "Light parmigiana", tiramisu: "Espresso tiramisu", spritz: "Signature Spritz", wine: "Glass of Etna red", water: "Sparkling water" },
    whatsapp: "Hello, I would like to request the free Ordynora demo for my restaurant.",
  },
  de: {
    login: "Echte Demo öffnen", request: "Kostenlose Demo anfragen", kicker: "Öffentliche Demo ohne Registrierung", title: "Ordynora testen.", hero: "Verfolgen Sie eine Bestellung vom QR-Code bis zur Zahlung und sehen Sie jede Rolle. Fünf Schritte, zehn Minuten, ohne Einrichtung.",
    paths: [["Als Gast testen", "QR-Menü, Allergene, Warenkorb und Bestellung."], ["Küche testen", "Bestellungen direkt bearbeiten."], ["Kasse testen", "Farbige Tische und Zwischenrechnungen."]],
    restaurant: "Demo-Restaurant", tablesReady: "24 Tische vorbereitet", occupied: "Belegt", orders: "Bestellungen", liveTotal: "Live-Gesamt", panelCopy: "Vollständiges Menü, Beispielbestellungen und bereits eingerichteter Betriebsablauf.",
    beta: "Kostenlose Demo · erste 3 Restaurants", betaTitle: "Wir aktivieren Ordynora kostenlos in Ihrem Restaurant.", betaCopy: "Menüeinrichtung, Tisch-QR-Codes, Küche, Kasse und erster Praxistest gemeinsam.",
    tabs: { cucina: "Küche & Bar", cassa: "Kasse", tavoli: "Tische", menu: "Gästemenü", risultati: "Ergebnisse" }, statuses: { free: "Frei", occupied: "Belegt", ready: "Bereit", bill: "Rechnung", reserved: "Reserviert" },
    qrActive: "QR aktiv", recommended: "Empfohlen", allergens: "Allergene", cart: "Demo-Warenkorb", total: "Gesamt", sendOrder: "Demo-Bestellung senden", prebill: "Zwischenrechnung", demoAccess: "Demo-Zugänge", password: "Passwort", enterDemo: "Echte Demo öffnen",
    areas: { kitchen: "Küche", bar: "Bar" }, orderStatuses: { new: "Neu", working: "In Bearbeitung", ready: "Bereit" }, roles: ["Inhaber", "Küche", "Bar", "Kasse"],
    categories: { starters: "Vorspeisen", first: "Erste Gänge", mains: "Hauptgerichte", vegetarian: "Vegetarisch", desserts: "Desserts", cocktails: "Cocktails", wines: "Weine" },
    menuNames: { tartare: "Mediterranes Tatar", burrata: "Burrata mit Kirschtomaten", risotto: "Zitronen-Garnelen-Risotto", carbonara: "Knusprige Carbonara", filet: "Filet mit grünem Pfeffer", seabass: "Wolfsbarsch mit Kräutern", parmigiana: "Leichte Parmigiana", tiramisu: "Espresso-Tiramisù", spritz: "Signature Spritz", wine: "Glas Etna Rosso", water: "Sprudelwasser" },
    whatsapp: "Hallo, ich möchte die kostenlose Ordynora-Demo für mein Restaurant anfragen.",
  },
  es: {
    login: "Acceso a la demo real", request: "Solicitar demo gratuita", kicker: "Demo pública sin registro", title: "Prueba Ordynora.", hero: "Sigue un pedido desde el QR hasta el pago y mira lo que ve cada rol. Cinco pasos, diez minutos, sin configuración.",
    paths: [["Probar como cliente", "Menú QR, alérgenos, carrito y pedido."], ["Probar cocina", "Pedidos listos para gestionar."], ["Probar caja", "Mesas por colores y precuentas."]],
    restaurant: "Restaurante demo", tablesReady: "24 mesas preparadas", occupied: "Ocupadas", orders: "Pedidos", liveTotal: "Total en directo", panelCopy: "Menú completo, pedidos de ejemplo y flujo operativo ya configurado.",
    beta: "Demo gratuita · primeros 3 restaurantes", betaTitle: "Activamos Ordynora gratis en tu restaurante.", betaCopy: "Configuración del menú, QR de mesas, cocina, caja y primera prueba juntos.",
    tabs: { cucina: "Cocina y bar", cassa: "Caja", tavoli: "Mesas", menu: "Menú cliente", risultati: "Resultados" }, statuses: { free: "Libre", occupied: "Ocupada", ready: "Lista", bill: "Cuenta", reserved: "Reservada" },
    qrActive: "QR activo", recommended: "Recomendado", allergens: "Alérgenos", cart: "Carrito demo", total: "Total", sendOrder: "Enviar pedido demo", prebill: "Precuenta", demoAccess: "Accesos demo", password: "Contraseña", enterDemo: "Entrar en la demo real",
    areas: { kitchen: "Cocina", bar: "Bar" }, orderStatuses: { new: "Nuevo", working: "En preparación", ready: "Listo" }, roles: ["Propietario", "Cocina", "Bar", "Caja"],
    categories: { starters: "Entrantes", first: "Primeros", mains: "Segundos", vegetarian: "Vegetariano", desserts: "Postres", cocktails: "Cócteles", wines: "Vinos" },
    menuNames: { tartare: "Tartar mediterráneo", burrata: "Burrata y tomates cherry", risotto: "Risotto de limón y gambas", carbonara: "Carbonara crujiente", filet: "Solomillo a la pimienta verde", seabass: "Lubina a las hierbas", parmigiana: "Parmigiana ligera", tiramisu: "Tiramisú espresso", spritz: "Spritz Signature", wine: "Copa de Etna tinto", water: "Agua con gas" },
    whatsapp: "Hola, quiero solicitar la demo gratuita de Ordynora para mi restaurante.",
  },
  ru: {
    login: "Войти в полное демо", request: "Запросить бесплатное демо", kicker: "Публичное демо без регистрации", title: "Попробуйте Ordynora.", hero: "Проследите заказ от QR-кода до оплаты и увидьте экран каждой роли. Пять шагов, десять минут, без настройки.",
    paths: [["Попробовать как гость", "QR-меню, аллергены, корзина и заказ."], ["Попробовать кухню", "Заказы готовы к обработке."], ["Попробовать кассу", "Цветные статусы столов и предварительные счета."]],
    restaurant: "Демо-ресторан", tablesReady: "24 стола готовы", occupied: "Занято", orders: "Заказы", liveTotal: "Сумма сейчас", panelCopy: "Полное меню, примеры заказов и уже настроенный рабочий процесс.",
    beta: "Бесплатное демо · первые 3 ресторана", betaTitle: "Мы бесплатно подключим Ordynora в вашем ресторане.", betaCopy: "Настройка меню, QR-коды столов, кухня, касса и первый тест вместе.",
    tabs: { cucina: "Кухня и бар", cassa: "Касса", tavoli: "Столы", menu: "Меню гостя", risultati: "Результаты" }, statuses: { free: "Свободен", occupied: "Занят", ready: "Готов", bill: "Счёт", reserved: "Забронирован" },
    qrActive: "QR активен", recommended: "Рекомендуем", allergens: "Аллергены", cart: "Демо-корзина", total: "Итого", sendOrder: "Отправить демо-заказ", prebill: "Предварительный счёт", demoAccess: "Демо-доступы", password: "Пароль", enterDemo: "Открыть полное демо",
    areas: { kitchen: "Кухня", bar: "Бар" }, orderStatuses: { new: "Новый", working: "Готовится", ready: "Готов" }, roles: ["Владелец", "Кухня", "Бар", "Касса"],
    categories: { starters: "Закуски", first: "Первые блюда", mains: "Основные блюда", vegetarian: "Вегетарианское", desserts: "Десерты", cocktails: "Коктейли", wines: "Вина" },
    menuNames: { tartare: "Средиземноморский тартар", burrata: "Буррата с томатами", risotto: "Ризотто с лимоном и креветками", carbonara: "Хрустящая карбонара", filet: "Филе с зелёным перцем", seabass: "Сибас с травами", parmigiana: "Лёгкая пармиджана", tiramisu: "Тирамису с эспрессо", spritz: "Фирменный спритц", wine: "Бокал красного Etna", water: "Газированная вода" },
    whatsapp: "Здравствуйте, я хочу запросить бесплатное демо Ordynora для моего ресторана.",
  },
};

const journeyTranslations = {
  it: {
    start: "Avvia la demo guidata", startMeta: "5 passaggi · 10 minuti", free: "Esplora liberamente", freeMeta: "Apri ogni schermata senza percorso",
    step: "Passaggio", of: "di", previous: "Indietro", next: "Continua", finish: "Provalo nel mio ristorante", close: "Esci dal percorso",
    orderNotice: "Ordine T8 ricevuto: cucina e bar sono stati avvisati.",
    labels: { guest: "Cliente", kitchen: "Cucina", floor: "Sala", checkout: "Cassa", owner: "Titolare" },
    steps: {
      guest: { title: "Il cliente ordina dal tavolo", copy: "Mostra il menu QR, gli allergeni e il carrello. Poi premi “Invia ordine demo”: la comanda verrà separata tra cucina e bar." },
      kitchen: { title: "La comanda si divide da sola", copy: "T8 compare subito nelle postazioni corrette. Nessuna riscrittura, nessun passaggio a voce e tempi visibili." },
      floor: { title: "La sala sa cosa sta succedendo", copy: "Il tavolo T8 risulta occupato e il cameriere segue stato, portate e conto senza chiedere aggiornamenti in cucina." },
      checkout: { title: "Il conto è già pronto", copy: "Articoli e totale seguono il tavolo. La cassa controlla il preconto e chiude senza ricostruire la comanda." },
      owner: { title: "Il titolare controlla il servizio", copy: "Incasso, tempi e prodotti più richiesti diventano informazioni utili, non lavoro aggiuntivo a fine serata." },
    },
    results: { eyebrow: "Risultato della demo", title: "Un unico flusso, senza passaggi a voce.", copy: "Questi sono dati dimostrativi: nel ristorante si aggiornano con il servizio reale.", revenue: "Incasso visibile", revenueNote: "Tavoli aperti aggiornati", kitchenTime: "Tempo medio cucina", kitchenNote: "Dal nuovo al pronto", completed: "Comande tracciate", completedNote: "Cucina e bar comprese", top: "Prodotto più richiesto", topNote: "Dato utile per menu e acquisti" },
  },
  en: {
    start: "Start the guided demo", startMeta: "5 steps · 10 minutes", free: "Explore freely", freeMeta: "Open any screen without a tour",
    step: "Step", of: "of", previous: "Back", next: "Continue", finish: "Try it in my restaurant", close: "Exit tour",
    orderNotice: "Table T8 order received: kitchen and bar have been notified.",
    labels: { guest: "Guest", kitchen: "Kitchen", floor: "Floor", checkout: "Checkout", owner: "Owner" },
    steps: {
      guest: { title: "The guest orders at the table", copy: "Show the QR menu, allergens and basket. Then send the demo order: items are routed to kitchen and bar." },
      kitchen: { title: "The order routes itself", copy: "T8 appears in the right stations immediately. No rewriting, no shouted updates and visible timing." },
      floor: { title: "The floor always knows", copy: "T8 is now occupied and staff follow status, courses and bill without interrupting the kitchen." },
      checkout: { title: "The bill is already prepared", copy: "Items and total stay with the table. Checkout reviews the pre-bill and closes without rebuilding the order." },
      owner: { title: "The owner sees the service", copy: "Revenue, timing and popular products become useful information, not extra work after closing." },
    },
    results: { eyebrow: "Demo result", title: "One workflow, no verbal hand-offs.", copy: "These are sample figures; in a restaurant they update with the real service.", revenue: "Visible revenue", revenueNote: "Open tables updated", kitchenTime: "Average kitchen time", kitchenNote: "From new to ready", completed: "Tracked tickets", completedNote: "Kitchen and bar included", top: "Most ordered item", topNote: "Useful for menu and purchasing" },
  },
  de: {
    start: "Geführte Demo starten", startMeta: "5 Schritte · 10 Minuten", free: "Frei erkunden", freeMeta: "Jeden Bereich ohne Führung öffnen",
    step: "Schritt", of: "von", previous: "Zurück", next: "Weiter", finish: "Im Restaurant testen", close: "Tour beenden",
    orderNotice: "Bestellung T8 eingegangen: Küche und Bar wurden informiert.",
    labels: { guest: "Gast", kitchen: "Küche", floor: "Service", checkout: "Kasse", owner: "Inhaber" },
    steps: {
      guest: { title: "Der Gast bestellt am Tisch", copy: "Zeigen Sie QR-Menü, Allergene und Warenkorb. Danach wird die Bestellung automatisch an Küche und Bar verteilt." },
      kitchen: { title: "Die Bestellung verteilt sich selbst", copy: "T8 erscheint sofort an den richtigen Stationen – ohne Abschreiben oder Zurufen." },
      floor: { title: "Der Service kennt den Stand", copy: "T8 ist belegt; Status, Gänge und Rechnung sind sichtbar, ohne die Küche zu unterbrechen." },
      checkout: { title: "Die Rechnung ist vorbereitet", copy: "Artikel und Summe bleiben beim Tisch. Die Kasse prüft und schließt den Vorgang direkt ab." },
      owner: { title: "Der Inhaber sieht den Service", copy: "Umsatz, Zeiten und gefragte Produkte werden automatisch zu nutzbaren Informationen." },
    },
    results: { eyebrow: "Demo-Ergebnis", title: "Ein Ablauf, ohne mündliche Übergaben.", copy: "Dies sind Beispieldaten; im Restaurant aktualisieren sie sich mit dem echten Service.", revenue: "Sichtbarer Umsatz", revenueNote: "Offene Tische aktualisiert", kitchenTime: "Ø Küchenzeit", kitchenNote: "Von neu bis fertig", completed: "Erfasste Bons", completedNote: "Küche und Bar", top: "Beliebtestes Produkt", topNote: "Für Menü und Einkauf" },
  },
  es: {
    start: "Iniciar demo guiada", startMeta: "5 pasos · 10 minutos", free: "Explorar libremente", freeMeta: "Abrir cualquier pantalla sin recorrido",
    step: "Paso", of: "de", previous: "Atrás", next: "Continuar", finish: "Probarlo en mi restaurante", close: "Salir del recorrido",
    orderNotice: "Pedido de T8 recibido: cocina y bar han sido avisados.",
    labels: { guest: "Cliente", kitchen: "Cocina", floor: "Sala", checkout: "Caja", owner: "Propietario" },
    steps: {
      guest: { title: "El cliente pide desde la mesa", copy: "Muestra el menú QR, los alérgenos y el carrito. Después el pedido se reparte entre cocina y bar." },
      kitchen: { title: "El pedido se divide solo", copy: "T8 aparece en los puestos correctos al instante, sin reescribir ni preguntar." },
      floor: { title: "La sala conoce el estado", copy: "T8 figura ocupado y el camarero sigue estado, platos y cuenta sin interrumpir la cocina." },
      checkout: { title: "La cuenta ya está preparada", copy: "Los artículos y el total siguen a la mesa. Caja revisa y cierra sin reconstruir el pedido." },
      owner: { title: "El propietario ve el servicio", copy: "Ingresos, tiempos y productos populares se convierten en información útil automáticamente." },
    },
    results: { eyebrow: "Resultado de la demo", title: "Un solo flujo, sin mensajes de voz.", copy: "Son datos de muestra; en el restaurante se actualizan con el servicio real.", revenue: "Ingresos visibles", revenueNote: "Mesas abiertas actualizadas", kitchenTime: "Tiempo medio de cocina", kitchenNote: "De nuevo a listo", completed: "Comandas seguidas", completedNote: "Cocina y bar incluidas", top: "Producto más pedido", topNote: "Útil para menú y compras" },
  },
  ru: {
    start: "Запустить демо с подсказками", startMeta: "5 шагов · 10 минут", free: "Свободный просмотр", freeMeta: "Откройте любой экран без тура",
    step: "Шаг", of: "из", previous: "Назад", next: "Далее", finish: "Попробовать в ресторане", close: "Выйти из тура",
    orderNotice: "Заказ стола T8 принят: кухня и бар уведомлены.",
    labels: { guest: "Гость", kitchen: "Кухня", floor: "Зал", checkout: "Касса", owner: "Владелец" },
    steps: {
      guest: { title: "Гость заказывает за столом", copy: "Покажите QR-меню, аллергены и корзину. Затем заказ автоматически разделится между кухней и баром." },
      kitchen: { title: "Заказ распределяется сам", copy: "T8 сразу появляется на нужных постах — без переписывания и устных уточнений." },
      floor: { title: "Зал видит состояние", copy: "T8 занят, а официант следит за блюдами и счётом, не отвлекая кухню." },
      checkout: { title: "Счёт уже подготовлен", copy: "Позиции и сумма связаны со столом. Касса проверяет и закрывает заказ без пересчёта." },
      owner: { title: "Владелец видит сервис", copy: "Выручка, время и популярные блюда автоматически становятся полезными данными." },
    },
    results: { eyebrow: "Результат демо", title: "Единый процесс без устных передач.", copy: "Это демонстрационные данные; в ресторане они обновляются во время работы.", revenue: "Видимая выручка", revenueNote: "Открытые столы обновлены", kitchenTime: "Среднее время кухни", kitchenNote: "От нового до готового", completed: "Заказов отслеживается", completedNote: "Кухня и бар", top: "Популярное блюдо", topNote: "Для меню и закупок" },
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
  const [view, setView] = useState("menu");
  const [tourActive, setTourActive] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [orderSent, setOrderSent] = useState(false);
  const [orderNotice, setOrderNotice] = useState(false);
  const journey = journeyTranslations[locale] || journeyTranslations.it;
  const currentTourStep = getDemoJourneyStep(tourStepIndex);
  const currentTourCopy = journey.steps[currentTourStep.id];
  const requestUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.whatsapp)}`;

  const visibleTables = useMemo(() => getDemoTablesAfterOrder(demoTables, orderSent), [orderSent]);
  const visibleOrders = useMemo(() => getDemoOrdersAfterOrder(demoOrders, orderSent), [orderSent]);

  const stats = useMemo(() => ({
    occupied: visibleTables.filter((table) => ["occupied", "ready", "bill"].includes(table.status)).length,
    total: visibleTables.reduce((sum, table) => sum + table.total, 0),
  }), [visibleTables]);

  const itemName = (id) => t.menuNames[id] || id;

  function scrollToTour() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.getElementById("demo-guided-tour")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  }

  function goToTourStep(index, shouldScroll = false) {
    const step = getDemoJourneyStep(index);
    const safeIndex = DEMO_JOURNEY.indexOf(step);
    if (safeIndex > 0) setOrderSent(true);
    setTourStepIndex(safeIndex);
    setView(step.view);
    if (shouldScroll) scrollToTour();
  }

  function startTour() {
    setTourActive(true);
    setOrderSent(false);
    setOrderNotice(false);
    goToTourStep(0, true);
  }

  function exploreFreely() {
    setTourActive(false);
    setView("menu");
    document.getElementById("demo-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleViewChange(nextView) {
    setView(nextView);
    if (tourActive) setTourStepIndex(getDemoJourneyIndex(nextView));
  }

  function handleDemoOrder() {
    setOrderSent(true);
    setOrderNotice(true);
    setTourActive(true);
    goToTourStep(1, true);
  }

  return (
    <main className="demo-page" aria-busy={isTranslating}>
      <header className="demo-topbar">
        <Link to="/" className="demo-brand"><img src={logoOrdynora} alt="Ordynora" /><span>Ordynora Demo</span></Link>
        <div className="demo-actions"><LocaleSwitcher variant="light" /><Link to="/login">{t.login}</Link><a className="is-strong" href={requestUrl} target="_blank" rel="noreferrer">{t.request}</a></div>
      </header>

      <section className="demo-hero">
        <div><span className="demo-kicker">{t.kicker}</span><h1>{t.title}</h1><p className="demo-hero-copy">{t.hero}</p>
          <div className="demo-hero-actions" aria-label="Demo">
            <button type="button" onClick={startTour}>
              <span>{DEMO_TOTAL_MINUTES}</span><strong>{journey.start}</strong><small>{journey.startMeta}</small>
            </button>
            <button type="button" onClick={exploreFreely}>
              <span aria-hidden="true">↗</span><strong>{journey.free}</strong><small>{journey.freeMeta}</small>
            </button>
          </div>
        </div>
        <div className="demo-live-panel"><span>{t.restaurant}</span><strong>{t.tablesReady}</strong><div className="demo-kpis"><div><span>{t.occupied}</span><strong>{stats.occupied}</strong></div><div><span>{t.orders}</span><strong>{visibleOrders.length}</strong></div><div><span>{t.liveTotal}</span><strong>{money(stats.total, locale, true)}</strong></div></div><p>{t.panelCopy}</p></div>
      </section>

      {tourActive ? (
        <section id="demo-guided-tour" className="demo-tour" aria-labelledby="demo-tour-title">
          <div className="demo-tour-topline">
            <span>{journey.step} {tourStepIndex + 1} {journey.of} {DEMO_JOURNEY.length} · {currentTourStep.minuteStart}–{currentTourStep.minuteEnd} min</span>
            <button type="button" onClick={() => setTourActive(false)}>{journey.close}</button>
          </div>
          <div className="demo-tour-progress" aria-hidden="true"><i style={{ width: `${((tourStepIndex + 1) / DEMO_JOURNEY.length) * 100}%` }} /></div>
          <div className="demo-tour-steps" aria-label={journey.start}>
            {DEMO_JOURNEY.map((step, index) => (
              <button key={step.id} type="button" className={index === tourStepIndex ? "is-active" : index < tourStepIndex ? "is-done" : ""} aria-current={index === tourStepIndex ? "step" : undefined} onClick={() => goToTourStep(index)}>
                <i>{index < tourStepIndex ? "✓" : index + 1}</i><span>{journey.labels[step.id]}</span>
              </button>
            ))}
          </div>
          <div className="demo-tour-content">
            <div><span>{journey.labels[currentTourStep.id]}</span><h2 id="demo-tour-title">{currentTourCopy.title}</h2><p>{currentTourCopy.copy}</p></div>
            <div className="demo-tour-navigation">
              <button type="button" disabled={tourStepIndex === 0} onClick={() => goToTourStep(tourStepIndex - 1)}>{journey.previous}</button>
              {tourStepIndex < DEMO_JOURNEY.length - 1
                ? <button className="is-primary" type="button" onClick={() => goToTourStep(tourStepIndex + 1)}>{journey.next} →</button>
                : <a className="is-primary" href={requestUrl} target="_blank" rel="noreferrer">{journey.finish} →</a>}
            </div>
          </div>
        </section>
      ) : null}

      {orderNotice ? <div className="demo-notice" role="status" aria-live="polite"><span aria-hidden="true">✓</span>{journey.orderNotice}</div> : null}

      <nav id="demo-tabs" className="demo-tabs" aria-label="Demo">
        {["menu", "cucina", "tavoli", "cassa", "risultati"].map((id) => <button key={id} type="button" className={view === id ? "is-active" : ""} onClick={() => handleViewChange(id)}>{t.tabs[id]}</button>)}
      </nav>

      {view === "tavoli" ? <section className="demo-table-grid">{visibleTables.map((table) => <article key={table.id} className={`demo-table-card ${table.status} ${orderSent && table.id === DEMO_ORDER.tableId ? "is-highlighted" : ""}`}><div><strong>{table.name}</strong><span>{t.qrActive}</span></div><div className="demo-table-bottom"><span>{t.statuses[table.status]}</span><b>{table.total ? money(table.total, locale) : table.time}</b></div></article>)}</section> : null}

      {view === "menu" ? <section className="demo-split"><div className="demo-menu-grid">{demoMenu.map((item) => <article className="demo-menu-card" key={item.id}><img src={item.imageUrl} alt="" /><div><div className="demo-menu-meta"><span>{t.categories[item.category]}</span>{item.featured ? <b>{t.recommended}</b> : null}</div><h3>{itemName(item.id)}</h3><p>{t.allergens}: {item.allergens}</p><strong>{money(item.price, locale)}</strong></div></article>)}</div><aside className="demo-side-panel demo-cart-panel"><h2>{t.cart}</h2><div className="demo-check-row"><span>{itemName("risotto")}</span><b>{money(18, locale)}</b></div><div className="demo-check-row"><span>{itemName("spritz")}</span><b>{money(8, locale)}</b></div><div className="demo-total"><span>{t.total}</span><strong>{money(26, locale)}</strong></div><button className="demo-primary" type="button" onClick={handleDemoOrder}>{t.sendOrder}</button></aside></section> : null}

      {view === "cucina" ? <section className="demo-orders-grid">{visibleOrders.map((order, index) => <article key={`${order.table}-${order.area}-${order.time}-${index}`} className={`demo-order-card ${order.status === "ready" ? "ready" : ""} ${orderSent && order.table === DEMO_ORDER.tableName ? "is-highlighted" : ""}`}><div className="demo-order-head"><div><strong>{order.table}</strong><span>{t.areas[order.area]}</span></div><b>{order.time}</b></div><ul>{order.items.map(([id, suffix = ""]) => <li key={`${id}${suffix}`}>{itemName(id)}{suffix}</li>)}</ul><span className="demo-order-status">{t.orderStatuses[order.status]}</span></article>)}</section> : null}

      {view === "cassa" ? <section className="demo-split"><div className="demo-cash-list">{visibleTables.filter((table) => table.total > 0).map((table) => <article key={table.id} className={`demo-cash-row ${orderSent && table.id === DEMO_ORDER.tableId ? "is-highlighted" : ""}`}><div><strong>{table.name}</strong><span>{t.statuses[table.status]} · {table.time}</span></div><b>{money(table.total, locale)}</b><button type="button">{t.prebill}</button></article>)}</div><aside className="demo-side-panel dark"><h2>{t.demoAccess}</h2>{demoEmails.map((email, index) => <div className="demo-login-row" key={email}><span>{t.roles[index]}</span><b>{email}</b></div>)}<p>{t.password}: EasyMenu2026!</p><Link className="demo-primary light" to="/login">{t.enterDemo}</Link></aside></section> : null}

      {view === "risultati" ? (
        <section className="demo-results">
          <header><span>{journey.results.eyebrow}</span><h2>{journey.results.title}</h2><p>{journey.results.copy}</p></header>
          <div className="demo-owner-grid">
            <article className="demo-owner-card"><span>{journey.results.revenue}</span><strong>{money(stats.total, locale, true)}</strong><small>{journey.results.revenueNote}</small></article>
            <article className="demo-owner-card"><span>{journey.results.kitchenTime}</span><strong>12 min</strong><small>{journey.results.kitchenNote}</small></article>
            <article className="demo-owner-card"><span>{journey.results.completed}</span><strong>{visibleOrders.length}</strong><small>{journey.results.completedNote}</small></article>
            <article className="demo-owner-card"><span>{journey.results.top}</span><strong className="is-product">{itemName("risotto")}</strong><small>{journey.results.topNote}</small></article>
          </div>
        </section>
      ) : null}

      <section className="demo-beta-strip"><div><span>{t.beta}</span><strong>{t.betaTitle}</strong><small>{t.betaCopy}</small></div><a href={requestUrl} target="_blank" rel="noreferrer">{t.request}</a></section>
    </main>
  );
}
