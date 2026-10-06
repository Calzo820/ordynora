import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar.jsx";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api.js";
import { persistRestaurantMode } from "../lib/restaurantMode.js";
import { appShellStyle, glowPageStyle } from "../styles/pageStyles.js";
import "../styles/integrations.css";

const STATUS_COPY = {
  draft: { label: "Da verificare", tone: "amber", detail: "Configurazione salvata: esegui il test." },
  pending_partner: { label: "Attivazione assistita", tone: "blue", detail: "Serve il passaggio con il partner del gestionale." },
  testing: { label: "Test in corso", tone: "blue", detail: "Sto verificando credenziali e autorizzazioni." },
  connected: { label: "Collegato", tone: "green", detail: "Credenziali verificate. Ora va completata la mappatura." },
  degraded: { label: "Da controllare", tone: "red", detail: "L'ultimo test non è riuscito." },
  disabled: { label: "Disconnesso", tone: "gray", detail: "Le credenziali sono state eliminate." },
};

const CAPABILITY_COPY = {
  connectionTest: "Prova connessione",
  menuImport: "Menu e prodotti",
  tableSync: "Tavoli",
  orderExport: "Ordini",
  fiscalDocuments: "Documenti fiscali",
  webhooks: "Aggiornamenti automatici",
};

const CAPABILITY_STATE = {
  available: "Disponibile",
  mapping_required: "Dopo mappatura",
  partner_setup: "Con il partner",
  planned: "Pianificato",
  assisted: "Assistito",
};

