import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { apiGet, apiPatch } from "../lib/api";
import { glowPageStyle, appShellStyle } from "../styles/pageStyles";
import { getStoredRestaurantMode, persistRestaurantMode } from "../lib/restaurantMode";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("it-IT");
}

export default function Errori() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [operationMode, setOperationMode] = useState(() => getStoredRestaurantMode());
  const integratedMode = operationMode === "integrated";

  async function loadLogs() {
    try {
      setLoading(true);
      const [data, restaurant] = await Promise.all([
        apiGet("/logs/errors?limit=80"),
        apiGet("/restaurants/me"),
      ]);
      const rows = Array.isArray(data) ? data : [];
      const mode = restaurant?.operationMode || "full";
      setOperationMode(mode);
      persistRestaurantMode(mode);
      setLogs(mode === "integrated"
        ? rows.filter((log) => !/payment|pagament|stripe|checkout/i.test(`${log.level} ${log.source}`))
        : rows);
      setErrore("");
    } catch (error) {
      setErrore(error.message || "Errore nel caricamento log");
    } finally {
      setLoading(false);
    }
  }

  async function resolveLog(id) {
    await apiPatch(`/logs/errors/${id}/resolve`, {});
    await loadLogs();
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const aperti = logs.filter((log) => !log.resolvedAt).length;
  const pagamenti = logs.filter((log) => log.level === "payment" && !log.resolvedAt).length;

  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div style={appShellStyle}>
        <div className="section-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="panel-title">Backup operativo & log errori</div>
              <div className="panel-subtitle">{integratedMode ? "Qui vedi errori di ordini, cucina, bar, tavoli e sincronizzazione del tuo ristorante." : "Qui vedi subito pagamenti falliti, webhook Stripe scaduti ed errori backend del tuo ristorante."}</div>
            </div>
            <button onClick={loadLogs} style={buttonStyle}>Aggiorna</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: `repeat(${integratedMode ? 2 : 3}, minmax(0,1fr))`, gap: 14, marginTop: 18 }}>
            <div style={metricStyle}><div className="metric-label">Log aperti</div><div className="metric-value">{aperti}</div></div>
            {!integratedMode ? <div style={metricStyle}><div className="metric-label">Problemi pagamento</div><div className="metric-value">{pagamenti}</div></div> : null}
            <div style={metricStyle}><div className="metric-label">Totale ultimi log</div><div className="metric-value">{logs.length}</div></div>
          </div>
        </div>

        {errore && <div className="section-card" style={{ color: "#b91c1c", fontWeight: 900 }}>{errore}</div>}
        {loading && <div className="section-card">Caricamento log...</div>}

        {!loading && (
          <div className="section-card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b" }}>
                  <th style={thStyle}>Quando</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Fonte</th>
                  <th style={thStyle}>Messaggio</th>
                  <th style={thStyle}>Stato</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={tdStyle}>{formatDate(log.createdAt)}</td>
                    <td style={tdStyle}><b>{log.level}</b></td>
                    <td style={tdStyle}>{log.source}</td>
                    <td style={tdStyle}>{log.message}</td>
                    <td style={tdStyle}>{log.resolvedAt ? `Risolto ${formatDate(log.resolvedAt)}` : "Aperto"}</td>
                    <td style={tdStyle}>{!log.resolvedAt && <button onClick={() => resolveLog(log.id)} style={smallButtonStyle}>Risolto</button>}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan="6" style={{ ...tdStyle, textAlign: "center", color: "#64748b" }}>Nessun errore registrato.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const metricStyle = { background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 18, padding: 18 };
const buttonStyle = { border: 0, borderRadius: 14, padding: "12px 16px", background: "#111827", color: "white", fontWeight: 900, cursor: "pointer" };
const smallButtonStyle = { ...buttonStyle, padding: "8px 10px", fontSize: 12 };
const thStyle = { padding: "12px 10px", fontSize: 13 };
const tdStyle = { padding: "14px 10px", verticalAlign: "top", fontSize: 14 };
