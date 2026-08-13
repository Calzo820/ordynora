import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import { appShellStyle, glowPageStyle } from "../styles/pageStyles";
import {
  createSubscriptionCheckout,
  getBillingStatus,
  openBillingPortal,
} from "../lib/api";

const WHATSAPP_NUMBER = "3240467723";
const CHAIN_MESSAGE = "Ciao, ho più ristoranti e vorrei informazioni su Ordynora per catene o multi-sede.";
const chainContactUrl = `https://wa.me/39${WHATSAPP_NUMBER}?text=${encodeURIComponent(CHAIN_MESSAGE)}`;

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "-";
  }
}

const planDetails = {
  starter: {
    title: "Mensile",
    price: "49,99 €",
    period: "/mese + IVA",
    badge: "Flessibile",
    saving: "",
    note: "Parti senza impegno lungo.",
  },
  growth: {
    title: "Trimestrale",
    price: "134,99 €",
    period: "/3 mesi + IVA",
    badge: "10% OFF",
    saving: "Risparmi rispetto al mensile",
    note: "Ideale per una stagione.",
  },
  semiannual: {
    title: "Semestrale",
    price: "254,99 €",
    period: "/6 mesi + IVA",
    badge: "15% OFF",
    saving: "Più continuità, meno pensieri",
    note: "Perfetto per stabilizzarlo nel servizio.",
    highlighted: true,
  },
  enterprise: {
    title: "Annuale",
    price: "449,99 €",
    period: "/anno + IVA",
    badge: "25% OFF",
    saving: "Miglior prezzo",
    note: "La scelta più conveniente.",
  },
};

const planOrder = ["starter", "growth", "semiannual", "enterprise"];
const includedPills = ["Ordynora completo", "Rinnovo automatico", "Disdici quando vuoi"];

function normalizePlan(plan) {
  return planOrder.includes(plan) ? plan : "starter";
}

function PlanCard({ id, currentPlan, loadingPlan, configured = true, onCheckout }) {
  const plan = planDetails[id];
  const active = currentPlan === id;
  const busy = loadingPlan === id;

  return (
    <article
      style={{
        ...pricingCardStyle,
        ...(plan.highlighted ? highlightedCardStyle : {}),
        ...(active ? activeCardStyle : {}),
      }}
    >
      <div style={cardTopStyle}>
        <div>
          <div style={{ ...badgeStyle, ...(plan.highlighted ? highlightedBadgeStyle : {}) }}>{active ? "Attivo" : plan.badge}</div>
          <h2 style={{ margin: "14px 0 0", color: plan.highlighted ? "white" : "#0f172a", fontSize: 24, letterSpacing: "-0.04em" }}>
            {plan.title}
          </h2>
        </div>
        {plan.highlighted ? <span style={sparkStyle}>Top</span> : null}
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 38, lineHeight: 1, fontWeight: 950, letterSpacing: "-0.06em", color: plan.highlighted ? "white" : "#0f172a" }}>
            {plan.price}
          </span>
          <span style={{ color: plan.highlighted ? "rgba(255,255,255,0.72)" : "#64748b", fontWeight: 900 }}>{plan.period}</span>
        </div>
        <div style={{ marginTop: 7, color: plan.highlighted ? "rgba(255,255,255,0.68)" : "#64748b", fontWeight: 850 }}>IVA calcolata nel checkout Stripe</div>
      </div>

      <p style={{ margin: "18px 0 0", minHeight: 44, color: plan.highlighted ? "rgba(255,255,255,0.78)" : "#475569", lineHeight: 1.45, fontWeight: 800 }}>
        {plan.saving || plan.note}
      </p>

      <div style={pillsWrapStyle}>
        {includedPills.map((pill) => (
          <span key={pill} style={{ ...pillStyle, ...(plan.highlighted ? darkPillStyle : {}) }}>{pill}</span>
        ))}
      </div>

      <button
        disabled={active || busy || !configured}
        onClick={() => onCheckout(id)}
        style={{
          ...checkoutButtonStyle,
          ...(plan.highlighted ? highlightedButtonStyle : {}),
          ...(active ? activeButtonStyle : {}),
          opacity: busy ? 0.72 : 1,
        }}
      >
        {!configured ? "Price ID mancante" : active ? "Piano attuale" : busy ? "Apro Stripe..." : `Scegli ${plan.title}`}
      </button>

      <div style={{ marginTop: 12, color: plan.highlighted ? "rgba(255,255,255,0.58)" : "#94a3b8", fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>
        {configured ? "Abbonamento automatico. Disdetta sempre disponibile dal portale." : "Configura la variabile Stripe price su Render prima della vendita."}
      </div>
    </article>
  );
}

