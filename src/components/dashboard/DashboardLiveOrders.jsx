import DashboardEmptyState from "./DashboardEmptyState.jsx";

function euro(value) {
  if (value === null || value === undefined) return "Nascosto";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function timeAgo(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.max(0, Math.round(diff / 60000));
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60)} h`;
}

function orderStatusMeta(status) {
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "in_progress") return { tone: "progress", label: "In preparazione" };
  if (normalized === "ready") return { tone: "ready", label: "Pronto" };
  if (normalized === "served") return { tone: "served", label: "Servito" };
  if (normalized === "cancelled") return { tone: "cancelled", label: "Annullato" };
  return { tone: "pending", label: "Nuovo ordine" };
}

export default function DashboardLiveOrders({ orders = [], showMoney = true }) {
  return (
    <section className="dash-panel dash-live-orders">
      <div className="dash-panel-head">
        <div>
          <span>Live service</span>
          <h2>Ordini attivi</h2>
        </div>
      </div>
      {orders.length ? (
        <div className="dash-order-list">
          {orders.slice(0, 8).map((order) => {
            const status = orderStatusMeta(order.status);
            return (
              <article className={`dash-order-row dash-order-row--${status.tone}`} key={order.id}>
                <div className="dash-order-table">
                  <strong>{order.table}</strong>
                  <small>#{order.orderNumber || order.id} - {timeAgo(order.createdAt)}</small>
                </div>
                <div className="dash-order-meta">
                  <b>{order.itemsCount || 0} articoli</b>
                  <small className={`dash-order-status dash-order-status--${status.tone}`}>{status.label}</small>
                </div>
                {showMoney ? <div className="dash-order-total">{euro(order.totalAmount)}</div> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <DashboardEmptyState title="Nessun ordine aperto" text="Quando arrivano nuove comande compariranno qui." />
      )}
    </section>
  );
}
