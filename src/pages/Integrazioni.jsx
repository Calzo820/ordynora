import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar.jsx";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../lib/api.js";
import { integrationJobLabel, isSelectedIntegrationActive } from "../lib/integrationState.js";
import { persistRestaurantMode } from "../lib/restaurantMode.js";
import { appShellStyle, glowPageStyle } from "../styles/pageStyles.js";
import "../styles/integrations.css";

const STATUS_COPY = {
  draft: { label: "Da verificare", tone: "amber", detail: "Configurazione salvata: prova la connessione." },
  pending_partner: { label: "Attivazione esterna", tone: "blue", detail: "Serve l'abilitazione prevista dal fornitore." },
  testing: { label: "Test in corso", tone: "blue", detail: "Verifica di credenziali e permessi." },
  connected: { label: "Connessione verificata", tone: "green", detail: "Accesso riuscito. Completa gli abbinamenti." },
  degraded: { label: "Da controllare", tone: "red", detail: "L'ultimo test o invio non è riuscito." },
  disabled: { label: "Disconnesso", tone: "gray", detail: "Credenziali eliminate." },
};

function formatDate(value) {
  if (!value) return "Mai";
  try {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "Mai";
  }
}

function createInitialForm(provider, current) {
  const sameProvider = current?.provider === provider?.id;
  const config = {};
  for (const field of provider?.configFields || []) {
    config[field.key] = sameProvider
      ? current?.config?.[field.key] || field.defaultValue || ""
      : field.defaultValue || "";
  }
  return { config, credentials: {} };
}

function validMappingDraft(workspace) {
  const validRemote = {
    menu_item: new Set((workspace?.remote?.menuItems || []).filter((row) => row.ready !== false).map((row) => String(row.id))),
    table: new Set((workspace?.remote?.tables || []).filter((row) => row.ready !== false).map((row) => String(row.id))),
  };
  return Object.fromEntries(
    (workspace?.mappings || [])
      .filter((row) => validRemote[row.entityType]?.has(String(row.externalId)))
      .map((row) => [`${row.entityType}:${row.localId}`, row.externalId])
  );
}

function Field({ field, value, onChange, hasStoredValue = false, optionsOverride = null }) {
  const describedBy = field.help ? `integration-help-${field.key}` : undefined;
  const options = optionsOverride?.length ? optionsOverride : field.options;
  return (
    <label className="posi-field">
      <span>{field.label}{field.required ? <b aria-label="obbligatorio"> *</b> : null}</span>
      {field.type === "select" || options?.length ? (
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} aria-describedby={describedBy}>
          {!field.required ? <option value="">Seleziona</option> : null}
          {(options || []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "password" ? "password" : "text"}
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={hasStoredValue && field.type === "password" ? "Già salvata: lascia vuoto per mantenerla" : field.placeholder}
          autoComplete={field.type === "password" ? "new-password" : "off"}
          aria-describedby={describedBy}
        />
      )}
      {field.help ? <small id={describedBy}>{field.help}</small> : null}
    </label>
  );
}