function ChainCard() {
  return (
    <article style={chainCardStyle}>
      <div>
        <div style={chainBadgeStyle}>Multi-sede</div>
        <h2 style={{ margin: "12px 0 8px", fontSize: 28, letterSpacing: "-0.05em", color: "#0f172a" }}>Hai una catena?</h2>
        <p style={{ margin: 0, color: "#475569", fontWeight: 800, lineHeight: 1.55, maxWidth: 620 }}>
          Stesse funzioni Ordynora, con condizioni dedicate per più ristoranti, setup multi-locale e supporto personalizzato.
        </p>
      </div>
      <a href={chainContactUrl} target="_blank" rel="noreferrer" style={chainButtonStyle}>
        Contattami
      </a>
    </article>
  );
}

export default function Billing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingPlan, setLoadingPlan] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const queryStatus = searchParams.get("billing");
  const requestedPlan = normalizePlan(searchParams.get("plan") || "");

  async function load() {
    try {
      setLoading(true);
      const res = await getBillingStatus();
      setData(res);
      setError("");
    } catch (err) {
      setError(err.message || "Errore caricamento billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const planFromUrl = searchParams.get("plan");
    if (planFromUrl) handleCheckout(requestedPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheckout(plan) {
    try {
      const safePlan = normalizePlan(plan);
      setLoadingPlan(safePlan);
      const res = await createSubscriptionCheckout(safePlan);
      if (res?.checkoutUrl) window.location.href = res.checkoutUrl;
    } catch (err) {
      setError(err.message || "Errore apertura checkout");
    } finally {
      setLoadingPlan("");
    }
  }

  async function handlePortal() {
    try {
      setPortalLoading(true);
      const res = await openBillingPortal();
      if (res?.portalUrl) window.location.href = res.portalUrl;
    } catch (err) {
      setError(err.message || "Errore apertura portale Stripe");
    } finally {
      setPortalLoading(false);
    }
  }


  const currentPlan = data?.subscription?.plan || data?.restaurant?.plan || "";
  const status = data?.subscription?.status || "trialing";
  const configuredPlans = data?.configuredPlans || {};
  const missingPlans = planOrder.filter((id) => data && !configuredPlans[id]);
  const billingWarning = data && (!data.billingConfigured || missingPlans.length > 0);
  const paymentProblem = ["past_due", "unpaid", "incomplete"].includes(status);

  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div style={appShellStyle}>
        <div className="app-shell">
          <section style={pricingHeroStyle}>
            <div style={heroCopyStyle}>
              <div className="topbar-chip" style={{ marginBottom: 12, color: "#0f172a", background: "rgba(255,255,255,0.88)" }}>
                <span className="status-dot" style={{ background: "#22c55e" }} />
                Abbonamento Ordynora
              </div>
              <h1 style={{ margin: 0, fontSize: "clamp(32px, 4vw, 54px)", letterSpacing: "-0.07em", color: "white", lineHeight: 0.95 }}>
                Un solo prodotto. Scegli solo la durata.
              </h1>
              <p style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.65, maxWidth: 740, margin: "16px 0 0", fontWeight: 750 }}>
                Tutti i piani includono le stesse funzioni: QR, ordini live, cucina, bar, cassa, tavoli e supporto. Prezzi + IVA, rinnovo automatico e disdetta quando vuoi.
              </p>
            </div>
          </section>

          {queryStatus === "success" ? <div style={successBox}>Pagamento avviato correttamente. Stripe aggiorna lo stato via webhook.</div> : null}
          {queryStatus === "cancelled" ? <div style={warnBox}>Checkout annullato. Puoi riprovare quando vuoi.</div> : null}
          {error ? <div style={errorBox}>{error}</div> : null}
          {paymentProblem ? (
            <div style={warnBox}>
              Pagamento da verificare: lo stato abbonamento è <b>{status}</b>. Aggiorna il metodo di pagamento dal portale o contattaci per assistenza.
            </div>
          ) : null}
          {billingWarning ? (
            <div style={warnBox}>
              Checkout temporaneamente non disponibile per alcuni piani. Contattaci e lo sistemiamo entro 24 ore.
            </div>
          ) : null}

          <section style={statusStripStyle}>
            {loading ? (
              <div style={{ color: "#64748b", fontWeight: 850 }}>Caricamento stato abbonamento...</div>
            ) : (
              <>
                <InfoBox label="Ristorante" value={data?.restaurant?.name || "-"} />
                <InfoBox label="Piano" value={planDetails[currentPlan]?.title || currentPlan || "-"} />
                <InfoBox label="Stato" value={status} />
                <InfoBox label="Rinnovo" value={formatDate(data?.subscription?.currentPeriodEnd)} />
              </>
            )}
            <div style={statusActionsStyle}>
              <button onClick={load} style={secondaryBtn}>Aggiorna</button>
              <button onClick={handlePortal} disabled={portalLoading} style={primaryBtn}>
                {portalLoading ? "Apro..." : "Gestisci abbonamento"}
              </button>
            </div>
          </section>

          <section className="billing-connect-card" style={connectCardStyle}>
            <div style={connectCopyStyle}>
              <div style={connectEyebrowStyle}>Pagamenti dal tavolo</div>
              <h2 style={{ margin: "7px 0 8px", color: "#0f172a", fontSize: 26 }}>Funzione disponibile presto</h2>
              <p style={{ margin: 0, color: "#52647a", lineHeight: 1.55, fontWeight: 750 }}>
                Il collegamento Stripe per far pagare i clienti direttamente dal telefono non è ancora disponibile.
                Ordynora oggi gestisce QR, ordini, cucina, bar, cassa e richiesta conto; gli incassi online dal tavolo saranno attivati in una prossima versione.
              </p>
            </div>
            <div className="billing-connect-status" style={connectStatusStyle}>
              <span style={{ ...connectDotStyle, background: "#f59e0b" }} />
              <div>
                <b>In sviluppo</b>
                <small>Nessun conto Stripe del ristorante da collegare ora.</small>
              </div>
            </div>
            <div className="billing-connect-actions" style={connectActionsStyle}>
              <button type="button" disabled style={{ ...secondaryBtn, opacity: 0.65, cursor: "not-allowed" }}>
                Disponibile presto
              </button>
              <Link to="/contattaci" style={{ ...primaryBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                Segnalami interesse
              </Link>
            </div>
          </section>

          <section style={plansGridStyle}>
            {planOrder.map((id) => (
              <PlanCard key={id} id={id} currentPlan={currentPlan} loadingPlan={loadingPlan} configured={!data || Boolean(configuredPlans[id])} onCheckout={handleCheckout} />
            ))}
          </section>

          <ChainCard />
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color: "#111827", fontSize: 18, fontWeight: 950, marginTop: 4, textTransform: label === "Stato" ? "capitalize" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

const pricingHeroStyle = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 32,
  padding: "clamp(28px, 5vw, 54px)",
  marginBottom: 18,
  background: "radial-gradient(circle at 82% 18%, rgba(96,165,250,0.45), transparent 34%), linear-gradient(135deg, #020617 0%, #0f172a 48%, #172554 100%)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 28px 80px rgba(2,6,23,0.24)",
};

const heroCopyStyle = { position: "relative", zIndex: 1 };

const statusStripStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(120px, 1fr)) auto",
  gap: 16,
  alignItems: "center",
  padding: 18,
  borderRadius: 26,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(226,232,240,0.95)",
  boxShadow: "0 20px 50px rgba(15,23,42,0.08)",
  marginBottom: 18,
};

const statusActionsStyle = { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" };
const connectCardStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  gap: 20,
  alignItems: "center",
  marginBottom: 18,
  padding: 22,
  borderRadius: 24,
  border: "1px solid #bfdbfe",
  background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)",
  boxShadow: "0 18px 45px rgba(15,23,42,0.07)",
};
const connectCopyStyle = { minWidth: 0 };
const connectEyebrowStyle = { color: "#1d4ed8", fontSize: 12, fontWeight: 950, textTransform: "uppercase" };
const connectStatusStyle = { display: "flex", alignItems: "center", gap: 10, minWidth: 200 };
const connectDotStyle = { width: 12, height: 12, borderRadius: "50%", flex: "0 0 auto" };
const connectActionsStyle = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };

const plansGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
};

const pricingCardStyle = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minHeight: 335,
  padding: 22,
  borderRadius: 28,
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(226,232,240,0.96)",
  boxShadow: "0 24px 60px rgba(15,23,42,0.10)",
};

const highlightedCardStyle = {
  background: "radial-gradient(circle at 90% 5%, rgba(59,130,246,0.52), transparent 36%), linear-gradient(145deg, #020617 0%, #111827 58%, #172554 100%)",
  border: "1px solid rgba(147,197,253,0.32)",
  boxShadow: "0 34px 80px rgba(30,64,175,0.26)",
  transform: "translateY(-6px)",
};

const activeCardStyle = { border: "2px solid #22c55e", boxShadow: "0 28px 70px rgba(34,197,94,0.18)" };
const cardTopStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const badgeStyle = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "7px 11px", background: "#eff6ff", color: "#1d4ed8", fontSize: 12, fontWeight: 950 };
const highlightedBadgeStyle = { background: "rgba(255,255,255,0.14)", color: "white", border: "1px solid rgba(255,255,255,0.18)" };
const sparkStyle = { width: 34, height: 34, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.12)", color: "#fde68a", fontWeight: 950 };
const pillsWrapStyle = { display: "grid", gap: 8, marginTop: 18 };
const pillStyle = { display: "inline-flex", alignItems: "center", width: "fit-content", borderRadius: 999, padding: "7px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#334155", fontSize: 12, fontWeight: 900 };
const darkPillStyle = { background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.88)" };

