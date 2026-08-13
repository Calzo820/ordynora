import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logoOrdynora from "../assets/logo-easymenu.png";
import { apiPost, clearAuthSession, getAuthToken, setAuthToken } from "../lib/api";
import "../styles/staff-access.css";

const RESTAURANT_CODE_KEY = "easymenu_staff_restaurant_code";

function rolePath(role) {
  if (role === "kitchen") return "/cucina";
  if (role === "bar") return "/bar";
  if (role === "cashier") return "/cassa";
  if (role === "waiter") return "/tavoli";
  return "/dashboard";
}

function roleLabel(role) {
  if (role === "kitchen") return "Cucina";
  if (role === "bar") return "Bar";
  if (role === "cashier") return "Cassa";
  if (role === "waiter") return "Sala";
  if (role === "admin") return "Responsabile";
  return "Staff";
}

function storedUser() {
  try {
    return JSON.parse(localStorage.getItem("auth_user") || "null");
  } catch {
    return null;
  }
}

function completeSession(data) {
  setAuthToken(data.token);
  localStorage.setItem("auth_user", JSON.stringify(data.user || {}));
  localStorage.setItem("auth_restaurant", JSON.stringify(data.restaurant || {}));
  localStorage.setItem("ristorante_attivo", data.restaurant?.name || "");
  localStorage.setItem("restaurant_slug", data.restaurant?.slug || "");
  localStorage.setItem("restaurant_id", data.restaurant?.id || "");
}

export default function StaffAccess() {
  const navigate = useNavigate();
  const queryCode = new URLSearchParams(window.location.search).get("locale") || "";
  const savedCode = localStorage.getItem(RESTAURANT_CODE_KEY) || "";
  const [restaurantCode, setRestaurantCode] = useState(queryCode || savedCode);
  const [rememberedCode, setRememberedCode] = useState(Boolean(queryCode || savedCode));
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(() => getAuthToken() ? storedUser() : null);

  const pinSlots = useMemo(
    () => Array.from({ length: 6 }, (_, index) => index < pin.length),
    [pin.length]
  );

  function updatePin(value) {
    setPin(String(value || "").replace(/\D/g, "").slice(0, 6));
    setError("");
  }

  function pressDigit(digit) {
    if (pin.length >= 6 || loading) return;
    updatePin(`${pin}${digit}`);
  }

  async function submit(event) {
    event.preventDefault();
    const code = restaurantCode.trim().toLowerCase();
    if (!code) {
      setError("Inserisci il codice del ristorante.");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Il PIN deve contenere da 4 a 6 numeri.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data = await apiPost("/auth/pin-login", { restaurantCode: code, pin });
      completeSession(data);
      localStorage.setItem(RESTAURANT_CODE_KEY, code);
      navigate(rolePath(data?.user?.role), { replace: true });
    } catch (loginError) {
      updatePin("");
      setError(loginError.message || "PIN non riconosciuto. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  function changeRestaurant() {
    setRememberedCode(false);
    setRestaurantCode("");
    setPin("");
    setError("");
    localStorage.removeItem(RESTAURANT_CODE_KEY);
  }

  function changeOperator() {
    clearAuthSession();
    setCurrentUser(null);
    setPin("");
  }

  if (currentUser) {
    return (
      <main className="staff-access-page">
        <section className="staff-access-resume">
          <img src={logoOrdynora} alt="Ordynora" />
          <span>Sessione staff attiva</span>
          <h1>{currentUser.name || "Operatore"}</h1>
          <p>{roleLabel(currentUser.role)} è già collegato su questo dispositivo.</p>
          <button type="button" onClick={() => navigate(rolePath(currentUser.role), { replace: true })}>
            Continua in {roleLabel(currentUser.role)}
          </button>
          <button type="button" className="secondary" onClick={changeOperator}>Cambia operatore</button>
        </section>
      </main>
    );
  }

  return (
    <main className="staff-access-page">
      <section className="staff-access-intro">
        <img src={logoOrdynora} alt="Ordynora" />
        <div>
          <span>Accesso operativo</span>
          <h1>Entra nel tuo ruolo.</h1>
          <p>Un PIN personale porta ogni membro dello staff direttamente alla sua postazione.</p>
        </div>
        <ul>
          <li><b>Sala</b><span>Tavoli e prenotazioni</span></li>
          <li><b>Cucina e bar</b><span>Comande in tempo reale</span></li>
          <li><b>Cassa</b><span>Conti e chiusure</span></li>
        </ul>
      </section>

      <form className="staff-access-form" onSubmit={submit}>
        <div className="staff-access-heading">
          <span>Ordynora Staff</span>
          <h2>{rememberedCode ? "Inserisci il PIN" : "Collega il ristorante"}</h2>
          <p>{rememberedCode ? `Locale: ${restaurantCode}` : "Il codice si inserisce solo la prima volta su questo telefono."}</p>
        </div>

        {!rememberedCode ? (
          <label className="staff-restaurant-field">
            Codice ristorante
            <input
              value={restaurantCode}
              onChange={(event) => {
                setRestaurantCode(event.target.value);
                setError("");
              }}
              placeholder="es. bistrot-roma"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
            />
          </label>
        ) : (
          <button type="button" className="staff-change-restaurant" onClick={changeRestaurant}>Cambia ristorante</button>
        )}

        <label className="staff-pin-native">
          PIN personale
          <input
            value={pin}
            onChange={(event) => updatePin(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            type="password"
            minLength="4"
            maxLength="6"
          />
        </label>

        <div className="staff-pin-dots" aria-label={`${pin.length} cifre inserite`}>
          {pinSlots.map((filled, index) => <i key={index} className={filled ? "is-filled" : ""} />)}
        </div>

        <div className="staff-keypad" aria-label="Tastierino PIN">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button type="button" key={digit} onClick={() => pressDigit(digit)}>{digit}</button>
          ))}
          <button type="button" className="staff-keypad-clear" onClick={() => updatePin("")}>Azzera</button>
          <button type="button" onClick={() => pressDigit(0)}>0</button>
          <button type="button" className="staff-keypad-delete" onClick={() => updatePin(pin.slice(0, -1))} aria-label="Cancella ultima cifra">Elimina</button>
        </div>

        {error ? <div className="staff-access-error" role="alert">{error}</div> : null}

        <button className="staff-access-submit" type="submit" disabled={loading || pin.length < 4}>
          {loading ? "Accesso in corso..." : "Entra"}
        </button>

        <div className="staff-access-owner">
          <span>Sei il titolare?</span>
          <Link to="/login">Accedi con email</Link>
        </div>
      </form>
    </main>
  );
}
