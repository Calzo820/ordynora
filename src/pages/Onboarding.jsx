import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "../components/Navbar";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { imageFileToDataUrl } from "../lib/imageFiles";
import { appShellStyle, glowPageStyle } from "../styles/pageStyles";
import "../styles/onboarding.css";

const PRINT_LAYOUTS = [
  {
    key: "labels",
    title: "Etichette A4",
    text: "Formato compatto: più QR per pagina.",
  },
  {
    key: "large",
    title: "QR grande",
    text: "Un tavolo per pagina, ideale per plastificare.",
  },
  {
    key: "tent",
    title: "Segnaposto tavolo",
    text: "Formato più elegante da mettere in piedi sul tavolo.",
  },
  {
    key: "flyer",
    title: "Volantino A5",
    text: "Spiega Ordynora al cliente con un QR grande.",
  },
];

function SetupActionCard({ done, kicker, title, text, children, className = "" }) {
  return (
    <article className={`onb-action-card ${done ? "is-done" : ""} ${className}`}>
      <div className="onb-action-head">
        <div className="onb-check">{done ? "OK" : "..."}</div>
        <div>
          <span className="onb-action-kicker">{kicker}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      </div>
      {children ? <div className="onb-action-body">{children}</div> : null}
    </article>
  );
}

function baseUrl() {
  return window.location.origin;
}