const checkoutButtonStyle = {
  marginTop: "auto",
  width: "100%",
  border: "none",
  borderRadius: 18,
  padding: "15px 16px",
  background: "#0f172a",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 14px 30px rgba(15,23,42,0.16)",
};

const highlightedButtonStyle = { background: "white", color: "#0f172a" };
const activeButtonStyle = { background: "#dcfce7", color: "#166534", cursor: "default", boxShadow: "none" };

const chainCardStyle = {
  marginTop: 16,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap",
  padding: 26,
  borderRadius: 30,
  background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
  border: "1px solid #dbeafe",
  boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
};

const chainBadgeStyle = { display: "inline-flex", borderRadius: 999, padding: "7px 11px", background: "white", color: "#1d4ed8", fontSize: 12, fontWeight: 950, border: "1px solid #dbeafe" };
const chainButtonStyle = { textDecoration: "none", borderRadius: 18, padding: "14px 18px", background: "#2563eb", color: "white", fontWeight: 950, boxShadow: "0 18px 34px rgba(37,99,235,0.22)" };

const primaryBtn = { border: "none", borderRadius: 14, padding: "12px 16px", background: "#111827", color: "white", fontWeight: 900, cursor: "pointer" };
const secondaryBtn = { border: "1px solid #e5e7eb", borderRadius: 14, padding: "12px 16px", background: "white", color: "#111827", fontWeight: 900, cursor: "pointer" };
const successBox = { marginBottom: 14, padding: 14, borderRadius: 16, background: "#dcfce7", color: "#166534", fontWeight: 850 };
const warnBox = { marginBottom: 14, padding: 14, borderRadius: 16, background: "#fef3c7", color: "#92400e", fontWeight: 850 };
const errorBox = { marginBottom: 14, padding: 14, borderRadius: 16, background: "#fee2e2", color: "#991b1b", fontWeight: 850 };
