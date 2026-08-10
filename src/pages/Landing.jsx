import { Link } from "react-router-dom";
import LocaleSwitcher from "../components/LocaleSwitcher";
import { useTranslatedContent } from "../hooks/useTranslatedContent";
import logoEasyMenu from "../assets/logo-easymenu.png";
import restaurantServiceImage from "../assets/landing-restaurant-service-v2.jpg";

const SUPPORT_EMAIL = "easy.menu.service@gmail.com";
const WHATSAPP_NUMBER = "393240467723";

const translations = {
  it: {
    nav: { demo: "Demo", privacy: "Privacy", login: "Login", contact: "Parla con noi" },
    eyebrow: "Menu QR, sala, cucina e cassa in un solo flusso",
    title: "EasyMenu per ristoranti",
    promise: "Riduci gli errori di sala e tieni il servizio più sotto controllo.",
    lead: "Dal QR del cliente alla comanda, fino al conto: ogni passaggio resta chiaro, aggiornato e collegato durante il servizio.",
    requestDemo: "Richiedi demo gratuita",
    watchDemo: "Guarda demo pubblica",
    emailUs: "Scrivi via email",
    proof: "Demo gratuita riservata ai primi 3 ristoranti, configurazione inclusa e nessun vincolo iniziale.",
    serviceLabel: "Cosa include EasyMenu",
    serviceProof: [
      "Menu QR collegato a cucina, bar e cassa",
      "Comande tracciate per tavolo e stato",
      "Cassa e sala leggono gli stessi conti",
      "Setup assistito prima della prova reale",
    ],
    whyLabel: "Perché cambiare software",
    whyTitle: "La differenza non è avere un QR. È far lavorare meglio il ristorante.",
    outcomes: [
      ["Aiuta il servizio a reggere meglio i picchi", "Il cliente ordina dal QR, cucina e bar ricevono subito la comanda e la sala interviene solo dove serve davvero."],
      ["Riduci errori e passaggi manuali", "Note, varianti, stato ordine e tavolo sono tracciati in un unico flusso: meno foglietti, telefonate interne e incomprensioni."],
      ["Rendi il menu più ordinato e vendibile", "Categorie, immagini, extra, bevande e dessert restano sempre aggiornati e più facili da proporre nel momento giusto."],
      ["Leggi meglio quello che succede", "Dashboard orientata a coperti, tempi di servizio, venduto per categoria, tavoli lenti e punti critici ricorrenti."],
    ],
    pricingLabel: "Prezzi chiari e cliccabili",
    pricingTitle: "EasyMenu parte da 49,99 €/mese + IVA.",
    pricingCopy: "Tutti i piani includono menu QR, cucina, bar, cassa, tavoli, onboarding e portale abbonamento. Clicca un piano per richiedere informazioni.",
    plans: [
      ["Mensile", "49,99 €/mese + IVA", "Rinnovo mensile e disdetta dal portale abbonamento."],
      ["Trimestrale", "134,99 €/3 mesi + IVA", "Per iniziare su una stagione breve con supporto incluso."],
      ["Semestrale", "254,99 €/6 mesi + IVA", "Il piano più equilibrato per stabilizzare menu, QR e operatività."],
      ["Annuale", "449,99 €/anno + IVA", "Miglior prezzo per chi vuole partire con continuità."],
    ],
    clickPlan: "Clicca per richiedere questo piano →",
    betaLabel: "Demo gratuita · primi 3 ristoranti",
    betaTitle: "Ti attivo EasyMenu gratuitamente nel tuo ristorante.",
    betaCopy: "Setup guidato, QR tavoli, menu, cucina, cassa e prima prova servizio insieme. La disponibilità gratuita termina dopo le prime 3 attivazioni.",
    flowLabel: "Flusso operativo",
    flowTitle: "Non solo menu digitale: un modo più chiaro di lavorare durante il servizio.",
    flowCopy: "EasyMenu collega menu, ordini, cucina, cassa e tavoli nello stesso ambiente. Ogni reparto vede le informazioni giuste al momento giusto, senza rincorrere foglietti, messaggi o aggiornamenti a voce.",
    classicTitle: "Menu digitale classico",
    classicCopy: "QR, PDF online, modifiche menu e statistiche base.",
    easyTitle: "EasyMenu",
    easyCopy: "Meno errori, più chiarezza, menu ordinato e flusso operativo unico.",
    finalTitle: "Meno passaggi manuali, più controllo e un servizio più ordinato.",
    finalCopy: "Richiedi la demo gratuita: ti contattiamo noi per configurare il ristorante e organizzare la prima prova.",
    whatsappMessage: "Ciao, vorrei richiedere la demo gratuita EasyMenu per il mio ristorante.",
    planMessage: "Ciao, vorrei informazioni sul piano EasyMenu",
    emailSubject: "Richiesta demo gratuita EasyMenu",
    emailBody: "Ciao, vorrei richiedere la demo gratuita EasyMenu per il mio ristorante. Potete ricontattarmi?",
  },
  en: {
    nav: { demo: "Demo", privacy: "Privacy", login: "Login", contact: "Talk to us" },
    eyebrow: "QR menu, floor, kitchen and checkout in one workflow",
    title: "EasyMenu for restaurants",
    promise: "Reduce service errors and keep every shift under control.",
    lead: "From the customer's QR code to the order and the bill: every step stays clear, up to date and connected throughout service.",
    requestDemo: "Request a free demo",
    watchDemo: "View public demo",
    emailUs: "Email us",
    proof: "Free demo for the first 3 restaurants only, setup included and no initial commitment.",
    serviceLabel: "What EasyMenu includes",
    serviceProof: ["QR menu connected to kitchen, bar and checkout", "Orders tracked by table and status", "Checkout and floor staff share the same bills", "Assisted setup before the live trial"],
    whyLabel: "Why change software",
    whyTitle: "The difference is not having a QR code. It is helping the restaurant work better.",
    outcomes: [
      ["Handle peak service more smoothly", "Guests order via QR, kitchen and bar receive orders instantly, and floor staff step in only where they are truly needed."],
      ["Reduce errors and manual steps", "Notes, options, order status and table are tracked in one workflow: fewer scraps of paper, internal calls and misunderstandings."],
      ["Make your menu clearer and easier to sell", "Categories, images, extras, drinks and desserts stay updated and are easier to suggest at the right time."],
      ["Understand what is happening", "A dashboard focused on covers, service times, sales by category, slow tables and recurring bottlenecks."],
    ],
    pricingLabel: "Clear, clickable pricing",
    pricingTitle: "EasyMenu starts at €49.99/month + VAT.",
    pricingCopy: "Every plan includes QR menu, kitchen, bar, checkout, tables, onboarding and the subscription portal. Click a plan to ask for details.",
    plans: [["Monthly", "€49.99/month + VAT", "Monthly renewal and cancellation from the subscription portal."], ["Quarterly", "€134.99/3 months + VAT", "Ideal for starting during a short season, with support included."], ["Six months", "€254.99/6 months + VAT", "The most balanced plan for stabilising menu, QR and operations."], ["Annual", "€449.99/year + VAT", "Best price for restaurants that want continuity."]],
    clickPlan: "Click to request this plan →",
    betaLabel: "Free demo · first 3 restaurants",
    betaTitle: "I will activate EasyMenu in your restaurant for free.",
    betaCopy: "Guided setup, table QR codes, menu, kitchen, checkout and your first live trial together. Free availability ends after the first 3 activations.",
    flowLabel: "Operational workflow",
    flowTitle: "More than a digital menu: a clearer way to work during service.",
    flowCopy: "EasyMenu connects menu, orders, kitchen, checkout and tables in one environment. Each team sees the right information at the right time.",
    classicTitle: "Traditional digital menu", classicCopy: "QR code, online PDF, menu updates and basic statistics.",
    easyTitle: "EasyMenu", easyCopy: "Fewer errors, more clarity, an organised menu and one operational workflow.",
    finalTitle: "Fewer manual steps, more control and a better organised service.",
    finalCopy: "Request your free demo: we will contact you to configure the restaurant and arrange the first trial.",
    whatsappMessage: "Hello, I would like to request the free EasyMenu demo for my restaurant.",
    planMessage: "Hello, I would like information about the EasyMenu plan",
    emailSubject: "EasyMenu free demo request", emailBody: "Hello, I would like to request the free EasyMenu demo for my restaurant. Could you contact me?",
  },
  de: {
    nav: { demo: "Demo", privacy: "Datenschutz", login: "Login", contact: "Kontakt" },
    eyebrow: "QR-Menü, Service, Küche und Kasse in einem Ablauf",
    title: "EasyMenu für Restaurants",
    promise: "Weniger Servicefehler und mehr Kontrolle über jede Schicht.",
    lead: "Vom QR-Code des Gastes über die Bestellung bis zur Rechnung: Jeder Schritt bleibt während des Service klar, aktuell und verbunden.",
    requestDemo: "Kostenlose Demo anfragen", watchDemo: "Öffentliche Demo ansehen", emailUs: "E-Mail senden",
    proof: "Kostenlose Demo nur für die ersten 3 Restaurants, Einrichtung inklusive und ohne anfängliche Bindung.",
    serviceLabel: "Was EasyMenu enthält",
    serviceProof: ["QR-Menü mit Küche, Bar und Kasse verbunden", "Bestellungen nach Tisch und Status verfolgt", "Kasse und Service sehen dieselben Rechnungen", "Begleitete Einrichtung vor dem Praxistest"],
    whyLabel: "Warum die Software wechseln", whyTitle: "Der Unterschied ist nicht der QR-Code. Entscheidend ist, dass das Restaurant besser arbeitet.",
    outcomes: [["Spitzenzeiten besser bewältigen", "Gäste bestellen per QR, Küche und Bar erhalten die Bestellung sofort und der Service greift nur dort ein, wo er wirklich gebraucht wird."], ["Fehler und manuelle Schritte reduzieren", "Notizen, Varianten, Bestellstatus und Tisch werden in einem Ablauf erfasst: weniger Zettel, Anrufe und Missverständnisse."], ["Das Menü übersichtlicher und verkaufsstärker machen", "Kategorien, Bilder, Extras, Getränke und Desserts bleiben aktuell und lassen sich im richtigen Moment leichter anbieten."], ["Besser verstehen, was passiert", "Dashboard für Gästezahlen, Servicezeiten, Umsatz nach Kategorie, langsame Tische und wiederkehrende Engpässe."]],
    pricingLabel: "Klare, anklickbare Preise", pricingTitle: "EasyMenu ab 49,99 €/Monat zzgl. MwSt.", pricingCopy: "Alle Tarife enthalten QR-Menü, Küche, Bar, Kasse, Tische, Onboarding und Abo-Portal. Tarif anklicken, um Informationen anzufordern.",
    plans: [["Monatlich", "49,99 €/Monat + MwSt.", "Monatliche Verlängerung und Kündigung im Abo-Portal."], ["Vierteljährlich", "134,99 €/3 Monate + MwSt.", "Ideal für den Start in einer kurzen Saison, inklusive Support."], ["Halbjährlich", "254,99 €/6 Monate + MwSt.", "Der ausgewogene Tarif für Menü, QR und Betriebsabläufe."], ["Jährlich", "449,99 €/Jahr + MwSt.", "Bester Preis für einen langfristigen Einsatz."]],
    clickPlan: "Diesen Tarif anfragen →", betaLabel: "Kostenlose Demo · erste 3 Restaurants", betaTitle: "Ich aktiviere EasyMenu kostenlos in Ihrem Restaurant.", betaCopy: "Geführte Einrichtung, Tisch-QR-Codes, Menü, Küche, Kasse und erster Praxistest. Das Gratisangebot endet nach den ersten 3 Aktivierungen.",
    flowLabel: "Betriebsablauf", flowTitle: "Mehr als ein digitales Menü: klarere Abläufe während des Service.", flowCopy: "EasyMenu verbindet Menü, Bestellungen, Küche, Kasse und Tische in einer Umgebung. Jedes Team sieht die richtigen Informationen zur richtigen Zeit.",
    classicTitle: "Klassisches digitales Menü", classicCopy: "QR-Code, Online-PDF, Menüänderungen und grundlegende Statistiken.", easyTitle: "EasyMenu", easyCopy: "Weniger Fehler, mehr Klarheit, ein geordnetes Menü und ein gemeinsamer Betriebsablauf.",
    finalTitle: "Weniger manuelle Schritte, mehr Kontrolle und ein besser organisierter Service.", finalCopy: "Kostenlose Demo anfragen: Wir kontaktieren Sie, konfigurieren das Restaurant und planen den ersten Test.",
    whatsappMessage: "Hallo, ich möchte die kostenlose EasyMenu-Demo für mein Restaurant anfragen.", planMessage: "Hallo, ich möchte Informationen zum EasyMenu-Tarif", emailSubject: "Anfrage kostenlose EasyMenu-Demo", emailBody: "Hallo, ich möchte die kostenlose EasyMenu-Demo für mein Restaurant anfragen. Können Sie mich kontaktieren?",
  },
  es: {
    nav: { demo: "Demo", privacy: "Privacidad", login: "Acceso", contact: "Hablemos" },
    eyebrow: "Menú QR, sala, cocina y caja en un solo flujo", title: "EasyMenu para restaurantes", promise: "Reduce los errores de sala y mantén cada servicio bajo control.",
    lead: "Desde el QR del cliente hasta el pedido y la cuenta: cada paso permanece claro, actualizado y conectado durante el servicio.", requestDemo: "Solicitar demo gratuita", watchDemo: "Ver demo pública", emailUs: "Enviar email",
    proof: "Demo gratuita solo para los primeros 3 restaurantes, configuración incluida y sin compromiso inicial.", serviceLabel: "Qué incluye EasyMenu",
    serviceProof: ["Menú QR conectado con cocina, bar y caja", "Pedidos controlados por mesa y estado", "Caja y sala comparten las mismas cuentas", "Configuración asistida antes de la prueba real"],
    whyLabel: "Por qué cambiar de software", whyTitle: "La diferencia no está en tener un QR. Está en hacer que el restaurante funcione mejor.",
    outcomes: [["Gestiona mejor las horas punta", "El cliente pide desde el QR, cocina y bar reciben el pedido al instante y la sala interviene solo donde hace falta."], ["Reduce errores y pasos manuales", "Notas, variantes, estado del pedido y mesa se controlan en un único flujo: menos papeles, llamadas y malentendidos."], ["Haz que el menú sea más claro y vendible", "Categorías, imágenes, extras, bebidas y postres siempre actualizados y más fáciles de ofrecer en el momento adecuado."], ["Entiende mejor lo que ocurre", "Panel centrado en comensales, tiempos de servicio, ventas por categoría, mesas lentas y puntos críticos recurrentes."]],
    pricingLabel: "Precios claros y clicables", pricingTitle: "EasyMenu desde 49,99 €/mes + IVA.", pricingCopy: "Todos los planes incluyen menú QR, cocina, bar, caja, mesas, onboarding y portal de suscripción. Haz clic en un plan para pedir información.",
    plans: [["Mensual", "49,99 €/mes + IVA", "Renovación mensual y cancelación desde el portal de suscripción."], ["Trimestral", "134,99 €/3 meses + IVA", "Ideal para empezar durante una temporada corta, con soporte incluido."], ["Semestral", "254,99 €/6 meses + IVA", "El plan más equilibrado para estabilizar menú, QR y operaciones."], ["Anual", "449,99 €/año + IVA", "El mejor precio para trabajar con continuidad."]],
    clickPlan: "Solicitar este plan →", betaLabel: "Demo gratuita · primeros 3 restaurantes", betaTitle: "Activo EasyMenu gratis en tu restaurante.", betaCopy: "Configuración guiada, QR de mesas, menú, cocina, caja y primera prueba juntos. La oferta gratuita termina tras las primeras 3 activaciones.",
    flowLabel: "Flujo operativo", flowTitle: "Más que un menú digital: una forma más clara de trabajar durante el servicio.", flowCopy: "EasyMenu conecta menú, pedidos, cocina, caja y mesas en un mismo entorno. Cada equipo ve la información correcta en el momento adecuado.",
    classicTitle: "Menú digital clásico", classicCopy: "QR, PDF online, cambios de menú y estadísticas básicas.", easyTitle: "EasyMenu", easyCopy: "Menos errores, más claridad, menú ordenado y un único flujo operativo.",
    finalTitle: "Menos pasos manuales, más control y un servicio mejor organizado.", finalCopy: "Solicita la demo gratuita: te contactaremos para configurar el restaurante y organizar la primera prueba.",
    whatsappMessage: "Hola, quiero solicitar la demo gratuita de EasyMenu para mi restaurante.", planMessage: "Hola, quiero información sobre el plan EasyMenu", emailSubject: "Solicitud de demo gratuita EasyMenu", emailBody: "Hola, quiero solicitar la demo gratuita de EasyMenu para mi restaurante. ¿Podéis contactarme?",
  },
  ru: {
    nav: { demo: "Демо", privacy: "Конфиденциальность", login: "Войти", contact: "Связаться" },
    eyebrow: "QR-меню, зал, кухня и касса в единой системе", title: "EasyMenu для ресторанов", promise: "Меньше ошибок в зале и больше контроля над каждой сменой.",
    lead: "От QR-кода гостя до заказа и счёта: каждый этап остаётся понятным, актуальным и связанным на протяжении обслуживания.", requestDemo: "Запросить бесплатное демо", watchDemo: "Открыть публичное демо", emailUs: "Написать по email",
    proof: "Бесплатное демо только для первых 3 ресторанов, настройка включена, без начальных обязательств.", serviceLabel: "Что входит в EasyMenu",
    serviceProof: ["QR-меню связано с кухней, баром и кассой", "Заказы отслеживаются по столу и статусу", "Касса и зал видят одни и те же счета", "Настройка с сопровождением до реального теста"],
    whyLabel: "Зачем менять программу", whyTitle: "Важно не просто иметь QR-код. Важно, чтобы ресторан работал лучше.",
    outcomes: [["Легче справляться с пиковыми часами", "Гость заказывает по QR, кухня и бар сразу получают заказ, а сотрудники зала подключаются только там, где это действительно нужно."], ["Меньше ошибок и ручных действий", "Примечания, варианты, статус заказа и стол собраны в одном процессе: меньше бумажек, звонков и недопонимания."], ["Более понятное и продающее меню", "Категории, фотографии, дополнения, напитки и десерты всегда актуальны, и их легче предложить вовремя."], ["Лучше понимать работу ресторана", "Панель с количеством гостей, временем обслуживания, продажами по категориям, медленными столами и повторяющимися проблемами."]],
    pricingLabel: "Понятные цены", pricingTitle: "EasyMenu — от 49,99 € в месяц + НДС.", pricingCopy: "Все тарифы включают QR-меню, кухню, бар, кассу, столы, подключение и портал подписки. Нажмите на тариф, чтобы узнать подробнее.",
    plans: [["Ежемесячно", "49,99 €/месяц + НДС", "Ежемесячное продление и отмена в портале подписки."], ["На 3 месяца", "134,99 €/3 месяца + НДС", "Удобно для начала короткого сезона, поддержка включена."], ["На 6 месяцев", "254,99 €/6 месяцев + НДС", "Сбалансированный тариф для стабильной работы меню, QR и процессов."], ["На год", "449,99 €/год + НДС", "Лучшая цена для постоянной работы."]],
    clickPlan: "Запросить этот тариф →", betaLabel: "Бесплатное демо · первые 3 ресторана", betaTitle: "Мы бесплатно подключим EasyMenu в вашем ресторане.", betaCopy: "Пошаговая настройка, QR-коды столов, меню, кухня, касса и первый тест. Бесплатное предложение действует для первых 3 подключений.",
    flowLabel: "Рабочий процесс", flowTitle: "Больше чем цифровое меню: понятная работа во время обслуживания.", flowCopy: "EasyMenu объединяет меню, заказы, кухню, кассу и столы. Каждая команда видит нужную информацию в нужный момент.",
    classicTitle: "Обычное цифровое меню", classicCopy: "QR-код, PDF онлайн, изменение меню и базовая статистика.", easyTitle: "EasyMenu", easyCopy: "Меньше ошибок, больше ясности, аккуратное меню и единый рабочий процесс.",
    finalTitle: "Меньше ручных действий, больше контроля и порядка в обслуживании.", finalCopy: "Запросите бесплатное демо: мы свяжемся с вами, настроим ресторан и организуем первый тест.",
    whatsappMessage: "Здравствуйте, я хочу запросить бесплатное демо EasyMenu для моего ресторана.", planMessage: "Здравствуйте, я хочу узнать подробнее о тарифе EasyMenu", emailSubject: "Запрос бесплатного демо EasyMenu", emailBody: "Здравствуйте, я хочу запросить бесплатное демо EasyMenu для моего ресторана. Свяжитесь со мной, пожалуйста.",
  },
};

function whatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function emailUrl(subject, body) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function Card({ children, className = "" }) {
  return <div className={`landing-card ${className}`}>{children}</div>;
}

export default function Landing() {
  const { content: t, isTranslating } = useTranslatedContent("landing", translations);
  const demoContactUrl = whatsappUrl(t.whatsappMessage);
  const demoEmailUrl = emailUrl(t.emailSubject, t.emailBody);

  return (
    <main className="landing-page" aria-busy={isTranslating}>
      <section className="landing-hero" style={{ "--landing-hero-image": `url(${restaurantServiceImage})` }}>
        <nav className="landing-nav">
          <div className="landing-brand"><img src={logoEasyMenu} alt="EasyMenu" /><span>EasyMenu</span></div>
          <div className="landing-nav-actions">
            <Link to="/demo">{t.nav.demo}</Link>
            <Link to="/privacy">{t.nav.privacy}</Link>
            <Link to="/login">{t.nav.login}</Link>
            <LocaleSwitcher />
            <a className="landing-nav-cta" href={demoContactUrl} target="_blank" rel="noreferrer">{t.nav.contact}</a>
          </div>
        </nav>

        <div className="landing-hero-content">
          <div className="landing-eyebrow">{t.eyebrow}</div>
          <h1>{t.title}</h1>
          <p className="landing-hero-promise">{t.promise}</p>
          <p className="landing-lead">{t.lead}</p>
          <div className="landing-cta-row">
            <a className="landing-primary" href={demoContactUrl} target="_blank" rel="noreferrer">{t.requestDemo}</a>
            <Link className="landing-secondary" to="/demo">{t.watchDemo}</Link>
            <a className="landing-secondary" href={demoEmailUrl}>{t.emailUs}</a>
          </div>
          <p className="landing-proof">{t.proof}</p>
        </div>
      </section>

      <section className="landing-service-proof" aria-label={t.serviceLabel}>
        {t.serviceProof.map((item, index) => <article key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></article>)}
      </section>

      <section className="landing-section">
        <div className="landing-section-title"><span>{t.whyLabel}</span><h2>{t.whyTitle}</h2></div>
        <div className="landing-grid-4">
          {t.outcomes.map(([title, text]) => <Card key={title}><h3>{title}</h3><p>{text}</p></Card>)}
        </div>
      </section>

      <section className="landing-section landing-pricing-section">
        <div className="landing-section-title"><span>{t.pricingLabel}</span><h2>{t.pricingTitle}</h2><p>{t.pricingCopy}</p></div>
        <div className="landing-pricing-grid">
          {t.plans.map(([title, price, text], index) => (
            <a key={title} className={`landing-card landing-price-card${index === 2 ? " featured" : ""}`} href={whatsappUrl(`${t.planMessage}: ${title} (${price}).`)} target="_blank" rel="noreferrer">
              <span>{title}</span><strong>{price}</strong><p>{text}</p><small>{t.clickPlan}</small>
            </a>
          ))}
        </div>
        <div className="landing-beta-box">
          <div><span>{t.betaLabel}</span><h3>{t.betaTitle}</h3><p>{t.betaCopy}</p></div>
          <div className="landing-beta-actions">
            <a className="landing-primary" href={demoContactUrl} target="_blank" rel="noreferrer">{t.requestDemo}</a>
            <a className="landing-beta-email" href={demoEmailUrl}>{t.emailUs}</a>
          </div>
        </div>
      </section>

      <section className="landing-section landing-contrast">
        <div><span className="landing-section-kicker">{t.flowLabel}</span><h2>{t.flowTitle}</h2><p>{t.flowCopy}</p></div>
        <div className="landing-comparison">
          <div><strong>{t.classicTitle}</strong><span>{t.classicCopy}</span></div>
          <div><strong>{t.easyTitle}</strong><span>{t.easyCopy}</span></div>
        </div>
      </section>

      <section className="landing-section landing-final"><h2>{t.finalTitle}</h2><p>{t.finalCopy}</p><div className="landing-cta-row center"><a className="landing-primary" href={demoContactUrl} target="_blank" rel="noreferrer">{t.requestDemo}</a></div></section>
    </main>
  );
}
