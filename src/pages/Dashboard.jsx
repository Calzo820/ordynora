import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import DashboardAlerts from "../components/dashboard/DashboardAlerts.jsx";
import DashboardHeader from "../components/dashboard/DashboardHeader.jsx";
import DashboardHourFlow from "../components/dashboard/DashboardHourFlow.jsx";
import DashboardLiveOrders from "../components/dashboard/DashboardLiveOrders.jsx";
import DashboardStat from "../components/dashboard/DashboardStat.jsx";
import DashboardTableMap from "../components/dashboard/DashboardTableMap.jsx";
import DashboardTopProducts from "../components/dashboard/DashboardTopProducts.jsx";
import { apiGet, publicApiPost, setAuthToken } from "../lib/api";
import { createRestaurantSocket, playOrderSound } from "../lib/realtime";
import "../styles/dashboard-premium.css";

function getRestaurantName() {
  try {
    const restaurant = JSON.parse(localStorage.getItem("auth_restaurant") || "null");
    return restaurant?.name || localStorage.getItem("ristorante_attivo") || "";
  } catch {
    return localStorage.getItem("ristorante_attivo") || "";
  }
}

function getRestaurantSlug() {
  try {
    const restaurant = JSON.parse(localStorage.getItem("auth_restaurant") || "null");
    return restaurant?.slug || localStorage.getItem("restaurant_slug") || "";
  } catch {
    return localStorage.getItem("restaurant_slug") || "";
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function minutes(value) {
  const amount = num(value);
  return amount > 0 ? `${Math.round(amount)} min` : "Nessun dato";
}

function ServiceReadinessChecklist({ items, progress }) {
  const ready = items.every((item) => item.done);
  const pendingItems = items.filter((item) => !item.done);

  return (
    <section className={ready ? "dash-ready-service is-ready" : "dash-ready-service"}>
      <div className="dash-ready-service__head">
        <div>
          <span>Pronto per il servizio</span>
          <h2>{ready ? "Configurazione completa" : `${pendingItems.length} passaggi da completare`}</h2>
          <p>
            {ready
              ? "Menu, tavoli e strumenti operativi sono pronti."
              : `Setup al ${progress}%. Qui trovi soltanto ciò che manca prima del servizio.`}
          </p>
        </div>
        <Link to="/onboarding">{ready ? "Rivedi setup" : "Completa configurazione"}</Link>
      </div>
      {ready ? (
        <div className="dash-ready-service__complete">
          <i>OK</i>
          <span>Il ristorante può iniziare il servizio.</span>
        </div>
      ) : (
        <div className="dash-ready-service__grid">
          {pendingItems.map((item) => (
            <div key={item.label}>
              <i>Da fare</i>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SupportAccessNotice({ access, onDismiss }) {
  if (!access) return null;
  const date = new Date(access.createdAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? "recentemente"
    : date.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });

  return (
    <section className="dash-support-access">
      <div>
        <span>Registro sicurezza</span>
        <b>Ultimo accesso dell'assistenza: {dateLabel}</b>
        <p>Motivazione: {access.reason || "Assistenza tecnica"}. I dati economici sono rimasti nascosti.</p>
      </div>
      <label>
        <input type="checkbox" onChange={onDismiss} />
        Ho visto
      </label>
    </section>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, setError] = useState("");
  const [liveBadge, setLiveBadge] = useState("connessione live...");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [demoSeeding, setDemoSeeding] = useState(false);
  const [demoSeedMessage, setDemoSeedMessage] = useState("");
  const [dismissedSupportAccess, setDismissedSupportAccess] = useState(
    () => localStorage.getItem("easymenu_dismissed_support_access") || ""
  );

  const restaurantName = getRestaurantName();
  const restaurantSlug = getRestaurantSlug();
  const isSuperAdminMode = localStorage.getItem("superadmin_mode") === "1" || Boolean(localStorage.getItem("superadmin_platform_session"));
  const isDemoRestaurant = String(restaurantSlug || restaurantName).toLowerCase().includes("demo");

  const load = useCallback(async (manual = false) => {
    try {
      if (manual) setRefreshing(true);
      const [analyticsResult, setupResult] = await Promise.allSettled([
        apiGet("/analytics/summary"),
        apiGet("/onboarding/status"),
      ]);
      if (analyticsResult.status === "fulfilled") {
        setData({ ...analyticsResult.value, _loadedAt: Date.now() });
      }
      if (setupResult.status === "fulfilled") setSetupStatus(setupResult.value);
      setError("");
    } catch (err) {
      console.warn("Dashboard analytics non disponibili", err);
      setError("");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  async function completeDemoAccount() {
    try {
      setDemoSeeding(true);
      setDemoSeedMessage("Preparo la demo completa nel database...");
      await publicApiPost("/demo/ensure", {}, {}, { timeoutMs: 120000 });

      const loginData = await publicApiPost("/auth/login", {
        email: "owner@demo.test",
        password: "EasyMenu2026!",
      });

      if (loginData?.token) setAuthToken(loginData.token);
      if (loginData?.user) localStorage.setItem("auth_user", JSON.stringify(loginData.user));
      if (loginData?.restaurant) {
        localStorage.setItem("auth_restaurant", JSON.stringify(loginData.restaurant));
        localStorage.setItem("ristorante_attivo", loginData.restaurant.name || "");
        localStorage.setItem("restaurant_slug", loginData.restaurant.slug || "");
        localStorage.setItem("restaurant_id", loginData.restaurant.id || "");
      }

      setDemoSeedMessage("Demo pronta. Ricarico la dashboard...");
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 500);
    } catch (error) {
      setDemoSeedMessage(error.message || "Non sono riuscito a completare la demo.");
    } finally {
      setDemoSeeding(false);
    }
  }

  useEffect(() => {
    load();
    const fallback = setInterval(() => load(), 30000);
    const socket = createRestaurantSocket();

    socket.on("connect", () => setLiveBadge("live attivo"));
    socket.on("disconnect", () => setLiveBadge("live disconnesso"));

    const refreshWithSound = () => {
      playOrderSound();
      load();
    };

    socket.on("new-order", refreshWithSound);
    socket.on("new_order", refreshWithSound);
    socket.on("order-updated", () => load());
    socket.on("order_updated", () => load());
    socket.on("order-closed", () => load());
    socket.on("order-deleted", () => load());
    socket.on("table-updated", () => load());
    socket.on("payment-updated", () => load());
    socket.on("payment_updated", () => load());
    socket.on("error-logged", () => load());
    socket.on("error_logged", () => load());

    return () => {
      clearInterval(fallback);
      socket.disconnect();
    };
  }, [load]);

  const kpis = data?.kpis || {};
  const live = data?.live || {};
  const charts = data?.charts || {};
  const alerts = data?.alerts || {};
  const supportAccess = data?.supportAccess || null;
  const supportAccessAge = supportAccess?.createdAt && data?._loadedAt
    ? data._loadedAt - new Date(supportAccess.createdAt).getTime()
    : Infinity;
  const showSupportAccess = Boolean(
    supportAccess?.id &&
    supportAccessAge >= 0 &&
    supportAccessAge < 24 * 60 * 60 * 1000 &&
    dismissedSupportAccess !== supportAccess.id &&
    !isSuperAdminMode
  );

  const alertCount = num(kpis.unresolvedErrors) + num(kpis.paymentAlerts);
  const setupChecks = setupStatus?.checks || {};
  const readinessItems = useMemo(() => [
    { label: "Logo caricato", done: Boolean(setupChecks.profile) },
    { label: "Tavoli creati", done: Boolean(setupChecks.tables) },
    { label: "Menu inserito", done: Boolean(setupChecks.menu) },
    { label: "QR generati", done: Boolean(setupChecks.qr) },
    { label: "Cucina pronta", done: Boolean(setupChecks.menu) },
    { label: "Cassa pronta", done: Boolean(setupChecks.tables) },
    { label: "Abbonamento attivo", done: Boolean(setupChecks.billing) },
  ], [setupChecks.billing, setupChecks.menu, setupChecks.profile, setupChecks.qr, setupChecks.tables]);
  const readinessProgress = setupStatus?.progress ?? Math.round((readinessItems.filter((item) => item.done).length / readinessItems.length) * 100);

  if (!restaurantName) {
    return (
      <div className="dash-os-page">
        <Navbar />
        <main className="dash-os-shell">
          <section className="dash-empty-restaurant">
            <h1>Nessun ristorante attivo</h1>
            <p>Accedi dall'area admin o seleziona un ristorante per aprire la dashboard operativa.</p>
            <Link to="/admin">Vai all'area admin</Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dash-os-page">
      <Navbar />
      <main className="dash-os-shell">
        {isSuperAdminMode ? (
          <div className="dash-super-banner">
            <div><b>Modalità assistenza SuperAdmin</b> - valori economici nascosti per privacy del ristorante.</div>
            <button
              type="button"
              onClick={() => {
                const snapshot = JSON.parse(localStorage.getItem("superadmin_platform_session") || "null");
                if (snapshot?.token) localStorage.setItem("auth_token", snapshot.token);
                if (snapshot?.user) localStorage.setItem("auth_user", snapshot.user);
                if (snapshot?.restaurant) localStorage.setItem("auth_restaurant", snapshot.restaurant);
                localStorage.removeItem("superadmin_mode");
                localStorage.removeItem("superadmin_original_token");
                localStorage.removeItem("superadmin_platform_session");
                window.location.href = "/super-admin";
              }}
            >
              Torna a Super Admin
            </button>
          </div>
        ) : null}

        <DashboardHeader
          restaurantName={restaurantName}
          liveBadge={liveBadge}
          refreshing={refreshing || loading}
          onRefresh={() => load(true)}
        />

        {showSupportAccess ? (
          <SupportAccessNotice
            access={supportAccess}
            onDismiss={() => {
              localStorage.setItem("easymenu_dismissed_support_access", supportAccess.id);
              setDismissedSupportAccess(supportAccess.id);
            }}
          />
        ) : null}

        {isDemoRestaurant && readinessProgress < 100 ? (
          <section className="dash-demo-fix">
            <div>
              <span>Demo incompleta</span>
              <h2>Questa demo non ha ancora logo, tavoli, menu e storico completi.</h2>
              <p>
                Premi il bottone: creo l'account demo completo nel database, entro con l'utente demo corretto e ricarico questa pagina.
              </p>
              {demoSeedMessage ? <small>{demoSeedMessage}</small> : null}
            </div>
            <button type="button" onClick={completeDemoAccount} disabled={demoSeeding}>
              {demoSeeding ? "Creo demo..." : "Completa demo ora"}
            </button>
          </section>
        ) : null}

        <ServiceReadinessChecklist items={readinessItems} progress={readinessProgress} />

        <section className="dash-now" aria-label="Azioni principali">
          <div>
            <span>Da dove vuoi iniziare?</span>
            <h2>Apri direttamente lo strumento che ti serve</h2>
          </div>
          <nav>
            <Link to="/tavoli"><b>Sala</b><small>Tavoli, prenotazioni e portate</small></Link>
            <Link to="/cucina"><b>Cucina</b><small>Comande e tempi</small></Link>
            <Link to="/cassa"><b>Cassa</b><small>Conti e pagamenti</small></Link>
            <Link to="/admin?tab=menu"><b>Menu</b><small>Piatti, prezzi e disponibilità</small></Link>
          </nav>
        </section>

        {data?.privacyMode ? (
          <div className="dash-super-banner">
            <div><b>Privacy attiva</b> - dati economici e importi ordine sono oscurati durante l'assistenza SuperAdmin.</div>
          </div>
        ) : null}

        <section className="dash-service-strip">
          <Link to="/admin?tab=menu" className={num(kpis.unavailableItems) ? "dash-service-card is-warning" : "dash-service-card"}>
            <span>Menu</span>
            <b>{num(kpis.unavailableItems)} piatti non disponibili</b>
            <small>Aggiorna solo cosa il cliente può ordinare.</small>
          </Link>
          <Link to="/errori" className={alertCount ? "dash-service-card is-warning" : "dash-service-card is-calm"}>
            <span>Controllo</span>
            <b>{alertCount ? `${alertCount} alert` : "Tutto regolare"}</b>
            <small>Verifica pagamenti, errori e avvisi.</small>
          </Link>
          <Link to="/statistiche" className="dash-service-card is-report">
            <span>Statistiche</span>
            <b>Report e consigli</b>
            <small>Apri numeri, prodotti top e consulente Ordynora.</small>
          </Link>
          <Link to="/storico" className="dash-service-card is-report">
            <span>Storico</span>
            <b>Ordini chiusi</b>
            <small>Rivedi conti, pagamenti e comande concluse.</small>
          </Link>
        </section>

        <section className="dash-main-grid dash-main-grid--focus">
          <div>
            <DashboardLiveOrders orders={live.activeOrders || []} />
          </div>

          <aside className="dash-side-stack">
            <DashboardTableMap
              tables={live.tables || []}
              totalTables={kpis.totalTables || 0}
            />
          </aside>
        </section>

        <div className="dash-advanced-control">
          <button type="button" onClick={() => setAdvancedOpen((value) => !value)}>
            {advancedOpen ? "Nascondi dettagli" : "Mostra dettagli avanzati"}
          </button>
          <span>Dettagli e alert tecnici restano disponibili senza riempire la schermata principale.</span>
        </div>

        {advancedOpen ? (
          <>
            <section className="dash-kpi-grid dash-kpi-grid--advanced">
              <DashboardStat label="Tempo cucina" value={minutes(kpis.averageKitchenMinutes || kpis.averagePreparationMinutes)} detail="Media reale in lavorazione" tone="live" />
              <DashboardStat label="Tempo bar" value={minutes(kpis.averageBarMinutes)} detail="Media reale in lavorazione" tone="neutral" />
              <DashboardStat label="Tempo servizio" value={minutes(kpis.averageServiceMinutes)} detail="Media ordine-servito" tone="neutral" />
              <DashboardStat label="Ordini completati" value={num(kpis.completedOrdersToday)} detail="Serviti e chiusi oggi" tone="live" />
              <DashboardStat
                label="Annulli e omaggi"
                value={num(kpis.voidedItems) + num(kpis.complimentaryItems)}
                detail="Voci da verificare nel periodo"
                tone={num(kpis.voidedItems) + num(kpis.complimentaryItems) ? "warning" : "neutral"}
              />
            </section>

            <section className="dash-main-grid dash-main-grid--advanced">
              <div className="dash-analytics-grid">
                <DashboardTopProducts products={charts.topProductsToday || []} />
                <DashboardHourFlow hours={charts.byHourToday || []} />
              </div>

              <aside className="dash-side-stack">
                <DashboardAlerts alerts={alerts} />
              </aside>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default Dashboard;
