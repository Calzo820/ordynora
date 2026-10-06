import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import CommandDock from "../components/CommandDock";
import { apiDelete, apiGet } from "../lib/api";
import { createRestaurantSocket } from "../lib/realtime";
import Modal from "../components/Modal";
import { glowPageStyle, appShellStyle } from "../styles/pageStyles";
import { getStoredRestaurantMode, persistRestaurantMode } from "../lib/restaurantMode";

function getRistoranteAttivo() {
  return localStorage.getItem("ristorante_attivo") || "";
}

function storicoKey(nome) {
  return `storico_${nome}`;
}

function mapOrderToLegacy(order) {
  return {
    ...order,
    tavolo: order?.table?.name || order?.table?.code || order?.table?.number || order?.tavolo || "-",
    pagamento: order?.paymentMethod || order?.pagamento || "Non indicato",
    totale: order?.totalAmount ?? order?.totale ?? 0,
    nota: order?.notes || order?.nota || "",
    chiusoIl: order?.closedAt || order?.servedAt || order?.updatedAt || order?.chiusoIl || order?.time,
    time: order?.createdAt || order?.time || Date.now(),
    piatti: (order?.items || order?.piatti || []).map((item) => ({
      ...item,
      nome: item?.nameSnapshot || item?.nome || item?.menuItem?.name || "Articolo",
      qty: item?.quantity ?? item?.qty ?? 1,
      prezzo: item?.priceSnapshot ?? item?.prezzo ?? 0,
      categoria: item?.categorySnapshot || item?.categoria || item?.menuItem?.category || "Altro",
      note: item?.notes || item?.note || "",
      stato: order?.status === "pending" ? "nuovo" : order?.status === "in_progress" ? "preparazione" : order?.status === "ready" ? "pronto" : item?.stato || order?.status || "chiuso",
    })),
  };
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatEuro(value) {
  return `€ ${parseNumber(value).toFixed(2)}`;
}

function formatDate(timestamp) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("it-IT");
}

function formatTime(timestamp) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(timestamp) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("it-IT");
}

function totalePezzi(ordine) {
  return (ordine?.piatti || []).reduce((acc, p) => acc + parseNumber(p.qty || 0), 0);
}

function totaleRighe(ordine) {
  return (ordine?.piatti || []).length;
}

function getBadgePagamento(pagamento) {
  const value = (pagamento || "").toLowerCase().trim();

  if (value === "contanti") {
    return {
      bg: "#dcfce7",
      color: "#166534",
      label: "Contanti",
    };
  }

  if (value === "carta" || value === "pos") {
    return {
      bg: "#dbeafe",
      color: "#1d4ed8",
      label: pagamento || "Carta",
    };
  }

  if (value === "satispay") {
    return {
      bg: "#ede9fe",
      color: "#6d28d9",
      label: "Satispay",
    };
  }

  return {
    bg: "#e5e7eb",
    color: "#111827",
    label: pagamento || "Non indicato",
  };
}

