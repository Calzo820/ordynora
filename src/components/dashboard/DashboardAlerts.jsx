import DashboardEmptyState from "./DashboardEmptyState.jsx";

function timeAgo(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.max(0, Math.round(diff / 60000));
  if (min < 60) return `${min} min fa`;
  return `${Math.round(min / 60)} h fa`;
}

export default function DashboardAlerts({ alerts = {} }) {
  const items = [
    ...(alerts.subscriptionAlerts || []).map((s) => ({ id: `s-${s.id}`, tone: "danger", title: `Abbonamento ${s.status}`, text: `Controlla pagamento e portale abbonamento${s.currentPeriodEnd ? ` - scadenza ${new Date(s.currentPeriodEnd).toLocaleDateString("it-IT")}` : ""}` })),
    ...(alerts.paymentAlerts || []).map((p) => ({ id: `p-${p.id}`, tone: "danger", title: `Pagamento ${p.status}`, text: `${p.table || "Tavolo"} - ${timeAgo(p.createdAt)}` })),
    ...(alerts.recentErrors || []).map((e) => ({ id: `e-${e.id}`, tone: "warning", title: e.source || "Errore", text: `${e.message || "Controlla log"} - ${timeAgo(e.createdAt)}` })),
    ...(alerts.unavailableItems || []).map((i) => ({ id: `i-${i.id}`, tone: "info", title: "Prodotto esaurito", text: `${i.name}${i.category ? ` - ${i.category}` : ""}` })),
  ];

  return (
    <section className="dash-panel dash-alerts">
      <div className="dash-panel-head">
        <div>
          <span>Controllo</span>
          <h2>Da sistemare</h2>
        </div>
      </div>
      {items.length ? (
        <div className="dash-alert-list">
          {items.slice(0, 6).map((item) => (
            <article className={`dash-alert dash-alert--${item.tone}`} key={item.id}>
              <i />
              <div>
                <b>{item.title}</b>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <DashboardEmptyState title="Nessun problema" text="Pagamenti, menu e sistema sono sotto controllo." />
      )}
    </section>
  );
}
