import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { apiGet } from "../lib/api";
import { appShellStyle, glowPageStyle } from "../styles/pageStyles";
import "../styles/management-os.css";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(number(value));
}

function trend(value) {
  const amount = number(value);
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(0)}%`;
}

function paymentLabel(method) {
  return {
    cash: "Contanti",
    card: "Carta",
    online: "Online",
    satispay: "Satispay",
    other: "Altro",
    non_indicato: "Non indicato",
  }[method] || method;
}

function Stat({ label, value, detail, change }) {
  return (
    <article className="management-stat report-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      {change !== undefined ? <i className={number(change) >= 0 ? "is-up" : "is-down"}>{trend(change)} sul periodo precedente</i> : null}
    </article>
  );
}

function BarRow({ label, value, max, valueLabel, detail }) {
  const width = max > 0 ? Math.max(4, Math.round((number(value) / max) * 100)) : 0;
  return (
    <div className="report-bar-row">
      <div>
        <div className="management-row-title" style={{ fontSize: 14 }}>{label}</div>
        {detail ? <small className="report-row-detail">{detail}</small> : null}
        <div className="report-track"><div className="report-fill" style={{ width: `${width}%` }} /></div>
      </div>
      <strong>{valueLabel ?? value}</strong>
    </div>
  );
}

function isOperationalInsight(insight) {
  const text = `${insight?.title || ""} ${insight?.message || ""}`.toLocaleLowerCase("it");
  return !text.includes("errori tecnici") && !text.includes("problemi non ancora risolti");
}

export default function Statistiche() {
  const [period, setPeriod] = useState(30);
  const [summary, setSummary] = useState(null);
  const [advisor, setAdvisor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - period);
        const [summaryData, advisorData] = await Promise.all([
          apiGet(`/analytics/summary?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
          apiGet(`/analytics/advisor?days=${period}`),
        ]);
        if (active) {
          setSummary(summaryData);
          setAdvisor(advisorData);
        }
      } catch (loadError) {
        if (active) setError(loadError.message || "Statistiche temporaneamente non disponibili");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [period]);

  const kpis = summary?.kpis || {};
  const charts = summary?.charts || {};
  const topProducts = charts.topProducts || [];
  const byDay = (charts.byDay || []).slice(-14);
  const byPayment = charts.byPayment || [];
  const maxRevenue = Math.max(0, ...byDay.map((row) => number(row.revenue)));
  const maxMargin = Math.max(0, ...topProducts.map((row) => number(row.margin)));
  const maxPayment = Math.max(0, ...byPayment.map((row) => number(row.revenue)));
  const hasData = number(kpis.ordersRange) > 0;
  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div style={appShellStyle}>
        <main className="app-shell management-os">
          <header className="management-hero-main report-hero-clean">
            <div>
              <div className="management-kicker">Dati reali del locale</div>
              <h1 className="management-hero-title">Numeri utili, senza report inutili</h1>
              <p className="management-hero-subtitle">Incasso, margine, tempi e prodotti calcolati sui conti registrati in Ordynora.</p>
            </div>
            <div className="report-period-switch" aria-label="Periodo statistiche">
              {[7, 30, 90].map((days) => (
                <button type="button" key={days} className={period === days ? "is-active" : ""} onClick={() => setPeriod(days)}>
                  {days} giorni
                </button>
              ))}
            </div>
          </header>

          {error ? <div className="advisor-note">{error}</div> : null}
          {loading ? <section className="management-card report-empty-clean"><b>Sto preparando i dati del periodo...</b></section> : null}

          {!loading && summary ? (
            <>
              <section className="management-card">
                <div className="management-section-head">
                  <div><h2 className="management-title">Andamento economico</h2><p className="management-subtitle">Confronto con i {period} giorni precedenti.</p></div>
                </div>
                <div className="management-stats">
                  <Stat label="Incasso" value={money(kpis.revenueRange)} detail={`${kpis.completedOrdersRange || 0} conti conclusi`} change={kpis.comparison?.revenue} />
                  <Stat label="Ticket medio" value={money(kpis.averageTicketRange)} detail="Media per conto" change={kpis.comparison?.averageTicket} />
                  <Stat label="Margine lordo" value={money(kpis.grossMarginRange)} detail={`Food cost ${money(kpis.foodCostRange)}`} change={kpis.comparison?.margin} />
                  <Stat label="Margine %" value={`${number(kpis.marginRateRange).toFixed(1)}%`} detail="Stima da costi inseriti nel menu" />
                </div>
              </section>

              {!hasData ? (
                <section className="management-card report-empty-clean">
                  <span>Nessun conto nel periodo</span>
                  <h2>I numeri appariranno dopo il primo pagamento.</h2>
                  <p>Ordynora non inserisce dati finti. Costi e scorte del menu restano comunque disponibili per preparare il servizio.</p>
                </section>
              ) : (
                <>
                  <section className="report-insight-grid report-insight-grid--four">
                    <article className="report-insight report-insight--green">
                      <span>Tempo cucina</span><b>{number(kpis.averageKitchenMinutes || kpis.averagePreparationMinutes).toFixed(0)} min</b><p>Lavorazione reale dei piatti.</p>
                    </article>
                    <article className="report-insight report-insight--blue">
                      <span>Tempo bar</span><b>{number(kpis.averageBarMinutes).toFixed(0)} min</b><p>Lavorazione reale delle bevande.</p>
                    </article>
                    <article className="report-insight report-insight--amber">
                      <span>Annulli e omaggi</span><b>{number(kpis.voidedItems) + number(kpis.complimentaryItems)}</b><p>{kpis.voidedItems || 0} annulli, {kpis.complimentaryItems || 0} omaggi.</p>
                    </article>
                    <article className="report-insight report-insight--violet">
                      <span>Servizio completo</span><b>{number(kpis.averageServiceMinutes).toFixed(0)} min</b><p>Dall'ordine alla consegna al tavolo.</p>
                    </article>
                  </section>

                  <section className="report-simple-grid">
                    <article className="management-card report-bar">
                      <div className="management-section-head"><div><h2 className="management-title">Incasso giornaliero</h2><p className="management-subtitle">Ultimi 14 giorni con movimento.</p></div></div>
                      {byDay.map((day) => <BarRow key={day.date} label={new Date(`${day.date}T12:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} value={day.revenue} max={maxRevenue} valueLabel={money(day.revenue)} />)}
                    </article>
                    <article className="management-card report-bar">
                      <div className="management-section-head"><div><h2 className="management-title">Prodotti e margine</h2><p className="management-subtitle">Vendite reali e costo materia prima.</p></div></div>
                      {topProducts.slice(0, 8).map((item) => <BarRow key={item.id} label={item.name} value={item.margin} max={maxMargin} valueLabel={money(item.margin)} detail={`${item.quantity} venduti · incasso ${money(item.revenue)}`} />)}
                    </article>
                    <article className="management-card report-bar">
                      <div className="management-section-head"><div><h2 className="management-title">Pagamenti</h2><p className="management-subtitle">Importi registrati per metodo.</p></div></div>
                      {byPayment.map((item) => <BarRow key={item.method} label={paymentLabel(item.method)} value={item.revenue} max={maxPayment} valueLabel={money(item.revenue)} detail={`${item.orders} registrazioni`} />)}
                    </article>
                  </section>
                </>
              )}

              <section className="management-card advisor-card">
                <div className="management-section-head">
                  <div><h2 className="management-title">Cosa controllare adesso</h2><p className="management-subtitle">Suggerimenti generati esclusivamente dai dati del ristorante.</p></div>
                  <span className={`advisor-source ${advisor?.source === "openai" ? "is-ai" : ""}`}>{advisor?.source === "openai" ? "Assistente AI" : "Controllo operativo"}</span>
                </div>
                <div className="advisor-grid">
                  {(advisor?.insights || []).filter(isOperationalInsight).slice(0, 4).map((insight, index) => (
                    <article className={`advisor-insight ${insight.priority || "medium"}`} key={`${insight.title}-${index}`}>
                      <span>{insight.priority === "high" ? "Priorità alta" : insight.priority === "medium" ? "Da controllare" : "Suggerimento"}</span>
                      <h3>{insight.title}</h3>
                      <p>{insight.message}</p>
                      {insight.actionHref ? <button type="button" onClick={() => { window.location.href = insight.actionHref; }}>{insight.actionLabel || "Apri"}</button> : null}
                    </article>
                  ))}
                </div>
              </section>

              {summary.alerts?.lowStockItems?.length ? (
                <section className="management-card stock-alert-list">
                  <div className="management-section-head"><div><h2 className="management-title">Scorte sotto soglia</h2><p className="management-subtitle">Prodotti da rifornire prima del prossimo servizio.</p></div></div>
                  <div>
                    {summary.alerts.lowStockItems.map((item) => <p key={item.id}><b>{item.name}</b><span>{number(item.stockQuantity)} disponibili · soglia {number(item.lowStockThreshold)}</span></p>)}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