function ProgressRow({ done, number, title, detail, action, actionLabel, disabled = false, active = false }) {
  return (
    <div className={`posi-progress-row ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}>
      <b>{done ? "✓" : number}</b>
      <div><strong>{title}</strong><span>{detail}</span></div>
      {actionLabel ? <button type="button" onClick={action} disabled={disabled}>{actionLabel}</button> : null}
    </div>
  );
}

function MappingEditor({ workspace, draft, setDraft, onSave, onAuto, onImport, busy, readOnly = false }) {
  const [entityType, setEntityType] = useState("menu_item");
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const locals = entityType === "menu_item" ? workspace.local.menuItems : workspace.local.tables;
  const remotes = entityType === "menu_item" ? workspace.remote.menuItems : workspace.remote.tables;
  const missingKeys = new Set((workspace.summary?.missing || []).map((row) => `${row.entityType}:${row.localId}`));
  const incomplete = (workspace.summary?.missing || []).filter((row) => row.kind === "incomplete");
  const filtered = locals.filter((row) => {
    if (onlyMissing && !missingKeys.has(`${entityType}:${row.id}`)) return false;
    const haystack = `${row.name || ""} ${row.sku || row.code || ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <section className="posi-mapping" aria-labelledby="posi-mapping-title">
      <div className="posi-mapping__head">
        <div>
          <span>Passo 3</span>
          <h2 id="posi-mapping-title">Abbina senza duplicare</h2>
          <p>Ordynora propone solo corrispondenze certe. Tu controlli quelle rimaste e salvi.</p>
        </div>
        <div className="posi-mapping__head-actions">
          <button type="button" className="posi-secondary" onClick={onAuto} disabled={Boolean(busy) || readOnly}>
            {busy === "auto" ? "Ricerca..." : "Abbina esistenti"}
          </button>
          <button type="button" className="posi-primary" onClick={onImport} disabled={Boolean(busy) || readOnly}>
            {busy === "import" ? "Importazione..." : "Importa menu e tavoli"}
          </button>
        </div>
      </div>

      {readOnly ? <div className="posi-inline-note" role="status">La sincronizzazione è attiva: gli abbinamenti sono in sola lettura. Premi “Metti in pausa” prima di modificarli.</div> : null}
      {workspace.remote.warnings?.map((warning) => (
        <div className="posi-inline-note" key={warning}>{warning}</div>
      ))}

      <div className="posi-mapping__summary">
        <div><b>{workspace.summary.menu.mapped}/{workspace.summary.menu.total}</b><span>prodotti pronti</span></div>
        <div><b>{workspace.summary.tables.mapped}/{workspace.summary.tables.total}</b><span>tavoli pronti</span></div>
        <div className={workspace.summary.ready ? "is-ready" : ""}>
          <b>{workspace.summary.ready ? "Pronto" : `${workspace.summary.missing.length} mancanti`}</b>
          <span>per l'attivazione</span>
        </div>
      </div>

      {incomplete.length ? (
        <div className="posi-mapping-issues" role="alert">
          <strong>{incomplete.length === 1 ? "1 abbinamento va aggiornato" : `${incomplete.length} abbinamenti vanno aggiornati`}</strong>
          <span>Il gestionale non restituisce più tutti i dati tecnici necessari. Seleziona di nuovo queste voci e salva.</span>
          <ul>{incomplete.slice(0, 6).map((row) => <li key={`${row.entityType}:${row.localId}`}>{row.label}: {row.reason}</li>)}</ul>
        </div>
      ) : null}

      <div className="posi-mapping__toolbar">
        <div className="posi-segmented" aria-label="Tipo abbinamento">
          <button type="button" className={entityType === "menu_item" ? "is-active" : ""} onClick={() => setEntityType("menu_item")}>Prodotti</button>
          <button type="button" className={entityType === "table" ? "is-active" : ""} onClick={() => setEntityType("table")}>Tavoli</button>
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca..." aria-label="Cerca elemento" />
        <label className="posi-check"><input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} /> Solo mancanti</label>
      </div>

      <div className="posi-mapping__rows">
        {filtered.length ? filtered.map((local) => {
          const key = `${entityType}:${local.id}`;
          return (
            <label className="posi-map-row" key={key}>
              <span>
                <strong>{local.name}</strong>
                <small>{local.virtual ? local.optional === false ? "Voce di servizio obbligatoria" : "Voce di servizio facoltativa" : local.sku || local.code || local.category || "Ordynora"}</small>
              </span>
              <span aria-hidden="true">→</span>
              <select
                value={draft[key] || ""}
                disabled={Boolean(busy) || readOnly}
                onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.value }))}
              >
                <option value="">Non abbinato</option>
                {remotes.filter((remote) => remote.ready !== false).map((remote) => (
                  <option key={remote.id} value={remote.id}>{remote.name}{remote.sku ? ` · ${remote.sku}` : ""}</option>
                ))}
              </select>
            </label>
          );
        }) : <div className="posi-empty">Nessun elemento da mostrare con questi filtri.</div>}
      </div>
      <div className="posi-mapping__footer">
        <span>Il coperto è obbligatorio se configurato nel ristorante. Abbina anche gli extra se li usi.</span>
        <button type="button" className="posi-primary" onClick={onSave} disabled={Boolean(busy) || readOnly}>
          {busy === "mapping" ? "Salvataggio..." : "Salva abbinamenti"}
        </button>
      </div>
    </section>
  );
}

