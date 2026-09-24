import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { publicApiGet } from "../lib/api";
import { getRecoveryDelayMs, isServiceReady, recoveryLabel } from "../lib/serviceHealth";

export default function ServiceUnavailable({ message = "" }) {
  const [phase, setPhase] = useState(() => navigator.onLine === false ? "offline" : "checking");
  const [seconds, setSeconds] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const cycleRef = useRef(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const runCheck = useCallback(async () => {
    if (runningRef.current) return;
    if (navigator.onLine === false) {
      setPhase("offline");
      return;
    }

    runningRef.current = true;
    const nextAttempt = cycleRef.current + 1;
    cycleRef.current = nextAttempt;
    setAttempt(nextAttempt);
    setPhase("checking");
    setSeconds(0);

    try {
      const result = await publicApiGet("/ready", {}, { timeoutMs: 15000, retries: 0 });
      if (!isServiceReady(result)) throw new Error("Database non ancora pronto");
      if (!mountedRef.current) return;
      setPhase("ready");
      window.setTimeout(() => window.location.reload(), 900);
    } catch {
      if (!mountedRef.current) return;
      setPhase(nextAttempt >= 6 ? "paused" : "waiting");
      setSeconds(Math.ceil(getRecoveryDelayMs(nextAttempt) / 1000));
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    runCheck();
    const onOnline = () => {
      cycleRef.current = 0;
      runCheck();
    };
    const onOffline = () => setPhase("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [runCheck]);

  useEffect(() => {
    if (phase !== "waiting") return undefined;
    const delay = getRecoveryDelayMs(attempt);
    const countdown = window.setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    const retry = window.setTimeout(runCheck, delay);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(retry);
    };
  }, [attempt, phase, runCheck]);

  return (
    <main className="service-recovery-page">
      <section className="service-recovery-card" aria-live="polite">
        <div className={`service-recovery-signal is-${phase}`} aria-hidden="true"><i /><i /><i /></div>
        <span className="service-recovery-kicker">Sessione protetta</span>
        <h1>{phase === "offline" ? "Collegati a internet" : phase === "ready" ? "Ordynora è di nuovo online" : "Stiamo ripristinando il servizio"}</h1>
        <p>
          Non devi rifare l'accesso e non perderai il ristorante collegato. Ordynora controlla automaticamente server e database.
        </p>
        <div className={`service-recovery-status is-${phase}`} role="status">
          <i aria-hidden="true" />
          <div>
            <b>{recoveryLabel(phase, seconds)}</b>
            {attempt > 0 ? <small>Tentativo {attempt} di 6</small> : null}
          </div>
        </div>
        {message ? (
          <details className="service-recovery-details">
            <summary>Dettagli tecnici</summary>
            <p>{message}</p>
          </details>
        ) : null}
        <div className="service-recovery-actions">
          <button type="button" onClick={runCheck} disabled={phase === "checking" || phase === "ready"}>
            {phase === "checking" ? "Controllo in corso..." : "Controlla adesso"}
          </button>
          <Link to="/demo">Apri demo</Link>
          <Link to="/">Torna alla home</Link>
        </div>
      </section>
    </main>
  );
}