function Storico() {
  const [storico, setStorico] = useState([]);
  const [ricerca, setRicerca] = useState("");
  const [filtroPagamento, setFiltroPagamento] = useState("tutti");
  const [filtroData, setFiltroData] = useState("tutti");
  const [ordineAperto, setOrdineAperto] = useState(null);
  const [operationMode, setOperationMode] = useState(() => getStoredRestaurantMode());
  const integratedMode = operationMode === "integrated";

  const ristoranteAttivo = getRistoranteAttivo();

  useEffect(() => {
    let cancelled = false;

    async function syncStorico() {
      if (!ristoranteAttivo) {
        setStorico([]);
        return;
      }

      try {
        const [data, restaurant] = await Promise.all([
          apiGet("/orders?history=true"),
          apiGet("/restaurants/me"),
        ]);
        const lista = Array.isArray(data) ? data : data?.orders || [];
        if (!cancelled) {
          setStorico(lista.map(mapOrderToLegacy));
          setOperationMode(restaurant?.operationMode || "full");
          persistRestaurantMode(restaurant?.operationMode || "full");
        }
      } catch (error) {
        console.warn("Backend non disponibile, uso storico locale", error);
        const dati = JSON.parse(localStorage.getItem(storicoKey(ristoranteAttivo)) || "[]");
        if (!cancelled) setStorico(Array.isArray(dati) ? dati : []);
      }
    }

    syncStorico();

    const timer = setInterval(syncStorico, 30000);
    const socket = createRestaurantSocket();
    socket.on("order-closed", syncStorico);
    socket.on("order-updated", syncStorico);
    socket.on("order-deleted", syncStorico);
    socket.on("connect", syncStorico);
    const onStorage = () => syncStorico();

    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      clearInterval(timer);
      socket.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, [ristoranteAttivo]);

  const storicoFiltrato = useMemo(() => {
    let lista = [...storico];

    if (!integratedMode && filtroPagamento !== "tutti") {
      lista = lista.filter(
        (ordine) =>
          (ordine.pagamento || "").toLowerCase().trim() === filtroPagamento.toLowerCase().trim()
      );
    }

    if (filtroData !== "tutti") {
      const now = new Date();

      if (filtroData === "oggi") {
        lista = lista.filter((ordine) => {
          const d = new Date(ordine.chiusoIl || ordine.time);
          return (
            d.getDate() === now.getDate() &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        });
      }

      if (filtroData === "7giorni") {
        const setteGiorniFa = new Date();
        setteGiorniFa.setDate(now.getDate() - 7);

        lista = lista.filter((ordine) => {
          const d = new Date(ordine.chiusoIl || ordine.time);
          return d >= setteGiorniFa;
        });
      }

      if (filtroData === "30giorni") {
        const trentaGiorniFa = new Date();
        trentaGiorniFa.setDate(now.getDate() - 30);

        lista = lista.filter((ordine) => {
          const d = new Date(ordine.chiusoIl || ordine.time);
          return d >= trentaGiorniFa;
        });
      }
    }

    if (ricerca.trim()) {
      const q = ricerca.toLowerCase();

      lista = lista.filter((ordine) => {
        const matchTavolo = String(ordine.tavolo || "").includes(q);
        const matchPagamento = !integratedMode && String(ordine.pagamento || "").toLowerCase().includes(q);
        const matchNota = String(ordine.nota || "").toLowerCase().includes(q);
        const matchPiatti = (ordine.piatti || []).some((p) =>
          String(p.nome || "").toLowerCase().includes(q)
        );

        return matchTavolo || matchPagamento || matchNota || matchPiatti;
      });
    }

    return lista.sort((a, b) => (b.chiusoIl || b.time || 0) - (a.chiusoIl || a.time || 0));
  }, [storico, ricerca, filtroPagamento, filtroData, integratedMode]);

  const totaleIncasso = storicoFiltrato.reduce(
    (acc, ordine) => acc + parseNumber(ordine.totale),
    0
  );

  const totaleOrdini = storicoFiltrato.length;

  const totaleArticoli = storicoFiltrato.reduce(
    (acc, ordine) => acc + totalePezzi(ordine),
    0
  );

  const pagamentiUnici = useMemo(() => {
    const values = [...new Set(storico.map((o) => o.pagamento).filter(Boolean))];
    return values;
  }, [storico]);

  async function eliminaOrdineSelezionato() {
    if (!ordineAperto) return;

    const conferma = window.confirm(
      `Vuoi eliminare dallo storico il tavolo ${ordineAperto.tavolo}?`
    );

    if (!conferma) return;

    try {
      if (ordineAperto.id) await apiDelete(`/orders/${ordineAperto.id}`);
    } catch (error) {
      console.warn("Eliminazione backend non disponibile, aggiorno solo la vista locale", error);
    }

    const nuovi = storico.filter((item) => item !== ordineAperto);
    localStorage.setItem(storicoKey(ristoranteAttivo), JSON.stringify(nuovi));
    setStorico(nuovi);
    setOrdineAperto(null);
  }

  async function svuotaStorico() {
    const conferma = window.confirm("Vuoi davvero svuotare tutto lo storico?");
    if (!conferma) return;

    const ids = storico.map((ordine) => ordine.id).filter(Boolean);
    try {
      await Promise.all(ids.map((id) => apiDelete(`/orders/${id}`)));
    } catch (error) {
      console.warn("Svuotamento backend parziale/non disponibile, aggiorno solo la vista locale", error);
    }

    localStorage.setItem(storicoKey(ristoranteAttivo), JSON.stringify([]));
    setStorico([]);
    setOrdineAperto(null);
  }

  return (
    <div style={glowPageStyle}>
      <Navbar />
      <CommandDock mode="owner" />

      <div style={appShellStyle}>
        <div className="app-shell">
          <div className="glass-hero" style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <div className="topbar-chip" style={{ marginBottom: 12 }}>
                  <span className="status-dot" style={{ background: "#8b5cf6" }} />
                  {integratedMode ? "Registro servizio" : "Storico ordini"}
                </div>
                <h1 style={{ margin: 0, fontSize: 34 }}>{integratedMode ? "Servizi conclusi" : "Storico compatto"}</h1>
                <p style={{ marginTop: 10, opacity: 0.9 }}>
                  {ristoranteAttivo || "Nessun ristorante attivo"} — {integratedMode ? "solo dati operativi, senza duplicare la cassa" : "ordini piccoli, click per vedere i dettagli"}
                </p>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={svuotaStorico}
                  style={{
                    border: "none",
                    borderRadius: 14,
                    padding: "12px 16px",
                    background: "#ef4444",
                    color: "white",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Svuota storico
                </button>
              </div>
            </div>
          </div>

          <div
            className="os-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              marginBottom: 16,
            }}
          >
            <div className="metric-card">
              <div className="metric-label">Ordini</div>
              <div className="metric-value">{totaleOrdini}</div>
              <div className="metric-badge">filtrati</div>
            </div>

            {!integratedMode ? <div className="metric-card">
              <div className="metric-label">Incasso</div>
              <div className="metric-value">{formatEuro(totaleIncasso)}</div>
              <div className="metric-badge">totale</div>
            </div> : null}

            <div className="metric-card">
              <div className="metric-label">Articoli</div>
              <div className="metric-value">{totaleArticoli}</div>
              <div className="metric-badge">venduti</div>
            </div>
          </div>

          <div className="section-card" style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: integratedMode ? "2fr 1fr" : "2fr 1fr 1fr",
                gap: 12,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder={integratedMode ? "Cerca tavolo, piatto o nota..." : "Cerca tavolo, piatto, nota, pagamento..."}
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
                style={inputStyle}
              />

              {!integratedMode ? <select
                value={filtroPagamento}
                onChange={(e) => setFiltroPagamento(e.target.value)}
                style={inputStyle}
              >
                <option value="tutti">Tutti i pagamenti</option>
                {pagamentiUnici.map((pag) => (
                  <option key={pag} value={String(pag).toLowerCase()}>
                    {pag}
                  </option>
                ))}
              </select> : null}

              <select
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                style={inputStyle}
              >
                <option value="tutti">Tutte le date</option>
                <option value="oggi">Oggi</option>
                <option value="7giorni">Ultimi 7 giorni</option>
                <option value="30giorni">Ultimi 30 giorni</option>
              </select>
            </div>
          </div>

          {storicoFiltrato.length === 0 ? (
            <div className="section-card">
              <div className="panel-title">Nessun ordine nello storico</div>
              <div className="panel-subtitle">
                {integratedMode ? "Quando completi un servizio dalla sala, lo vedrai qui." : "Quando chiudi i conti dalla cassa, li vedrai qui."}
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {storicoFiltrato.map((ordine, i) => {
                const badgePagamento = getBadgePagamento(ordine.pagamento);

                return (
                  <button
                    key={`${ordine.tavolo}-${ordine.chiusoIl || ordine.time}-${i}`}
                    onClick={() => setOrdineAperto(ordine)}
                    className="section-card"
                    style={{
                      textAlign: "left",
                      border: "1px solid rgba(255,255,255,0.7)",
                      cursor: "pointer",
                      padding: 14,
                      transition: "transform 0.18s ease, box-shadow 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 12px 22px rgba(15,23,42,0.12)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "flex-start",
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: "#111827" }}>
                          Tavolo {ordine.tavolo}
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                          {formatDate(ordine.chiusoIl || ordine.time)} · {formatTime(ordine.chiusoIl || ordine.time)}
                        </div>
                      </div>

                      {!integratedMode ? <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: badgePagamento.bg,
                          color: badgePagamento.color,
                          fontWeight: 800,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badgePagamento.label}
                      </div> : null}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: integratedMode ? "1fr" : "1fr 1fr",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      {!integratedMode ? <div
                        style={{
                          background: "#f8fafc",
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                          Totale
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", marginTop: 4 }}>
                          {formatEuro(ordine.totale)}
                        </div>
                      </div> : null}

                      <div
                        style={{
                          background: "#f8fafc",
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                          Articoli
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", marginTop: 4 }}>
                          {totalePezzi(ordine)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        color: "#475569",
                        fontSize: 13,
                      }}
                    >
                      <span>{totaleRighe(ordine)} righe ordine</span>
                      <span style={{ fontWeight: 800 }}>Tocca per dettagli</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {ordineAperto && (
            <Modal onClose={() => setOrdineAperto(null)} maxWidth={980}>
              <div style={{ paddingTop: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>Tavolo {ordineAperto.tavolo}</h2>
                    <div style={{ color: "#64748b", marginTop: 6 }}>
                      Chiuso il {formatDateTime(ordineAperto.chiusoIl || ordineAperto.time)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={eliminaOrdineSelezionato}
                      style={{
                        border: "none",
                        borderRadius: 12,
                        padding: "12px 14px",
                        background: "#ef4444",
                        color: "white",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Elimina ordine
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  {!integratedMode ? <div className="metric-card">
                    <div className="metric-label">Totale</div>
                    <div className="metric-value">{formatEuro(ordineAperto.totale)}</div>
                    <div className="metric-badge">incassato</div>
                  </div> : null}

                  {!integratedMode ? <div className="metric-card">
                    <div className="metric-label">Pagamento</div>
                    <div className="metric-value" style={{ fontSize: 22 }}>
                      {ordineAperto.pagamento || "—"}
                    </div>
                    <div className="metric-badge">metodo</div>
                  </div> : null}

                  <div className="metric-card">
                    <div className="metric-label">Articoli</div>
                    <div className="metric-value">{totalePezzi(ordineAperto)}</div>
                    <div className="metric-badge">totali</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Righe ordine</div>
                    <div className="metric-value">{totaleRighe(ordineAperto)}</div>
                    <div className="metric-badge">distinte</div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 18,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>Dettaglio piatti</h3>

                  <div style={{ display: "grid", gap: 10 }}>
                    {(ordineAperto.piatti || []).map((p, index) => (
                      <div
                        key={`${p.nome}-${p.servizio}-${p.categoria}-${index}`}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e5e7eb",
                          borderRadius: 14,
                          padding: 12,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 900, color: "#111827" }}>
                            {p.nome} x{p.qty}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 8,
                            }}
                          >
                            <span style={smallBadge("#e5e7eb", "#111827")}>
                              {p.categoria || "Senza categoria"}
                            </span>

                            <span
                              style={smallBadge(
                                (p.servizio || "subito") === "dopo" ? "#ede9fe" : "#dbeafe",
                                (p.servizio || "subito") === "dopo" ? "#6d28d9" : "#1d4ed8"
                              )}
                            >
                              {(p.servizio || "subito") === "dopo" ? "Porta dopo" : "Porta subito"}
                            </span>

                            <span
                              style={smallBadge(
                                p.stato === "pronto"
                                  ? "#dcfce7"
                                  : p.stato === "preparazione"
                                  ? "#fef3c7"
                                  : "#dbeafe",
                                p.stato === "pronto"
                                  ? "#166534"
                                  : p.stato === "preparazione"
                                  ? "#92400e"
                                  : "#1d4ed8"
                              )}
                            >
                              {p.stato || "nuovo"}
                            </span>
                          </div>
                        </div>

                        {!integratedMode ? <div style={{ fontWeight: 900, color: "#111827", whiteSpace: "nowrap" }}>
                          {formatEuro(parseNumber(p.prezzo) * parseNumber(p.qty))}
                        </div> : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: integratedMode ? "1fr" : "1fr 1fr",
                    gap: 16,
                  }}
                >
                  {!integratedMode ? <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 18,
                      padding: 16,
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>Info conto</h3>

                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={infoRowStyle}>
                        <span>Coperti</span>
                        <b>{parseNumber(ordineAperto.coperti)}</b>
                      </div>

                      <div style={infoRowStyle}>
                        <span>Costo coperto</span>
                        <b>{formatEuro(ordineAperto.costoCoperto)}</b>
                      </div>

                      <div style={infoRowStyle}>
                        <span>Sconto</span>
                        <b>{parseNumber(ordineAperto.sconto)}%</b>
                      </div>

                      <div style={infoRowStyle}>
                        <span>Totale finale</span>
                        <b>{formatEuro(ordineAperto.totale)}</b>
                      </div>
                    </div>
                  </div> : null}

                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 18,
                      padding: 16,
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>Note</h3>

                    {ordineAperto.nota ? (
                      <div
                        style={{
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                          borderRadius: 14,
                          padding: 12,
                          color: "#9a3412",
                          lineHeight: 1.5,
                        }}
                      >
                        {ordineAperto.nota}
                      </div>
                    ) : (
                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e5e7eb",
                          borderRadius: 14,
                          padding: 12,
                          color: "#64748b",
                        }}
                      >
                        Nessuna nota presente.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </div>
      </div>
    </div>
  );
}

function smallBadge(bg, color) {
  return {
    background: bg,
    color,
    borderRadius: 999,
    padding: "4px 8px",
    fontWeight: 800,
    fontSize: 11,
  };
}

const infoRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #eef2f7",
  color: "#334155",
};

const inputStyle = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid #d1d5db",
  padding: "12px 14px",
  background: "white",
  outline: "none",
};

export default Storico;