function formatDate(value) {
  if (!value) return "Mai";
  try {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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

function Field({ field, value, onChange, hasStoredValue = false }) {
  const describedBy = field.help ? `integration-help-${field.key}` : undefined;
  return (
    <label className="posi-field">
      <span>
        {field.label}
        {field.required ? <b aria-label="obbligatorio"> *</b> : null}
      </span>
      {field.type === "select" ? (
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} aria-describedby={describedBy}>
          {(field.options || []).map((option) => (
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

export default function Integrazioni() {
  const [catalog, setCatalog] = useState([]);
  const [responsibilities, setResponsibilities] = useState(null);
  const [current, setCurrent] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ config: {}, credentials: {} });
  const [encryptionReady, setEncryptionReady] = useState(true);
  const [operationMode, setOperationMode] = useState("full");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => catalog.find((provider) => provider.id === selectedId) || catalog[0] || null,
    [catalog, selectedId]
  );
  const selectedIsCurrent = current?.provider === selected?.id && current?.status !== "disabled";
  const status = selectedIsCurrent ? STATUS_COPY[current.status] || STATUS_COPY.draft : null;

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
      setResponsibilities(catalogResponse.responsibilities || null);
      setCurrent(active);
      setOperationMode(currentResponse.operationMode || "full");
      persistRestaurantMode(currentResponse.operationMode || "full");
      setEncryptionReady(Boolean(catalogResponse.encryptionReady && currentResponse.encryptionReady));
      setSelectedId(initialId);
      setForm(createInitialForm(providers.find((provider) => provider.id === initialId), active));
    } catch (err) {
      setError(err.message || "Non riesco a caricare i gestionali disponibili.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function selectProvider(provider) {
    setSelectedId(provider.id);
    setForm(createInitialForm(provider, current));
    setError("");
    setMessage("");
  }

  function updateConfig(key, value) {
    setForm((previous) => ({ ...previous, config: { ...previous.config, [key]: value } }));
  }

  function updateCredential(key, value) {
    setForm((previous) => ({ ...previous, credentials: { ...previous.credentials, [key]: value } }));
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
        credentials: Object.fromEntries(
          Object.entries(form.credentials).filter(([, value]) => String(value || "").trim())
        ),
      });
      setCurrent(response.integration);
      setOperationMode(response.operationMode || "integrated");
      persistRestaurantMode(response.operationMode || "integrated");
      setForm(createInitialForm(selected, response.integration));
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
      setMessage(response.message || "Test completato.");
    } catch (err) {
      const failureMessage = err.message || "Test di connessione non riuscito.";
      await load().catch(() => {});
      setError(failureMessage);
    } finally {
      setBusy("");
    }
  }

  async function changeMode(nextMode) {
    if (nextMode === operationMode || busy) return;
    if (nextMode === "integrated" && (!current || current.status === "disabled")) {
      setError("Prima scegli un gestionale e salva la configurazione: la modalità con gestionale si attiverà automaticamente.");
      document.getElementById("posi-choose-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (nextMode === "full" && !window.confirm(
      "Passare a Ordynora completa? Cassa e pagamenti interni torneranno disponibili. Il collegamento salvato resterà configurato ma non sarà il sistema responsabile della chiusura."
    )) return;

    try {
      setBusy("mode");
      setError("");
      setMessage("");
      const response = await apiPatch("/integrations/mode", { operationMode: nextMode });
      setOperationMode(response.operationMode);
      persistRestaurantMode(response.operationMode);
      setMessage(response.message || "Modalità aggiornata.");
    } catch (err) {
      setError(err.message || "Non riesco a cambiare modalità.");
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    const confirmed = window.confirm(
      "Disconnettere il gestionale? Le credenziali cifrate e le mappature verranno eliminate."
    );
    if (!confirmed) return;
    try {
      setBusy("disconnect");
      setError("");
      const response = await apiDelete("/integrations/current");
      setCurrent(response.integration);
      setOperationMode(response.operationMode || "full");
      persistRestaurantMode(response.operationMode || "full");
      setForm(createInitialForm(selected, response.integration));
      setMessage(response.message || "Gestionale disconnesso.");
    } catch (err) {
      setError(err.message || "Disconnessione non riuscita.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div style={appShellStyle}>
        <main className="app-shell integrations-os posi-page">
          <section className="posi-hero">
            <div>
              <span className="posi-eyebrow">Gestionale collegato</span>
              <h1>Ordynora gestisce il servizio. La tua cassa continua a fare la cassa.</h1>
              <p>Scegli il gestionale che usi già, salva le credenziali sul server e verifica il collegamento senza duplicare il lavoro fiscale.</p>
            </div>
            <ol className="posi-steps" aria-label="Passaggi configurazione">
              <li className={selected ? "is-done" : ""}><b>1</b><span>Scegli</span></li>
              <li className={selectedIsCurrent ? "is-done" : ""}><b>2</b><span>Configura</span></li>
              <li className={current?.status === "connected" ? "is-done" : ""}><b>3</b><span>Verifica</span></li>
            </ol>
          </section>

          {!encryptionReady && !loading ? (
            <div className="posi-alert posi-alert--warning" role="alert">
              <strong>Prima configura la sicurezza del server.</strong>
              <span>Manca INTEGRATION_ENCRYPTION_KEY su Render: Ordynora blocca correttamente il salvataggio delle chiavi API.</span>
            </div>
          ) : null}
          {error ? <div className="posi-alert posi-alert--error" role="alert">{error}</div> : null}
          {message ? <div className="posi-alert posi-alert--success" role="status">{message}</div> : null}

          {loading ? <section className="posi-loading" role="status">Caricamento gestionali...</section> : null}

          {!loading && catalog.length ? (
            <>
              <section className="posi-mode" aria-labelledby="posi-mode-title">
                <div className="posi-section__head">
                  <div><span>Prima scelta</span><h2 id="posi-mode-title">Come vuoi usare Ordynora?</h2></div>
                  <p>Una sola responsabilità per ogni funzione: niente doppia cassa e niente conti registrati due volte.</p>
                </div>
                <div className="posi-mode__grid">
                  <button
                    type="button"
                    className={operationMode === "full" ? "posi-mode__card is-active" : "posi-mode__card"}
                    onClick={() => changeMode("full")}
                    disabled={Boolean(busy)}
                  >
                    <span>Per chi parte da zero</span>
                    <strong>Ordynora completa</strong>
                    <p>Sala, cucina, bar, conto, registrazione pagamenti e chiusura giornaliera nello stesso flusso.</p>
                    <b>{operationMode === "full" ? "Modalità attiva" : "Usa questa modalità"}</b>
                  </button>
                  <button
                    type="button"
                    className={operationMode === "integrated" ? "posi-mode__card is-active" : "posi-mode__card"}
                    onClick={() => changeMode("integrated")}
                    disabled={Boolean(busy)}
                  >
                    <span>Per chi ha già un gestionale</span>
                    <strong>Ordynora operativa</strong>
                    <p>Ordynora coordina il servizio. Pagamenti, scontrini, fatture e chiusura cassa restano nel gestionale.</p>
                    <b>{operationMode === "integrated" ? "Modalità attiva" : current && current.status !== "disabled" ? "Attiva" : "Configura sotto"}</b>
                  </button>
                </div>
                {operationMode === "integrated" ? (
                  <div className="posi-mode__notice">
                    <strong>Cosa è stato semplificato</strong>
                    <span>Cassa Ordynora, incassi, ricevute, chiusura giornaliera, margini e metodi di pagamento non vengono mostrati. Tavoli, QR, comande, portate, cucina, bar e tempi restano attivi.</span>
                  </div>
                ) : null}
              </section>

              <section className="posi-section" aria-labelledby="posi-choose-title">
                <div className="posi-section__head">
                  <div><span>Passo 1</span><h2 id="posi-choose-title">Quale gestionale usi?</h2></div>
                  <p>Partiamo da tre soluzioni diffuse in Italia. Altri connettori useranno lo stesso motore.</p>
                </div>
                <div className="posi-provider-grid">
                  {catalog.map((provider) => {
                    const isSelected = selected?.id === provider.id;
                    const isCurrent = current?.provider === provider.id && current?.status !== "disabled";
                    const currentStatus = isCurrent ? STATUS_COPY[current.status] || STATUS_COPY.draft : null;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        className={`posi-provider ${isSelected ? "is-selected" : ""}`}
                        onClick={() => selectProvider(provider)}
                        aria-pressed={isSelected}
                      >
                        <span className="posi-provider__vendor">{provider.vendor}</span>
                        <strong>{provider.name}</strong>
                        <p>{provider.summary}</p>
                        <span className={`posi-badge posi-badge--${currentStatus?.tone || "gray"}`}>
                          {currentStatus?.label || provider.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {selected ? (
                <section className="posi-config-layout">
                  <form className="posi-config-card" onSubmit={saveConfiguration}>
                    <div className="posi-config-card__head">
                      <div>
                        <span>Passo 2</span>
                        <h2>Configura {selected.name}</h2>
                        <p>{selected.setupMode === "assisted"
                          ? "Salva i dati dell'installazione: Ordynora ti indica il passaggio corretto senza chiedere chiavi inutili."
                          : "Le chiavi vengono cifrate sul backend e non tornano mai al browser."}</p>
                      </div>
                      {status ? <span className={`posi-status posi-status--${status.tone}`}>{status.label}</span> : null}
                    </div>

                    {current && current.provider !== selected.id && current.status !== "disabled" ? (
                      <div className="posi-switch-note">
                        Stai usando <b>{current.providerName}</b>. Salvando sostituirai il collegamento e azzererai le vecchie mappature.
                      </div>
                    ) : null}

                    <div className="posi-requirements">
                      <strong>Prima di iniziare</strong>
                      <ul>{selected.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>

                    <div className="posi-fields">
                      {selected.configFields.map((field) => (
                        <Field
                          key={field.key}
                          field={field}
                          value={form.config[field.key]}
                          onChange={(value) => updateConfig(field.key, value)}
                        />
                      ))}
                      {selected.credentialFields.map((field) => (
                        <Field
                          key={field.key}
                          field={field}
                          value={form.credentials[field.key]}
                          onChange={(value) => updateCredential(field.key, value)}
                          hasStoredValue={selectedIsCurrent && current?.hasCredentials}
                        />
                      ))}
                    </div>

                    <div className="posi-actions">
                      <button
                        className="posi-primary"
                        type="submit"
                        disabled={Boolean(busy) || (selected.credentialFields.length > 0 && !encryptionReady)}
                      >
                        {busy === "save" ? "Salvataggio..." : selected.setupMode === "assisted" ? "Salva richiesta" : "Salva configurazione"}
                      </button>
                      <button
                        className="posi-secondary"
                        type="button"
                        onClick={runConnectionTest}
                        disabled={Boolean(busy) || !selectedIsCurrent}
                      >
                        {busy === "test" ? "Verifica..." : selected.setupMode === "assisted" ? "Verifica percorso" : "Prova connessione"}
                      </button>
                    </div>

                    {selectedIsCurrent ? (
                      <div className="posi-current-summary">
                        <div><span>Stato</span><b>{status?.detail}</b></div>
                        <div><span>Ultimo test</span><b>{formatDate(current.lastTestedAt)}</b></div>
                        <div><span>Credenziali</span><b>{current.hasCredentials ? "Protette sul server" : "Non richieste"}</b></div>
                      </div>
                    ) : null}

                    {selectedIsCurrent && current.status !== "disabled" ? (
                      <button className="posi-disconnect" type="button" onClick={disconnect} disabled={Boolean(busy)}>
                        {busy === "disconnect" ? "Disconnessione..." : "Disconnetti e cancella credenziali"}
                      </button>
                    ) : null}
                  </form>

                  <aside className="posi-side-card">
                    <span>Passo 3</span>
                    <h2>Cosa succede dopo?</h2>
                    <div className="posi-next-list">
                      <div><b>1</b><p><strong>Test credenziali</strong><span>Controlliamo accesso e permessi senza importare o modificare dati.</span></p></div>
                      <div><b>2</b><p><strong>Mappatura</strong><span>Abbiniamo punto vendita, prodotti e tavoli evitando duplicati.</span></p></div>
                      <div><b>3</b><p><strong>Pilota</strong><span>Proviamo ordini reali in sandbox prima di attivare la produzione.</span></p></div>
                    </div>
                    <details className="posi-capabilities">
                      <summary>Vedi compatibilità tecnica</summary>
                      <dl>
                        {Object.entries(selected.capabilities || {}).map(([key, value]) => (
                          <div key={key}><dt>{CAPABILITY_COPY[key] || key}</dt><dd>{CAPABILITY_STATE[value] || value}</dd></div>
                        ))}
                      </dl>
                    </details>
                    <a href={selected.officialDocs} target="_blank" rel="noreferrer">Apri documentazione ufficiale</a>
                  </aside>
                </section>
              ) : null}

              {responsibilities ? (
                <section className="posi-boundary" aria-labelledby="posi-boundary-title">
                  <div className="posi-section__head">
                    <div><span>Confini chiari</span><h2 id="posi-boundary-title">Niente doppio gestionale</h2></div>
                    <p>Ogni funzione ha un responsabile preciso: meno confusione per chi lavora durante il servizio.</p>
                  </div>
                  <div className="posi-boundary-grid">
                    <article><span>Ordynora</span><h3>Operatività</h3><ul>{responsibilities.ordynora.map((item) => <li key={item}>{item}</li>)}</ul></article>
                    <article><span>Gestionale</span><h3>Fiscale e cassa</h3><ul>{responsibilities.managementSystem.map((item) => <li key={item}>{item}</li>)}</ul></article>
                    <article><span>Collegamento</span><h3>Dati sincronizzati</h3><ul>{responsibilities.synchronized.map((item) => <li key={item}>{item}</li>)}</ul></article>
                  </div>
                </section>
              ) : null}

              <section className="posi-other">
                <div><strong>Usi un altro gestionale?</strong><span>Il motore è estendibile, ma servono documentazione API e autorizzazione ufficiale del fornitore.</span></div>
                <a href="/contattaci">Richiedi un connettore</a>
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