function QrPrintDocument({ preview = false, layout, qrLinks, restaurant }) {
  if (layout === "flyer") {
    return (
      <div className={`${preview ? "onb-preview-document" : "onb-print-document"} onb-print-document--flyer`}>
        <div className="onb-flyer-grid">
          {qrLinks.map((table) => (
            <article className="onb-flyer" key={table.id}>
              <header>
                {restaurant?.logoUrl ? <img src={restaurant.logoUrl} alt="" /> : <span>{restaurant?.name?.slice(0, 1) || "E"}</span>}
                <div><b>{restaurant?.name || "Ristorante"}</b><small>Menu digitale Ordynora</small></div>
              </header>
              <div className="onb-flyer-copy">
                <span>Ordina dal tavolo</span>
                <h2>Il menu è già sul tuo telefono.</h2>
                <p>Guarda piatti e allergeni, invia l'ordine e segui la preparazione senza installare applicazioni.</p>
              </div>
              <div className="onb-flyer-steps">
                <div><b>1</b><span>Inquadra</span></div>
                <div><b>2</b><span>Scegli</span></div>
                <div><b>3</b><span>Ordina</span></div>
              </div>
              <div className="onb-flyer-qr">
                <QRCodeSVG value={table.link} size={260} includeMargin />
                <div><strong>{table.name}</strong><span>Apri la fotocamera e inquadra il QR</span><small>Puoi anche chiedere il conto e pagare dal telefono quando il servizio è attivo.</small></div>
              </div>
              <footer>easy.menu.service@gmail.com · Ordynora</footer>
            </article>
          ))}
          {!qrLinks.length ? <div className="onb-qr-empty">Crea prima i tavoli per generare i QR.</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`${preview ? "onb-preview-document" : "onb-print-document"} onb-print-document--${layout}`}>
      <div className="onb-print-title">
        <span>{layout === "tent" ? "Materiale da tavolo" : "QR tavoli"}</span>
        <h2>{restaurant?.name || "Ristorante"}</h2>
        <p>Scansiona il QR, apri il menu e ordina direttamente dal tavolo.</p>
      </div>
      <div className="onb-qr-grid">
        {qrLinks.map((table) => (
          <article className="onb-qr-card" key={table.id}>
            <div className="onb-qr-brand">{restaurant?.name || "Ordynora"}</div>
            <h3>{table.name}</h3>
            <QRCodeSVG className="onb-qr-code" value={table.link} size={180} includeMargin />
            <strong className="onb-qr-cta">Ordina dal tavolo</strong>
            {layout === "tent" ? <small className="onb-qr-hint">Inquadra con la fotocamera del telefono</small> : null}
            <p>{table.link}</p>
          </article>
        ))}
        {!qrLinks.length ? <div className="onb-qr-empty">Crea prima i tavoli per generare i QR.</div> : null}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const [status, setStatus] = useState(null);
  const [qrPayload, setQrPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tablesCount, setTablesCount] = useState(20);
  const [showQrPreview, setShowQrPreview] = useState(false);
  const [printLayout, setPrintLayout] = useState("labels");
  const [logoUrl, setLogoUrl] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const restaurant = status?.restaurant;
  const checks = status?.checks || {};
  const counts = status?.counts || {};

  const commandSteps = [
    {
      number: 1,
      title: "Logo",
      detail: checks.profile ? "Caricato" : "Da completare",
      done: Boolean(checks.profile),
      current: !checks.profile,
    },
    {
      number: 2,
      title: "Crea tavoli",
      detail: `${counts.activeTables || 0} attivi`,
      done: Boolean(checks.tables),
      current: checks.profile && !checks.tables,
    },
    {
      number: 3,
      title: "Aggiungi prodotti",
      detail: `${counts.menuItems || 0} prodotti`,
      done: Boolean(checks.menu),
      current: checks.profile && checks.tables && !checks.menu,
    },
    {
      number: 4,
      title: "Stampa QR",
      detail: `${qrPayload?.tables?.length || 0} pronti`,
      done: Boolean(checks.qr),
      current: checks.profile && checks.tables && checks.menu && !checks.qr,
    },
  ];
  const progress = Math.round((commandSteps.filter((step) => step.done).length / commandSteps.length) * 100);

  const qrLinks = useMemo(() => {
    const slug = qrPayload?.restaurant?.slug || restaurant?.slug;
    return (qrPayload?.tables || []).map((table) => ({ ...table, link: `${baseUrl()}/menu/${slug}/${table.qrToken}` }));
  }, [qrPayload, restaurant]);

  const setupCoach = useMemo(() => {
    if (loading) return null;

    if (!checks.profile) {
      return {
        tone: "brand",
        title: "Parti dal logo",
        text: "Il menu cliente deve sembrare del ristorante, non una demo generica. Carica il logo dal PC e salvalo.",
        actionLabel: "Carica logo",
        action: () => document.querySelector(".onb-logo-card")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      };
    }

    if (!checks.tables) {
      return {
        tone: "tables",
        title: "Crea la sala",
        text: "Prepara tutti i tavoli prima di stampare i QR. Per la demo commerciale consiglio almeno 20 tavoli.",
        actionLabel: "Crea tavoli",
        action: runAutoSetup,
      };
    }

    if (!checks.menu) {
      return {
        tone: "menu",
        title: "Completa il menu",
        text: "Aggiungi piatti, foto e disponibilità dalla pagina Menu. Il setup resta solo una guida veloce.",
        actionLabel: "Apri menu",
        action: () => { window.location.href = "/admin?tab=menu"; },
      };
    }

    if (!checks.qr || qrLinks.length === 0) {
      return {
        tone: "qr",
        title: "Prepara i QR",
        text: "Quando tavoli e menu sono pronti, stampa i QR e prova un ordine reale dal telefono.",
        actionLabel: "Anteprima QR",
        action: () => setShowQrPreview(true),
      };
    }

    return {
      tone: "done",
      title: "Pronto per il servizio",
      text: "Logo, tavoli, menu e QR sono allineati. Ora puoi provare il flusso con menu cliente, cucina e cassa.",
      actionLabel: "Rivedi QR",
      action: () => setShowQrPreview(true),
    };
  }, [checks.menu, checks.profile, checks.qr, checks.tables, loading, qrLinks.length]);

  async function load() {
    try {
      setError("");
      const [nextStatus, nextQr] = await Promise.all([apiGet("/onboarding/status"), apiGet("/onboarding/qr-payload")]);
      setStatus(nextStatus);
      setQrPayload(nextQr);
    } catch (err) {
      setError(err.message || "Errore caricamento setup");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("qr") === "1") setShowQrPreview(true);
  }, []);

  useEffect(() => {
    setLogoUrl(restaurant?.logoUrl || "");
  }, [restaurant?.logoUrl]);

  async function runAutoSetup() {
    try {
      setWorking(true);
      setError("");
      setMessage("");
      const result = await apiPost("/onboarding/auto-setup", {
        tablesCount: Number(tablesCount),
        seats: 4,
        zoneMode: "sala",
        createDemoMenu: false,
        overwriteEmptyOnly: true,
      });
      const activeTables = result.status?.counts?.activeTables || result.activeTablesAfter || 0;
      const created = Number(result.tablesCreated || 0);
      const reactivated = Number(result.tablesReactivated || 0);
      if (activeTables > 0) {
        setMessage(`Sala pronta: ${activeTables} tavoli attivi. Nuovi: ${created}. Riattivati: ${reactivated}.`);
      } else {
        setError("Non ho trovato tavoli attivi dopo la creazione. Riprova o contattaci.");
      }
      if (result.status) setStatus(result.status);
      await load();
    } catch (err) {
      setError(err.message || "Errore creazione tavoli");
    } finally {
      setWorking(false);
    }
  }

  async function handleLogoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      setError("");
      const dataUrl = await imageFileToDataUrl(file, { maxWidth: 900, maxHeight: 900, quality: 0.84 });
      setLogoUrl(dataUrl);
      setMessage("Logo caricato. Premi Salva logo per pubblicarlo nel menu cliente.");
    } catch (err) {
      setError(err.message || "Errore caricamento logo");
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  async function saveLogo() {
    try {
      setSavingLogo(true);
      setError("");
      setMessage("");
      const response = await apiPatch("/restaurants/me", { logoUrl: logoUrl.trim() || null });
      if (response?.restaurant) {
        localStorage.setItem("auth_restaurant", JSON.stringify(response.restaurant));
        localStorage.setItem("ristorante_attivo", response.restaurant.name || "");
      }
      setMessage("Logo ristorante salvato.");
      await load();
    } catch (err) {
      setError(err.message || "Errore salvataggio logo");
    } finally {
      setSavingLogo(false);
    }
  }

  function printQrPdf(layout = printLayout) {
    if (!qrLinks.length) return;
    setPrintLayout(layout);
    setShowQrPreview(true);
    setTimeout(() => window.print(), 450);
  }

  function openQrPreview() {
    setShowQrPreview(true);
  }

  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div style={appShellStyle}>
        <main className="app-shell onb-shell">
          <section className="onb-hero">
            <div>
              <span className="onb-pill">Setup servizio</span>
              <h1>Prepara il ristorante in pochi minuti.</h1>
              <p>{restaurant?.name || "Il ristorante"} deve fare quattro cose per partire: logo, tavoli, menu e QR. Lo staff separato resta opzionale.</p>
            </div>
            <div className="onb-progress-box">
              <div className="onb-progress-number">{progress}%</div>
              <div className="onb-progress-track"><span style={{ width: `${progress}%` }} /></div>
              <div className="onb-progress-label">Prontezza servizio</div>
            </div>
          </section>

          {error ? <div className="onb-alert danger">{error}</div> : null}
          {message ? <div className="onb-alert success">{message}</div> : null}
          {loading ? <div className="onb-card">Caricamento setup...</div> : null}

          <section className="onb-command-strip">
            {commandSteps.map((step) => (
              <article
                className={`onb-command-card ${step.done ? "is-done" : ""} ${step.current ? "is-current" : ""}`}
                key={step.number}
              >
                <span>{step.number}</span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </article>
            ))}
          </section>

          {setupCoach ? (
            <section className={`onb-coach-card ${setupCoach.tone}`}>
              <div>
                <span>Assistente setup</span>
                <h2>{setupCoach.title}</h2>
                <p>{setupCoach.text}</p>
              </div>
              <button type="button" className="onb-primary" onClick={setupCoach.action} disabled={working}>
                {working ? "Attendi..." : setupCoach.actionLabel}
              </button>
            </section>
          ) : null}

          <section className="onb-service-grid">
            <SetupActionCard done={checks.profile} kicker="Passo 1" title="Logo ristorante" text="Carica il logo dal PC: comparirà nel menu cliente e nei QR." >
              <div className="onb-logo-card">
                <div className="onb-logo-preview">
                  {logoUrl ? <img src={logoUrl} alt="Logo ristorante" /> : <span>{restaurant?.name?.slice(0, 1) || "E"}</span>}
                </div>
                <div className="onb-logo-tools">
                  <input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="URL logo oppure carica da PC" />
                  <div className="onb-actions">
                    <label className="onb-file-button">
                      {uploadingLogo ? "Carico..." : "Carica da PC"}
                      <input type="file" accept="image/*" onChange={handleLogoFile} disabled={uploadingLogo} />
                    </label>
                    <button className="onb-primary" type="button" onClick={saveLogo} disabled={savingLogo || uploadingLogo}>{savingLogo ? "Salvo..." : "Salva logo"}</button>
                  </div>
                </div>
              </div>
            </SetupActionCard>

            <SetupActionCard done={checks.tables} kicker="Passo 2" title="Tavoli" text="Inserisci quanti tavoli vuoi creare. Niente coperti, niente zone: solo numeri tavolo.">
              <div className="onb-form-row">
                <label>Numero tavoli<input type="number" min="1" max="200" value={tablesCount} onChange={(event) => setTablesCount(event.target.value)} /></label>
              </div>
              <button className="onb-primary" disabled={working} onClick={runAutoSetup}>{working ? "Creo..." : "Crea tavoli"}</button>
              <small>{counts.activeTables || 0} tavoli attivi.</small>
            </SetupActionCard>

            <SetupActionCard
              done={checks.menu}
              kicker="Passo 3"
              title="Menu"
              text="Gestisci prodotti, prezzi, foto e piatti non disponibili nella pagina Menu dedicata."
            >
              <div className="onb-menu-shortcut">
                <div>
                  <strong>{counts.menuItems || 0} prodotti nel menu</strong>
                  <span>Apri Menu per aggiungere piatti con foto, allergeni e disponibilità.</span>
                </div>
                <button className="onb-primary" type="button" onClick={() => { window.location.href = "/admin?tab=menu"; }}>
                  Apri pagina Menu
                </button>
              </div>
            </SetupActionCard>

            <SetupActionCard done={checks.qr} kicker="Passo 4" title="QR tavoli" text="Controlla l'anteprima e stampa i QR da mettere sui tavoli.">
              <div className="onb-actions">
                <button className="onb-secondary" onClick={openQrPreview}>Apri anteprima QR</button>
                <button className="onb-primary" disabled={!qrLinks.length} onClick={() => printQrPdf()}>Stampa PDF QR</button>
              </div>
              <small>{qrLinks.length} QR pronti.</small>
            </SetupActionCard>
          </section>

          <section className="onb-staff-strip">
            <div>
              <span>Staff opzionale</span>
              <strong>Non serve creare subito più email.</strong>
              <small>Parti con l'account owner. Aggiungi cucina, bar o cassa solo se il locale usa tablet separati.</small>
            </div>
            <button className="onb-secondary" type="button" onClick={() => { window.location.href = "/admin?tab=staff"; }}>Configura più avanti</button>
          </section>

          {showQrPreview ? (
            <div className="onb-modal-backdrop" role="presentation" onClick={() => setShowQrPreview(false)}>
              <section className="onb-qr-modal" role="dialog" aria-modal="true" aria-label="Anteprima QR tavoli" onClick={(event) => event.stopPropagation()}>
                <div className="onb-modal-head">
                  <div>
                    <span>Anteprima stampa</span>
                    <h2>{restaurant?.name || "Ristorante"} - QR Tavoli</h2>
                    <p>Scegli il formato più comodo per il ristorante e stampa solo il materiale pronto per i tavoli.</p>
                  </div>
                  <div className="onb-modal-actions">
                    <button className="onb-secondary" type="button" onClick={() => setShowQrPreview(false)}>Chiudi</button>
                    <button className="onb-primary" type="button" disabled={!qrLinks.length} onClick={() => printQrPdf()}>Stampa QR</button>
                  </div>
                </div>
                <div className="onb-print-options">
                  {PRINT_LAYOUTS.map((layout) => (
                    <button
                      className={printLayout === layout.key ? "is-active" : ""}
                      type="button"
                      key={layout.key}
                      onClick={() => setPrintLayout(layout.key)}
                    >
                      <strong>{layout.title}</strong>
                      <span>{layout.text}</span>
                    </button>
                  ))}
                </div>
                <div className="onb-preview-scroll">
                  <QrPrintDocument preview layout={printLayout} qrLinks={qrLinks} restaurant={restaurant} />
                </div>
              </section>
            </div>
          ) : null}
          {showQrPreview && typeof document !== "undefined"
            ? createPortal(
                <QrPrintDocument layout={printLayout} qrLinks={qrLinks} restaurant={restaurant} />,
                document.body
              )
            : null}
        </main>
      </div>
    </div>
  );
}
