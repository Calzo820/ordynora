import { useMemo, useState } from "react";

const STATUS_COLUMNS = [
  { key: "pending", label: "Nuovi", empty: "Nessuna nuova comanda" },
  { key: "in_progress", label: "In preparazione", empty: "Niente in lavorazione" },
  { key: "ready", label: "Pronti", empty: "Niente al pass" },
];

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function getItemName(item) {
  return item.nome || item.nameSnapshot || item.name || "Articolo";
}

function getItemQty(item) {
  return Number(item.qty ?? item.quantity ?? 1) || 1;
}

function getItemService(item) {
  return (item.servizio || item.service || "subito") === "dopo" ? "dopo" : "subito";
}

function getItemCourse(item) {
  const value = Number(item.courseNumber || 0);
  if (value >= 1 && value <= 4) return value;
  return getItemService(item) === "dopo" ? 2 : 1;
}

function formatTime(timestamp) {
  if (!timestamp) return "--:--";
  return new Date(timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  return `${value} min`;
}

function getOrderStatus(order) {
  return order.status || order.stato || "pending";
}

function getActionLabel(status, readyLabel) {
  if (status === "pending") return "Inizia preparazione";
  if (status === "in_progress") return readyLabel ? `Segna ${readyLabel.toLowerCase()}` : "Segna pronto";
  return "Pronto al pass";
}

function getSlaTone(minutes, status, warnAfter, lateAfter) {
  if (status === "ready") return "ready";
  if (minutes >= lateAfter) return "late";
  if (minutes >= warnAfter) return "warn";
  return "ok";
}

function isOrderUrgent(order, lateAfter) {
  const status = getOrderStatus(order);
  const label = normalize(order.prioritaLabel);
  return status !== "ready" && (label === "urgente" || Number(order.timerMinuti || 0) >= lateAfter);
}

function getTableLabel(order) {
  return order.tavolo || order.table?.code || order.table?.name || "?";
}

function formatTableTitle(order) {
  const label = String(getTableLabel(order));
  return /^tavolo/i.test(label) ? label : `Tavolo ${label}`;
}

function serviceSummary(items) {
  const courses = new Map();
  items.forEach((item) => {
    const course = getItemCourse(item);
    courses.set(course, (courses.get(course) || 0) + getItemQty(item));
  });
  return [...courses.entries()]
    .sort(([left], [right]) => left - right)
    .map(([course, quantity]) => `${quantity} in portata ${course}`)
    .join(" · ") || `${items.length} articoli`;
}

function ServiceOrderCard({ order, itemsKey, updating, onNext, onBack, onPrint, readyLabel, warnAfter, lateAfter }) {
  const items = order[itemsKey] || [];
  const status = getOrderStatus(order);
  const minutes = order.timerMinuti ?? 0;
  const urgent = isOrderUrgent(order, lateAfter);
  const tone = getSlaTone(minutes, status, warnAfter, lateAfter);
  const progress = Math.min(100, Math.max(8, Math.round((Number(minutes || 0) / Math.max(lateAfter, 1)) * 100)));
  const canGoNext = status === "pending" || status === "in_progress";

  return (
    <article className={`kds-ticket kds-ticket--${status} ${urgent ? "is-urgent" : ""}`}>
      <header className="kds-ticket__head">
        <div>
          <strong>{formatTableTitle(order)}</strong>
          <span>{formatTime(order.createdAt || order.time)} - {formatMinutes(minutes)} - {serviceSummary(items)}</span>
        </div>
        <b className={`kds-ticket__sla kds-ticket__sla--${tone}`}>
          {urgent ? "URGENTE" : status === "ready" ? "AL PASS" : `${minutes} min`}
        </b>
      </header>

      <div className={`kds-ticket__meter kds-ticket__meter--${tone}`}>
        <i style={{ width: `${progress}%` }} />
      </div>

      <div className="kds-ticket__badges">
        <span>{order.prioritaLabel || "Attivo"}</span>
        <span>{items.length} righe</span>
        {order.totaleArticoli ? <span>{order.totaleArticoli} pezzi</span> : null}
      </div>

      <div className="kds-ticket__items">
        {items.slice(0, 10).map((item, index) => (
          <div className="kds-ticket__item" key={`${order.id}-${item.id || index}`}>
            <b>{getItemQty(item)}x</b>
            <span>{getItemName(item)}</span>
            {getItemCourse(item) > 1 ? <em>Portata {getItemCourse(item)}</em> : null}
            {item.notes || item.nota || item.notaPiatto ? <small>{item.notes || item.nota || item.notaPiatto}</small> : null}
          </div>
        ))}
        {items.length > 10 ? <div className="kds-ticket__more">+{items.length - 10} altri articoli</div> : null}
      </div>

      {order.notes || order.nota ? <div className="kds-ticket__note">{order.notes || order.nota}</div> : null}

      <footer className="kds-ticket__actions">
        {onPrint ? (
          <button className="kds-ticket__ghost" type="button" onClick={() => onPrint(order)} disabled={updating}>
            Stampa
          </button>
        ) : null}
        {status !== "pending" ? (
          <button className="kds-ticket__ghost" type="button" onClick={() => onBack(order.id, status)} disabled={updating}>
            Indietro
          </button>
        ) : null}
        <button className="kds-ticket__primary" type="button" onClick={() => onNext(order.id, status)} disabled={updating || !canGoNext}>
          {updating ? "..." : getActionLabel(status, readyLabel)}
        </button>
      </footer>
    </article>
  );
}

export default function HighVolumeServiceBoard({
  title,
  station = "cucina",
  loading,
  error,
  orders = [],
  itemsKey,
  newCount = 0,
  inProgressCount = 0,
  readyCount = 0,
  urgentCount = 0,
  totalItems,
  warnAfter = 10,
  lateAfter = 18,
  updatingIds = [],
  onRefresh,
  onNext,
  onBack,
  onPrint,
  autoPrint = false,
  onToggleAutoPrint,
  pendingPrintJobs = 0,
  printMode = "browser",
  printerStatus,
  readyLabel,
}) {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("all");
  const [dense, setDense] = useState(true);

  const filteredOrders = useMemo(() => {
    const q = normalize(query);
    return orders.filter((order) => {
      const status = getOrderStatus(order);
      const items = order[itemsKey] || [];
      const searchable = [
        order.tavolo,
        order.notes,
        order.nota,
        ...items.map(getItemName),
        ...items.map((item) => item.categoria || item.categorySnapshot || ""),
      ].join(" ");

      if (focus === "urgent" && !isOrderUrgent(order, lateAfter)) return false;
      if (focus !== "all" && focus !== "urgent" && status !== focus) return false;
      if (q && !normalize(searchable).includes(q)) return false;
      return true;
    });
  }, [orders, itemsKey, query, focus, lateAfter]);

  const columns = useMemo(() => {
    const grouped = { pending: [], in_progress: [], ready: [] };
    filteredOrders.forEach((order) => {
      const status = getOrderStatus(order);
      if (grouped[status]) grouped[status].push(order);
      else grouped.pending.push(order);
    });
    return grouped;
  }, [filteredOrders]);

  const activeItems = Number(totalItems || 0) || orders.reduce((sum, order) => {
    return sum + (order[itemsKey] || []).reduce((itemSum, item) => itemSum + getItemQty(item), 0);
  }, 0);
  const nextOrder = filteredOrders.find((order) => getOrderStatus(order) !== "ready") || filteredOrders[0] || null;
  const nextItems = nextOrder ? nextOrder[itemsKey] || [] : [];
  const maxMinutes = filteredOrders.reduce((max, order) => Math.max(max, Number(order.timerMinuti || 0)), 0);

  return (
    <main className={`kds-board kds-board--${station} ${dense ? "is-dense" : ""}`}>
      <section className="kds-topbar">
        <button className="kds-topbar__station" type="button" onClick={onRefresh}>
          <span>{title}</span>
          <small>Live</small>
        </button>

        <div className="kds-topbar__stats" aria-label="Stato servizio">
          <button type="button" className={focus === "all" ? "is-active" : ""} onClick={() => setFocus("all")}><b>{orders.length}</b><span>attivi</span></button>
          <button type="button" className={focus === "pending" ? "is-active" : ""} onClick={() => setFocus("pending")}><b>{newCount}</b><span>nuovi</span></button>
          <button type="button" className={focus === "in_progress" ? "is-active" : ""} onClick={() => setFocus("in_progress")}><b>{inProgressCount}</b><span>prep</span></button>
          <button type="button" className={focus === "ready" ? "is-active" : ""} onClick={() => setFocus("ready")}><b>{readyCount}</b><span>pronti</span></button>
          <button type="button" className={`${focus === "urgent" ? "is-active" : ""} ${urgentCount ? "is-hot" : ""}`} onClick={() => setFocus("urgent")}><b>{urgentCount}</b><span>urgenze</span></button>
          <div><b>{activeItems}</b><span>pezzi</span></div>
        </div>

        <div className="kds-topbar__tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca tavolo o piatto" />
          {onToggleAutoPrint ? (
            <button
              type="button"
              className={autoPrint ? "is-active" : ""}
              onClick={() => onToggleAutoPrint(!autoPrint)}
              title={printMode === "bridge" ? "Stampante locale collegata" : "Usa la finestra di stampa del browser"}
            >
              Auto stampa {autoPrint ? "ON" : "OFF"}
            </button>
          ) : null}
          <button type="button" onClick={() => setDense((value) => !value)}>{dense ? "Schede grandi" : "Vista compatta"}</button>
        </div>
      </section>

      {onToggleAutoPrint ? (
        <div className={`kds-printer-status kds-printer-status--${printerStatus?.tone || "idle"}`}>
          <span>{printMode === "bridge" ? "Stampante termica" : "Stampa browser"}</span>
          <b>{pendingPrintJobs > 0 ? `${pendingPrintJobs} in coda` : printerStatus?.message || "Coda pronta"}</b>
        </div>
      ) : null}

      <section className="kds-pass-strip" aria-label="Regia servizio">
        <div>
          <span>Prossimo tavolo</span>
          <strong>{nextOrder ? formatTableTitle(nextOrder) : "-"}</strong>
          <small>{nextOrder ? `${nextItems.length} righe - ${serviceSummary(nextItems)}` : "Nessuna comanda attiva"}</small>
        </div>
        <div className={maxMinutes >= lateAfter ? "is-hot" : maxMinutes >= warnAfter ? "is-warn" : ""}>
          <span>Tempo massimo</span>
          <strong>{formatMinutes(maxMinutes)}</strong>
          <small>{maxMinutes >= lateAfter ? "Da sbloccare subito" : "Servizio sotto controllo"}</small>
        </div>
        <div className={readyCount ? "is-ready" : ""}>
          <span>Al pass</span>
          <strong>{readyCount}</strong>
          <small>{readyCount ? "Da consegnare in sala" : "Nessun piatto in attesa"}</small>
        </div>
      </section>

      {error ? <div className="kds-error">{error}</div> : null}
      {loading ? <div className="kds-empty">Caricamento comande...</div> : null}

      {!loading && filteredOrders.length === 0 ? (
        <div className="kds-empty"><b>Nessuna comanda da gestire</b><span>Quando arriva un ordine comparirà in “Nuovi”. Premi “Inizia preparazione”, poi “Segna pronto”.</span></div>
      ) : null}

      {!loading && filteredOrders.length > 0 ? (
        <section className="kds-columns">
          {STATUS_COLUMNS.map((column) => (
            <div className={`kds-column kds-column--${column.key}`} key={column.key}>
              <div className="kds-column__head">
                <strong>{column.label}</strong>
                <span>{columns[column.key].length}</span>
              </div>
              <div className="kds-column__list">
                {columns[column.key].length ? (
                  columns[column.key].map((order) => (
                    <ServiceOrderCard
                      key={order.id}
                      order={order}
                      itemsKey={itemsKey}
                      updating={updatingIds.includes(order.id)}
                      onNext={onNext}
                      onBack={onBack}
                      onPrint={onPrint}
                      readyLabel={readyLabel}
                      warnAfter={warnAfter}
                      lateAfter={lateAfter}
                    />
                  ))
                ) : (
                  <div className="kds-column__empty">{column.empty}</div>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
