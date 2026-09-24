import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import usePwaInstall from "../hooks/usePwaInstall";
import { ORDYNORA_LOGO_URL as logoOrdynora } from "../lib/brand";
import { apiGet, apiPost, clearAuthSession, getAuthToken } from "../lib/api";
import { getHomePathByRole } from "../lib/roles";
import { isTemporaryServiceFailure } from "../lib/serviceHealth";
import { persistLoginPayload, refreshSession } from "../lib/session";
import {
  forgetRestaurantCode,
  getRememberedRestaurantCode,
  getRestaurantCodeFromSearch,
  normalizeRestaurantCode,
  rememberRestaurantCode,
} from "../lib/staffDevice";
import "../styles/staff-access.css";

export default function StaffAccess() {
  const navigate = useNavigate();
  const pwa = usePwaInstall();
  const queryCode = useMemo(() => getRestaurantCodeFromSearch(window.location.search), []);
  const initialCode = useMemo(() => queryCode || getRememberedRestaurantCode(), [queryCode]);
  const [restaurantCode, setRestaurantCode] = useState(initialCode);
  const [rememberedCode, setRememberedCode] = useState(Boolean(initialCode));
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [installHelp, setInstallHelp] = useState("");
  const [error, setError] = useState("");

  const pinSlots = useMemo(
    () => Array.from({ length: 6 }, (_, index) => index < pin.length),
    [pin.length]
  );

  useEffect(() => {
    if (queryCode) rememberRestaurantCode(queryCode);
  }, [queryCode]);

  useEffect(() => {
    let active = true;

    async function restoreDeviceSession() {
      try {
        const data = getAuthToken() ? await apiGet("/auth/me") : await refreshSession();
        const user = data?.user;
        const returnedCode = normalizeRestaurantCode(data?.restaurant?.slug);
        const expectedCode = queryCode || initialCode;

        if (!user || (expectedCode && expectedCode !== returnedCode)) {
          clearAuthSession();
          return;
        }

        persistLoginPayload(data);
        if (returnedCode) rememberRestaurantCode(returnedCode);
        if (active) navigate(getHomePathByRole(user.role, user), { replace: true });
      } catch (restoreError) {
        if (isTemporaryServiceFailure(restoreError) && active) {
          setError(restoreError.message);
        } else {
          clearAuthSession();
        }
      } finally {
        if (active) setSessionChecking(false);
      }
    }

    restoreDeviceSession();
    return () => {
      active = false;
    };
  }, [initialCode, navigate, queryCode]);

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
    const code = normalizeRestaurantCode(restaurantCode);
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
      const data = await apiPost("/auth/pin-login", { restaurantCode: code, pin, rememberDevice });
      persistLoginPayload(data);
      rememberRestaurantCode(data?.restaurant?.slug || code);
      navigate(getHomePathByRole(data?.user?.role, data?.user), { replace: true });
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
    forgetRestaurantCode();
  }

  async function installApp() {
    const result = await pwa.requestInstall();
    if (result.status === "accepted" || result.status === "installed") {
      setInstallHelp("Ordynora è installata: la trovi nella schermata Home.");
      return;
    }
    setInstallHelp(pwa.manualCopy);
  }

  if (sessionChecking) {
    return (
      <main className="staff-access-page">
        <section className="staff-access-resume" role="status" aria-live="polite">
          <img src={logoOrdynora} alt="Ordynora" />
          <span>Dispositivo riconosciuto</span>
          <h1>Riapro la tua postazione</h1>
          <p>Verifico la sessione salvata in modo sicuro. Se è ancora valida, non dovrai reinserire il PIN.</p>
          <div className="staff-session-loader" aria-hidden="true"><i /></div>
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
          <p>{rememberedCode ? `Ristorante: ${restaurantCode}` : "Il codice si inserisce solo la prima volta su questo dispositivo."}</p>
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

        <label className="staff-remember-device">
          <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
          <span>
            <b>Mantieni collegato questo dispositivo</b>
            <small>Ai prossimi avvii Ordynora riapre direttamente il tuo ruolo. Il titolare può revocare l'accesso in qualsiasi momento.</small>
          </span>
        </label>

        {error ? <div className="staff-access-error" role="alert">{error}</div> : null}

        <button className="staff-access-submit" type="submit" disabled={loading || pin.length < 4}>
          {loading ? "Accesso in corso..." : "Entra"}
        </button>

        {!pwa.installed ? (
          <section className="staff-install-card" aria-label="Installa Ordynora">
            <div>
              <b>Usalo come un'app</b>
              <span>Icona sulla Home, apertura a schermo intero e accesso rapido alla postazione.</span>
            </div>
            <button type="button" onClick={installApp}>{pwa.canPrompt ? "Installa app" : "Come installare"}</button>
            {installHelp ? <p role="status">{installHelp}</p> : null}
          </section>
        ) : (
          <div className="staff-installed-badge">App installata su questo dispositivo</div>
        )}

        <div className="staff-access-owner">
          <span>Sei il titolare?</span>
          <Link to="/login">Accedi con email</Link>
        </div>
      </form>
    </main>
  );
}
