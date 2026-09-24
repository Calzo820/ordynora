import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiPost,
  getAuthToken,
  publicApiGet,
  publicApiPost,
  setAuthToken,
} from "../lib/api";
import { getHomePathByRole } from "../lib/roles";
import { isTemporaryServiceFailure } from "../lib/serviceHealth";
import "../styles/auth.css";

export default function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [accessMode, setAccessMode] = useState("email");
  const [pinForm, setPinForm] = useState({ restaurantCode: "", pin: "" });

  const [showPassword, setShowPassword] = useState(false);
  const [errore, setErrore] = useState("");
  const [successo, setSuccesso] = useState("");
  const [avviso, setAvviso] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const emailValida = useMemo(() => {
    return /\S+@\S+\.\S+/.test(form.email.trim());
  }, [form.email]);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      // La sessione viene verificata dalla pagina protetta di destinazione.
    }

    let cancelled = false;
    async function wakeBackend() {
      try {
        await publicApiGet("/health", {}, { timeoutMs: 60000 });
        if (!cancelled) setAvviso("");
      } catch {
        if (!cancelled) {
          setAvviso("Ordynora si sta preparando. Il primo accesso può richiedere qualche secondo.");
        }
      }
    }
    wakeBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  function showError(error, fallback) {
    const message = error?.message || fallback || "Operazione non riuscita.";
    if (isTemporaryServiceFailure(error)) {
      setErrore("");
      setAvviso(`${message} Le credenziali non sono il problema.`);
      return;
    }
    setAvviso("");
    setErrore(message);
  }

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errore) setErrore("");
    if (successo) setSuccesso("");
    if (avviso) setAvviso("");
  }

  function completeLogin(data) {
    if (!data?.token) throw new Error("Risposta di accesso incompleta. Riprova tra poco.");
    setAuthToken(data.token);
    if (data.user) localStorage.setItem("auth_user", JSON.stringify(data.user));
    if (data.restaurant) {
      localStorage.setItem("auth_restaurant", JSON.stringify(data.restaurant));
      localStorage.setItem("ristorante_attivo", data.restaurant.name || "");
      localStorage.setItem("restaurant_slug", data.restaurant.slug || "");
      localStorage.setItem("restaurant_id", data.restaurant.id || "");
    } else {
      localStorage.removeItem("auth_restaurant");
      localStorage.removeItem("ristorante_attivo");
      localStorage.removeItem("restaurant_slug");
      localStorage.removeItem("restaurant_id");
    }
    setSuccesso("Login effettuato con successo.");
    const redirectPath = getHomePathByRole(data?.user?.role || "owner", data?.user);
    setTimeout(() => navigate(redirectPath), 350);
  }

  async function loginWithCredentials(email, password) {
    try {
      setLoading(true);
      setAvviso("");

      const data = await apiPost("/auth/login", {
        email,
        password,
      });
      completeLogin(data);
    } catch (error) {
      showError(error, "Errore durante il login.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    setErrore("");
    setSuccesso("");
    setAvviso("");

    if (accessMode === "pin") {
      const restaurantCode = pinForm.restaurantCode.trim().toLowerCase();
      const pin = pinForm.pin.trim();
      if (!restaurantCode || !/^\d{4,6}$/.test(pin)) {
        setErrore("Inserisci il codice ristorante e un PIN da 4 a 6 numeri.");
        return;
      }
      try {
        setLoading(true);
        const data = await apiPost("/auth/pin-login", { restaurantCode, pin });
        completeLogin(data);
      } catch (error) {
        showError(error, "Accesso PIN non riuscito.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (!email || !password) {
      setErrore("Inserisci email e password.");
      return;
    }

    if (!emailValida) {
      setErrore("Inserisci un'email valida.");
      return;
    }

    if (password.length < 6) {
      setErrore("La password deve avere almeno 6 caratteri.");
      return;
    }

    await loginWithCredentials(email, password);
  }

  async function handleDemoLogin() {
    try {
      setDemoLoading(true);
      setErrore("");
      setAvviso("");
      setSuccesso("Preparo la demo completa: logo, tavoli, menu, ordini e storico...");
      await publicApiPost("/demo/ensure", {}, {}, { timeoutMs: 120000 });
      setForm({ email: "owner@demo.test", password: "EasyMenu2026!" });
      setSuccesso("Demo completa pronta. Accesso in corso...");
      await loginWithCredentials("owner@demo.test", "EasyMenu2026!");
    } catch (error) {
      showError(error, "Non sono riuscito a preparare la demo completa.");
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <div
      className="auth-page"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)",
      }}
    >
      <div
        className="auth-shell"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "28px 16px 40px",
        }}
      >
        <div
          className="auth-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 22,
            alignItems: "stretch",
          }}
        >
          <div
            className="auth-intro"
            style={{
              padding: 30,
              borderRadius: 30,
              background: "#ffffff",
              border: "1px solid #e5edf8",
              boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
              color: "#07111f",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 999,
                background: "#eef6ff",
                color: "#123b6b",
                fontWeight: 800,
                marginBottom: 18,
              }}
            >
              Accesso staff
            </div>

            <h1 className="auth-title" style={{ margin: 0, fontSize: 42, lineHeight: 1.08 }}>
              Entra nel tuo ristorante
            </h1>

            <p
              style={{
                marginTop: 14,
                maxWidth: 640,
                color: "#475569",
                lineHeight: 1.7,
                fontSize: 16,
              }}
            >
              Un unico accesso per arrivare subito agli strumenti del tuo ruolo,
              dalla sala alla cucina fino alla cassa.
            </p>

            <div
              className="auth-benefits"
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div
                className="auth-benefit"
                style={{
                  background: "#f8fbff",
                  border: "1px solid #e5edf8",
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 22 }}>Sala</div>
                <div style={{ marginTop: 6, opacity: 0.92 }}>Tavoli e prenotazioni</div>
              </div>

              <div
                className="auth-benefit"
                style={{
                  background: "#f8fbff",
                  border: "1px solid #e5edf8",
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 22 }}>Cucina</div>
                <div style={{ marginTop: 6, opacity: 0.92 }}>Comande in tempo reale</div>
              </div>

              <div
                className="auth-benefit"
                style={{
                  background: "#f8fbff",
                  border: "1px solid #e5edf8",
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 22 }}>Cassa</div>
                <div style={{ marginTop: 6, opacity: 0.92 }}>Conti e pagamenti</div>
              </div>
            </div>
          </div>

          <div
            className="section-card auth-form-card"
            style={{
              background: "rgba(255,255,255,0.96)",
              padding: 24,
              borderRadius: 28,
            }}
          >
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  color: "#64748b",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                }}
              >
                ACCESSO RISERVATO
              </div>
              <h2 style={{ margin: "8px 0 0 0", color: "#0b2e59" }}>Bentornato</h2>
            </div>

            {errore ? (
              <div
                className="auth-status"
                role="alert"
                style={{
                  marginBottom: 14,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  borderRadius: 14,
                  padding: 12,
                  fontWeight: 700,
                }}
              >
                {errore}
              </div>
            ) : null}

            {avviso ? (
              <div
                className="auth-status"
                role="status"
                style={{
                  marginBottom: 14,
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                  borderRadius: 14,
                  padding: 12,
                  fontWeight: 800,
                  lineHeight: 1.45,
                }}
              >
                {avviso}
              </div>
            ) : null}

            {successo ? (
              <div
                className="auth-status"
                role="status"
                style={{
                  marginBottom: 14,
                  background: "#ecfdf5",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                  borderRadius: 14,
                  padding: 12,
                  fontWeight: 700,
                }}
              >
                {successo}
              </div>
            ) : null}

            <div className="auth-access-switch" aria-label="Tipo di accesso">
              <button type="button" className={accessMode === "email" ? "is-active" : ""} onClick={() => setAccessMode("email")}>Email</button>
              <button type="button" className={accessMode === "pin" ? "is-active" : ""} onClick={() => setAccessMode("pin")}>PIN staff</button>
            </div>

            <form onSubmit={handleSubmit}>
              {accessMode === "email" ? (
                <>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    fontWeight: 800,
                    color: "#123b6b",
                  }}
                >
                  Email
                </label>

                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="esempio@ristorante.it"
                  autoComplete="email"
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: "1px solid #d6e4f5",
                    padding: "13px 14px",
                    background: "white",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    fontWeight: 800,
                    color: "#123b6b",
                  }}
                >
                  Password
                </label>

                <div
                  className="auth-password-row"
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder="Inserisci la password"
                    autoComplete="current-password"
                    style={{
                      width: "100%",
                      borderRadius: 14,
                      border: "1px solid #d6e4f5",
                      padding: "13px 14px",
                      background: "white",
                      outline: "none",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{
                      border: "1px solid #d6e4f5",
                      borderRadius: 14,
                      padding: "13px 14px",
                      background: "white",
                      fontWeight: 800,
                      color: "#123b6b",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {showPassword ? "Nascondi" : "Mostra"}
                  </button>
                </div>
                <div style={{ marginTop: 8, textAlign: "right" }}>
                  <Link to="/password-dimenticata" style={{ color: "#2563eb", fontWeight: 800, textDecoration: "none", fontSize: 13 }}>
                    Password dimenticata?
                  </Link>
                </div>
              </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label className="auth-field-label">Codice ristorante</label>
                    <input
                      className="auth-field-input"
                      value={pinForm.restaurantCode}
                      onChange={(event) => setPinForm((prev) => ({ ...prev, restaurantCode: event.target.value }))}
                      placeholder="es. trattoria-rossi"
                      autoComplete="organization"
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label className="auth-field-label">PIN personale</label>
                    <input
                      className="auth-field-input auth-pin-input"
                      type="password"
                      inputMode="numeric"
                      minLength="4"
                      maxLength="6"
                      value={pinForm.pin}
                      onChange={(event) => setPinForm((prev) => ({ ...prev, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      placeholder="••••"
                      autoComplete="current-password"
                    />
                    <small className="auth-pin-help">Usa il codice del locale e il PIN creato dal titolare nella sezione Staff.</small>
                  </div>
                </>
              )}


              <button
                type="submit"
                disabled={loading || demoLoading}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 16,
                  padding: "14px 18px",
                  background: "linear-gradient(135deg, #123b6b 0%, #2563eb 100%)",
                  color: "white",
                  fontWeight: 900,
                  fontSize: 16,
                  cursor: loading || demoLoading ? "not-allowed" : "pointer",
                  opacity: loading || demoLoading ? 0.7 : 1,
                  boxShadow: "0 16px 26px rgba(37,99,235,0.20)",
                }}
              >
                {loading ? "Accesso in corso..." : accessMode === "pin" ? "Entra con PIN" : "Accedi"}
              </button>
            </form>

            <button
              type="button"
              disabled={loading || demoLoading}
              onClick={handleDemoLogin}
              style={{
                width: "100%",
                marginTop: 12,
                border: "1px solid #99f6e4",
                borderRadius: 16,
                padding: "14px 18px",
                background: "linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)",
                color: "#064e3b",
                fontWeight: 900,
                fontSize: 16,
                cursor: loading || demoLoading ? "not-allowed" : "pointer",
                opacity: loading || demoLoading ? 0.7 : 1,
              }}
            >
              {demoLoading ? "Creo demo completa..." : "Entra nella demo completa"}
            </button>

            <div
              style={{
                marginTop: 10,
                color: "#64748b",
                fontSize: 13,
                fontWeight: 750,
                lineHeight: 1.45,
              }}
            >
              Una demo pronta con logo, 24 tavoli, menu completo, ordini e storico.
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: "1px solid #e5edf8",
                color: "#64748b",
                fontSize: 14,
              }}
            >
              Non hai ancora un account?{" "}
              <Link
                to="/register?next=/billing&plan=starter"
                style={{
                  color: "#2563eb",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
Scegli un piano e registrati
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
