import { useMemo, useState } from "react";
import Modal from "../Modal";

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function compactTime(timestamp) {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function TableRow({ table, selected, onSelect, formatEuro }) {
  return (
    <button className={`hc-table-row ${selected ? "selected" : ""} ${table.kind}`} onClick={() => onSelect(table.number)}>
      <span className="hc-table-number">T{table.number}</span>
      <span className="hc-table-main">
        <b>{table.label}</b>
        <small>{table.subtitle}</small>
      </span>
      <span className="hc-table-total">{table.total ? formatEuro(table.total) : "—"}</span>
    </button>
  );
}

export default function HighVolumeCashDesk({
  loading,
  error,
  restaurantName,
  totalTables,
  orders,
  selectedTable,
  setSelectedTable,
  selectedOrder,
  setModalOpen,
  lastEvent,
  counters,
  requestsBill = {},
  requestsStaff = {},
  tableState,
  totalFinal,
  totalPieces,
  minutesFrom,
  formatEuro,
  onRefresh,
  onPrint,
  onCloseBill,
  closing,
  children,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");

  const orderMap = useMemo(() => {
    const map = new Map();
    orders.forEach((order) => map.set(String(order.tavolo), order));
    return map;
  }, [orders]);

  const rows = useMemo(() => {
    const q = normalize(query);
    return Array.from({ length: Number(totalTables || 0) }, (_, index) => {
      const number = index + 1;
      const order = orderMap.get(String(number));
      const state = tableState(number);
      const bill = Boolean(order?.billRequested || order?.paymentStatus === "pending" || requestsBill[String(number)]);
      const staff = Boolean(requestsStaff[String(number)]);
      const occupied = Boolean(order);
      const total = order ? totalFinal(order) : 0;
      const pieces = order ? totalPieces(order) : 0;
      const minutes = order ? minutesFrom(order.time) : 0;
      const kind = staff ? "staff" : bill ? "bill" : occupied ? "open" : "free";

      return {
        number,
        order,
        state,
        bill,
        staff,
        occupied,
        total,
        pieces,
        minutes,
        kind,
        label: staff ? "Cameriere" : bill ? "Conto richiesto" : occupied ? state.label : "Libero",
        subtitle: occupied ? `${pieces} articoli · ${minutes} min · ${compactTime(order.time)}` : "Nessun ordine aperto",
      };
    }).filter((row) => {
      if (filter === "open" && !row.occupied) return false;
      if (filter === "bill" && !row.bill) return false;
      if (filter === "staff" && !row.staff) return false;
      if (filter === "free" && row.occupied) return false;
      if (q && !`${row.number} ${row.label} ${row.subtitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [totalTables, orderMap, tableState, requestsBill, requestsStaff, totalFinal, totalPieces, minutesFrom, query, filter]);

  const hotRows = rows.filter((row) => row.bill || row.staff || row.occupied).slice(0, 14);
  const allRows = rows;

  return (
    <main className="hc-cashdesk">
      <section className="hc-hero">
        <div>
          <span className="hc-eyebrow">Cassa</span>
          <h1>Seleziona un tavolo e chiudi il conto</h1>
          <p>{restaurantName || "Ristorante"} · Ordynora mette prima i tavoli che richiedono attenzione.</p>
        </div>
        <div className="hc-actions">
          <button onClick={onRefresh}>Aggiorna</button>
          <button onClick={() => selectedTable && onPrint(selectedTable)} disabled={!selectedTable}>Stampa preconto</button>
          <button className="success" onClick={() => selectedTable && onCloseBill(selectedTable)} disabled={!selectedTable || closing}>{closing ? "Chiusura..." : "Incassa e chiudi"}</button>
        </div>
      </section>

      <section className="hc-flow-guide" aria-label="Passaggi cassa">
        <div className={selectedTable ? "is-done" : "is-current"}><i>1</i><span><b>Scegli il tavolo</b><small>Dalla lista o dalla ricerca</small></span></div>
        <div className={selectedOrder ? "is-current" : ""}><i>2</i><span><b>Controlla il conto</b><small>Articoli, coperti e divisioni</small></span></div>
        <div><i>3</i><span><b>Incassa e chiudi</b><small>Registra il pagamento</small></span></div>
      </section>

      {lastEvent ? <div className="hc-live">Live: {lastEvent.type} · {new Date(lastEvent.at).toLocaleTimeString("it-IT")}</div> : null}
      {error ? <div className="hv-error">{error}</div> : null}

      <section className="hc-kpis">
        <div><span>Da incassare</span><b>{formatEuro(counters.revenue)}</b></div>
        <div><span>Tavoli aperti</span><b>{counters.open}</b></div>
        <div className={counters.bills ? "warn" : ""}><span>Conti</span><b>{counters.bills}</b></div>
        <div className={counters.staff ? "danger" : ""}><span>Cameriere</span><b>{counters.staff}</b></div>
        <div><span>Articoli</span><b>{counters.items}</b></div>
      </section>

      <section className="hc-searchbar">
        <div className="hc-tabs">
          {[["active", "Tutti"], ["open", "Aperti"], ["bill", "Conti"], ["staff", "Cameriere"], ["free", "Liberi"]].map(([value, label]) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca tavolo, es. 128..." inputMode="numeric" />
      </section>

      {loading ? <div className="hv-empty">Caricamento cassa...</div> : null}

      {!loading ? (
        <section className="hc-layout">
          <div className="hc-list-panel">
            <div className="hc-panel-title"><b>Priorità servizio</b><span>{hotRows.length}</span></div>
            <div className="hc-hot-grid">
              {(hotRows.length ? hotRows : allRows.slice(0, 14)).map((row) => (
                <TableRow key={`hot-${row.number}`} table={row} selected={String(selectedTable) === String(row.number)} onSelect={setSelectedTable} formatEuro={formatEuro} />
              ))}
            </div>
          </div>

          <div className="hc-list-panel hc-all-panel">
            <div className="hc-panel-title"><b>Tutti i tavoli</b><span>{allRows.length}</span></div>
            <div className="hc-virtual-list">
              {allRows.map((row) => (
                <TableRow key={row.number} table={row} selected={String(selectedTable) === String(row.number)} onSelect={setSelectedTable} formatEuro={formatEuro} />
              ))}
            </div>
          </div>

          <aside className="hc-detail-panel">
            {!selectedOrder ? (
              <div className="hc-empty-detail">
                <b>{selectedTable ? `Tavolo ${selectedTable}` : "Seleziona un tavolo"}</b>
                <span>{selectedTable ? "Tavolo libero o senza ordine attivo." : "Usa la ricerca o le priorità per arrivare subito al tavolo giusto."}</span>
              </div>
            ) : (
              <>
                <div className="hc-detail-head">
                  <div><span>Tavolo</span><b>{selectedOrder.tavolo}</b></div>
                  <div><span>Totale</span><b>{formatEuro(totalFinal(selectedOrder))}</b></div>
                </div>
                <div className="hc-mini-items">
                  {selectedOrder.piatti.slice(0, 8).map((item, index) => (
                    <div key={`${item.nome}-${index}`}><span>{item.qty}× {item.nome}</span><b>{formatEuro(Number(item.prezzo || 0) * Number(item.qty || 0))}</b></div>
                  ))}
                  {selectedOrder.piatti.length > 8 ? <small>+{selectedOrder.piatti.length - 8} altre righe nel dettaglio</small> : null}
                </div>
                <div className="hc-payment-grid">
                  <button onClick={() => onPrint(selectedOrder.tavolo)}>Stampa preconto</button>
                  <button onClick={() => setModalOpen(true)}>Modifica conto</button>
                  <button className="success" onClick={() => onCloseBill(selectedOrder.tavolo)} disabled={closing}>{closing ? "Chiusura..." : "Chiudi tavolo"}</button>
                </div>
              </>
            )}
          </aside>
        </section>
      ) : null}

      {children ? <Modal onClose={() => setModalOpen(false)} maxWidth={1100}>{children}</Modal> : null}
    </main>
  );
}