export default function Integrazioni() {
  const [catalog, setCatalog] = useState([]);
  const [current, setCurrent] = useState(null);
  const [jobSummary, setJobSummary] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ config: {}, credentials: {} });
  const [encryptionReady, setEncryptionReady] = useState(true);
  const [operationMode, setOperationMode] = useState("full");
  const [workspace, setWorkspace] = useState(null);
  const [mappingDraft, setMappingDraft] = useState({});
  const [jobs, setJobs] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => catalog.find((provider) => provider.id === selectedId) || catalog[0] || null,
    [catalog, selectedId]
  );
  const selectedIsCurrent = isSelectedIntegrationActive(current, selected);
  const status = selectedIsCurrent ? STATUS_COPY[current.status] || STATUS_COPY.draft : null;
  const connectionReady = selectedIsCurrent && current?.status === "connected";
  const connectionUsable = selectedIsCurrent
    && ["connected", "degraded"].includes(current?.status)
    && Boolean(current?.lastTestedAt);
  const currentSyncActive = current?.syncMode === "active" || current?.config?.syncMode === "active";
  const syncActive = selectedIsCurrent && currentSyncActive;
  const mappingsReady = workspace ? Boolean(workspace.summary?.ready) : Boolean(syncActive);

  function applyWorkspace(nextWorkspace) {
    setWorkspace(nextWorkspace);
    setMappingDraft(validMappingDraft(nextWorkspace));
    const suggestedSalesPoint = nextWorkspace?.remote?.suggestedConfig?.salesPointId;
    if (suggestedSalesPoint) {
      setForm((previous) => ({
        ...previous,
        config: { ...previous.config, salesPointId: previous.config.salesPointId || suggestedSalesPoint },
      }));
    }
  }

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [catalogResponse, currentResponse] = await Promise.all([
        apiGet("/integrations/catalog"),
        apiGet("/integrations/current"),
      ]);
      const providers = catalogResponse.integrations || [];
      const active = currentResponse.integration || null;
      const initialId = active?.provider || providers[0]?.id || "";
      setCatalog(providers);
      setCurrent(active);
      setJobSummary(currentResponse.jobSummary || {});
      setOperationMode(currentResponse.operationMode || "full");
      persistRestaurantMode(currentResponse.operationMode || "full");
      setEncryptionReady(Boolean(catalogResponse.encryptionReady && currentResponse.encryptionReady));
      setSelectedId(initialId);
      setForm(createInitialForm(providers.find((provider) => provider.id === initialId), active));
      setShowSetup(Boolean(active && active.status !== "disabled"));
    } catch (err) {
      setError(err.message || "Non riesco a caricare i gestionali disponibili.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!syncActive) return;
    let disposed = false;
    let pending = false;
    async function refreshJobs() {
      if (document.hidden || disposed || pending) return;
      pending = true;
      try {
        const response = await apiGet("/integrations/current/jobs", { retries: 0, timeoutMs: 10000 });
        if (!disposed) {
          setJobs(response.jobs || []);
          setJobSummary(response.summary || {});
        }
      } catch { /* Keep the last known state; do not interrupt service. */ }
      finally { pending = false; }
    }
    refreshJobs();
    const timer = window.setInterval(refreshJobs, 8000);
    document.addEventListener("visibilitychange", refreshJobs);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshJobs);
    };
  }, [syncActive, current?.id]);

  async function loadWorkspace({ open = true } = {}) {
    try {
      setBusy("workspace");
      setError("");
      const response = await apiGet("/integrations/current/workspace");
      applyWorkspace(response);
      const requiresSalesPoint = selected?.id === "teamsystem_cassa_in_cloud"
        && (response.remote?.salesPoints?.length || 0) > 1
        && !response.remote?.selectedSalesPoint;
      if (open && requiresSalesPoint) {
        setShowSetup(true);
        setShowMapping(false);
        setError("Scegli il punto vendita Cassa in Cloud nella configurazione, salva e ripeti la prova di connessione.");
      } else if (open) {
        setShowMapping(true);
      }
      return response;
    } catch (err) {
      setError(err.message || "Non riesco a caricare i dati del gestionale.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function loadJobs() {
    try {
      const response = await apiGet("/integrations/current/jobs");
      setJobs(response.jobs || []);
      setJobSummary(response.summary || {});
    } catch (err) {
      setError(err.message || "Non riesco a caricare gli ultimi invii.");
    }
  }

  function selectProvider(provider) {
    setSelectedId(provider.id);
    setForm(createInitialForm(provider, current));
    setWorkspace(null);
    setShowMapping(false);
    setShowSetup(true);
    setError("");
    setMessage("");
  }

  async function saveConfiguration(event) {
    event.preventDefault();
    if (!selected) return;
    try {
      setBusy("save");
      setError("");
      setMessage("");
      const response = await apiPost("/integrations/current", {
        provider: selected.id,
        config: form.config,
        credentials: Object.fromEntries(Object.entries(form.credentials).filter(([, value]) => String(value || "").trim())),
      });
      setCurrent(response.integration);
      const nextOperationMode = response.operationMode || operationMode;
      setOperationMode(nextOperationMode);
      persistRestaurantMode(nextOperationMode);
      setForm(createInitialForm(selected, response.integration));
      setWorkspace(null);
      setMessage(response.message || "Configurazione salvata.");
    } catch (err) {
      setError(err.message || "Non riesco a salvare la configurazione.");
    } finally {
      setBusy("");
    }
  }

  async function runConnectionTest() {
    try {
      setBusy("test");
      setError("");
      setMessage("");
      const response = await apiPost("/integrations/current/test", {});
      setCurrent(response.integration);
      setForm(createInitialForm(selected, response.integration));
      setMessage(response.message || "Test completato.");
      if (response.outcome === "connected") await loadWorkspace({ open: true });
    } catch (err) {
      const failureMessage = err.message || "Test di connessione non riuscito.";
      await load().catch(() => {});
      setError(failureMessage);
    } finally {
      setBusy("");
    }
  }

  async function saveMappings() {
    if (!workspace) return;
    try {
      setBusy("mapping");
      setError("");
      const mappings = [
        ...workspace.local.menuItems.map((row) => ({ entityType: "menu_item", localId: row.id, externalId: mappingDraft[`menu_item:${row.id}`] || "" })),
        ...workspace.local.tables.map((row) => ({ entityType: "table", localId: row.id, externalId: mappingDraft[`table:${row.id}`] || "" })),
      ];
      const response = await apiPut("/integrations/current/mappings", { mappings });
      setWorkspace((previous) => ({ ...previous, mappings: response.mappings, summary: response.summary }));
      setMessage(response.message);
    } catch (err) {
      setError(err.message || "Non riesco a salvare gli abbinamenti.");
    } finally {
      setBusy("");
    }
  }

  async function autoMap() {
    try {
      setBusy("auto");
      setError("");
      const response = await apiPost("/integrations/current/mappings/auto", {});
      const nextWorkspace = { ...workspace, mappings: response.mappings, summary: response.summary };
      setWorkspace(nextWorkspace);
      setMappingDraft(validMappingDraft(nextWorkspace));
      setMessage(response.message);
    } catch (err) {
      setError(err.message || "Abbinamento automatico non completato.");
    } finally {
      setBusy("");
    }
  }

  async function importCatalog() {
    if (!window.confirm("Importare in Ordynora i prodotti e i tavoli che non esistono ancora? Gli elementi già presenti non verranno sovrascritti.")) return;
    try {
      setBusy("import");
      setError("");
      const response = await apiPost("/integrations/current/import", {});
      const nextWorkspace = {
        ...workspace,
        local: response.local,
        mappings: response.mappings,
        summary: response.summary,
      };
      setWorkspace(nextWorkspace);
      setMappingDraft(validMappingDraft(nextWorkspace));
      setMessage(response.message);
    } catch (err) {
      setError(err.message || "Importazione non completata.");
    } finally {
      setBusy("");
    }
  }

  async function changeSyncMode(nextMode) {
    try {
      setBusy("activation");
      setError("");
      const response = await apiPatch("/integrations/current/sync-mode", { syncMode: nextMode });
      setCurrent(response.integration);
      if (response.operationMode) {
        setOperationMode(response.operationMode);
        persistRestaurantMode(response.operationMode);
      }
      setMessage(response.message);
      if (response.summary) setWorkspace((previous) => previous ? { ...previous, summary: response.summary } : previous);
    } catch (err) {
      setError(err.message || "Non riesco a cambiare lo stato della sincronizzazione.");
    } finally {
      setBusy("");
    }
  }

  async function syncNow() {
    try {
      setBusy("sync");
      setError("");
      const response = await apiPost("/integrations/current/sync", {});
      setMessage(response.message);
      window.setTimeout(loadJobs, 1200);
    } catch (err) {
      setError(err.message || "Non riesco ad avviare la sincronizzazione.");
    } finally {
      setBusy("");
    }
  }

  async function retryJob(jobId) {
    try {
      setBusy(`retry:${jobId}`);
      const response = await apiPost(`/integrations/current/jobs/${jobId}/retry`, {});
      setMessage(response.message);
      await loadJobs();
    } catch (err) {
      setError(err.message || "Riprova non avviata.");
    } finally {
      setBusy("");
    }
  }

  async function changeMode(nextMode) {
    if (nextMode === operationMode || busy) return;
    if (
      nextMode === "integrated"
      && (!current || current.status !== "connected" || current.syncMode !== "active")
    ) {
      setError("Prima completa test, abbinamenti e attivazione. La modalità integrata si abilita automaticamente solo quando il collegamento è pronto.");
      return;
    }
    if (nextMode === "full" && !window.confirm("Riattivare conto, pagamenti e cassa interna di Ordynora?")) return;
    try {
      setBusy("mode");
      const response = await apiPatch("/integrations/mode", { operationMode: nextMode });
      setOperationMode(response.operationMode);
      persistRestaurantMode(response.operationMode);
      if (nextMode === "full") {
        setCurrent((previous) => previous ? {
          ...previous,
          syncMode: "paused",
          config: { ...(previous.config || {}), syncMode: "paused" },
        } : previous);
      }
      setMessage(response.message);
    } catch (err) {
      setError(err.message || "Non riesco a cambiare modalità.");
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnettere il gestionale e cancellare credenziali e abbinamenti?")) return;
    try {
      setBusy("disconnect");
      const response = await apiDelete("/integrations/current");
      setCurrent(response.integration);
      setOperationMode(response.operationMode || "full");
      persistRestaurantMode(response.operationMode || "full");
      setWorkspace(null);
      setJobs([]);
      setMessage(response.message);
    } catch (err) {
      setError(err.message || "Disconnessione non riuscita.");
    } finally {
      setBusy("");
    }
  }

  const salesPointOptions = (workspace?.remote?.salesPoints || []).map((point) => ({ value: point.id, label: `${point.name} · ${point.id}` }));

  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div style={appShellStyle}>
        <main className="app-shell integrations-os posi-page">
          <section className="posi-hero posi-hero--compact">
            <div>
              <span className="posi-eyebrow">Collegamento gestionale</span>
              <h1>Il servizio in Ordynora. La parte fiscale nella tua cassa.</h1>
              <p>Una configurazione guidata, poi l'invio è automatico e controllabile.</p>
            </div>
            {current && current.status !== "disabled" ? (
              <span className={`posi-status posi-status--${STATUS_COPY[current.status]?.tone || "gray"}`}>
                {current.providerName} · {currentSyncActive ? "attivo" : "in pausa"}
              </span>
            ) : null}
          </section>

          {!encryptionReady && !loading ? (
            <div className="posi-alert posi-alert--warning" role="alert">
              <strong>Manca un'unica configurazione su Render.</strong>
              <span>Aggiungi INTEGRATION_ENCRYPTION_KEY: fino ad allora Ordynora non salva correttamente le chiavi API.</span>
            </div>
          ) : null}
          {error ? <div className="posi-alert posi-alert--error" role="alert">{error}</div> : null}
          {message ? <div className="posi-alert posi-alert--success" role="status">{message}</div> : null}
          {loading ? <section className="posi-loading" role="status">Caricamento...</section> : null}

          {!loading ? (
            <>
              <section className="posi-mode posi-mode--simple">
                <div className="posi-section__head">
                  <div><span>Modalità del ristorante</span><h2>Una scelta, senza doppie funzioni</h2></div>
                </div>
                <div className="posi-mode__grid">
                  <button type="button" className={operationMode === "full" ? "posi-mode__card is-active" : "posi-mode__card"} onClick={() => changeMode("full")} disabled={Boolean(busy)}>
                    <span>Senza altro gestionale</span><strong>Ordynora completa</strong><p>Anche conto, pagamenti e chiusura interna.</p><b>{operationMode === "full" ? "Attiva" : "Scegli"}</b>
                  </button>
                  <button type="button" className={operationMode === "integrated" ? "posi-mode__card is-active" : "posi-mode__card"} onClick={() => changeMode("integrated")} disabled={Boolean(busy)}>
                    <span>Con Tilby o Cassa in Cloud</span><strong>Ordynora operativa</strong><p>Sala, cucina e bar qui; fiscale nel gestionale.</p><b>{operationMode === "integrated" ? "Attiva" : "Scegli"}</b>
                  </button>
                </div>
              </section>

              <section className="posi-section">
                <div className="posi-section__head">
                  <div><span>Passo 1</span><h2>Scegli il gestionale</h2></div>
                  <p>Mostriamo solo i due connettori realmente programmati.</p>
                </div>
                <div className="posi-provider-grid posi-provider-grid--two">
                  {catalog.map((provider) => {
                    const isSelected = selected?.id === provider.id;
                    const isCurrent = current?.provider === provider.id && current?.status !== "disabled";
                    return (
                      <button key={provider.id} type="button" className={`posi-provider ${isSelected ? "is-selected" : ""}`} onClick={() => selectProvider(provider)} aria-pressed={isSelected} disabled={Boolean(busy)}>
                        <span className="posi-provider__vendor">{provider.vendor}</span>
                        <strong>{provider.name}</strong>
                        <p>{provider.summary}</p>
                        <span className={`posi-badge posi-badge--${isCurrent ? STATUS_COPY[current.status]?.tone : "gray"}`}>
                          {isCurrent ? STATUS_COPY[current.status]?.label : provider.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {selected ? (
                <section className="posi-launchpad">
                  <div className="posi-launchpad__head">
                    <div><span>Configurazione guidata</span><h2>{selected.name}</h2><p>{selected.syncStrategy?.description}</p></div>
                    <button type="button" className="posi-text-button" onClick={() => setShowSetup((value) => !value)}>{showSetup ? "Nascondi configurazione" : "Apri configurazione"}</button>
                  </div>
                  <div className="posi-progress-list">
                    <ProgressRow done={selectedIsCurrent} number="1" title="Credenziali protette" detail={selectedIsCurrent ? "Salvate cifrate sul server" : "Inserisci i dati richiesti dal provider"} action={() => setShowSetup(true)} actionLabel={selectedIsCurrent ? "Modifica" : "Configura"} />
                    <ProgressRow done={connectionReady} number="2" title="Connessione" detail={status?.detail || "Test senza scrivere ordini"} action={runConnectionTest} actionLabel={busy === "test" ? "Verifica..." : "Prova"} disabled={!selectedIsCurrent || Boolean(busy)} />
                    <ProgressRow done={mappingsReady} number="3" title="Menu e tavoli" detail={mappingsReady ? "Tutti gli elementi attivi sono abbinati" : "Abbina le voci dei due sistemi"} action={() => workspace ? setShowMapping(true) : loadWorkspace()} actionLabel={busy === "workspace" ? "Caricamento..." : "Abbina"} disabled={!connectionUsable || Boolean(busy)} />
                    <ProgressRow done={syncActive} number="4" title="Sincronizzazione" detail={syncActive ? "Automatica, con retry e controllo duplicati" : "Resta in pausa finché non la attivi"} active={syncActive} action={() => changeSyncMode(syncActive ? "paused" : "active")} actionLabel={busy === "activation" ? "Attendi..." : syncActive ? "Metti in pausa" : "Attiva"} disabled={(!mappingsReady && !syncActive) || Boolean(busy)} />
                  </div>
                  <div className="posi-provider-note"><strong>{selected.syncStrategy?.title}</strong><span>{selected.syncStrategy?.activationNote}</span></div>
                </section>
              ) : null}

              {selected && showSetup ? (
                <form className="posi-config-card posi-config-card--standalone" onSubmit={saveConfiguration}>
                  <div className="posi-config-card__head"><div><span>Passo 2</span><h2>Accesso a {selected.name}</h2><p>Salva, poi usa “Prova connessione”. Nessun ordine viene inviato durante il test.</p></div>{status ? <span className={`posi-status posi-status--${status.tone}`}>{status.label}</span> : null}</div>
                  <div className="posi-requirements"><strong>Ti serve</strong><ul>{selected.requirements.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div className="posi-fields">
                    {selected.configFields.map((field) => (
                      <Field key={field.key} field={field} value={form.config[field.key]} onChange={(value) => setForm((previous) => ({ ...previous, config: { ...previous.config, [field.key]: value } }))} optionsOverride={field.key === "salesPointId" ? salesPointOptions : null} />
                    ))}
                    {selected.credentialFields.map((field) => (
                      <Field key={field.key} field={field} value={form.credentials[field.key]} onChange={(value) => setForm((previous) => ({ ...previous, credentials: { ...previous.credentials, [field.key]: value } }))} hasStoredValue={selectedIsCurrent && current?.hasCredentials} />
                    ))}
                  </div>
                  <div className="posi-actions">
                    <button className="posi-primary" type="submit" disabled={Boolean(busy) || !encryptionReady}>{busy === "save" ? "Salvataggio..." : "Salva in modo sicuro"}</button>
                    {selectedIsCurrent ? <button className="posi-secondary" type="button" onClick={runConnectionTest} disabled={Boolean(busy)}>{busy === "test" ? "Verifica..." : "Prova connessione"}</button> : null}
                  </div>
                  {selectedIsCurrent ? <div className="posi-current-summary"><div><span>Ultimo test</span><b>{formatDate(current.lastTestedAt)}</b></div><div><span>Ultimo invio</span><b>{formatDate(current.lastSyncAt)}</b></div><div><span>Segreti</span><b>{current.hasCredentials ? "Cifrati" : "Assenti"}</b></div></div> : null}
                </form>
              ) : null}

              {workspace && showMapping ? <MappingEditor workspace={workspace} draft={mappingDraft} setDraft={setMappingDraft} onSave={saveMappings} onAuto={autoMap} onImport={importCatalog} busy={busy} readOnly={syncActive} /> : null}

              {syncActive ? (
                <section className="posi-operations">
                  <div><span>Controllo operativo</span><h2>Invii al gestionale</h2><p>Gli errori temporanei vengono riprovati da soli. Qui intervieni solo sui casi bloccati.</p></div>
                  <div className="posi-operations__actions"><button type="button" className="posi-secondary" onClick={syncNow} disabled={Boolean(busy)}>{busy === "sync" ? "Accodamento..." : "Sincronizza ordini idonei"}</button><button type="button" className="posi-secondary" onClick={loadJobs}>Aggiorna stato</button></div>
                  <div className="posi-job-totals"><span><b>{jobSummary.succeeded || 0}</b> elaborati</span><span><b>{(jobSummary.pending || 0) + (jobSummary.processing || 0) + (jobSummary.retrying || 0)}</b> in lavorazione</span><span className={(jobSummary.failed || 0) + (jobSummary.blocked || 0) ? "has-errors" : ""}><b>{(jobSummary.failed || 0) + (jobSummary.blocked || 0)}</b> da vedere</span></div>
                  {jobs.length ? <div className="posi-jobs">{jobs.slice(0, 10).map((job) => <div className={`posi-job posi-job--${job.status}`} key={job.id}><span><strong>{integrationJobLabel(job)}</strong><small>Ordine {job.entityId?.slice(-8)} · {formatDate(job.createdAt)} · tentativo {job.attempts}</small>{job.lastError ? <em>{job.lastError}</em> : null}</span>{["failed", "blocked"].includes(job.status) ? <button type="button" onClick={() => retryJob(job.id)} disabled={Boolean(busy)}>{busy === `retry:${job.id}` ? "Attendi..." : "Riprova"}</button> : null}</div>)}</div> : null}
                </section>
              ) : null}

              {selectedIsCurrent && current.status !== "disabled" ? (
                <section className="posi-danger-zone"><div><strong>Vuoi tornare a Ordynora completa?</strong><span>Puoi mettere in pausa senza cancellare nulla, oppure disconnettere ed eliminare chiavi e abbinamenti.</span></div><button type="button" onClick={disconnect} disabled={Boolean(busy)}>{busy === "disconnect" ? "Disconnessione..." : "Disconnetti gestionale"}</button></section>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
