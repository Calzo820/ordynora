import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getPublicOrderQueueSummary,
  retryFailedPublicOrders,
  startOfflineOrderSync,
} from "../lib/offlineOrders";
import { subscribeSocketStatus } from "../lib/realtime";

function initialState() {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const queue = getPublicOrderQueueSummary();
  return {
    status: online ? "connected" : "offline",
    message: online ? "Sistema online" : "Connessione assente",
    pending: queue.pending,
    failed: queue.failed,
  };
}

export default function ConnectionStatus() {
  const location = useLocation();
  const [state, setState] = useState(initialState);
  const [retrying, setRetrying] = useState(false);
  const recoveredTimer = useRef(null);
  const isCustomerMenu = location.pathname === "/menu"
    || location.pathname.startsWith("/menu/")
    || location.pathname === "/cliente/menu"
    || location.pathname.startsWith("/cliente/menu/");
  const shouldMonitor = isCustomerMenu || Boolean(localStorage.getItem("auth_token"));

  useEffect(() => {
    if (!shouldMonitor) return undefined;
    const stopQueue = startOfflineOrderSync();
    const onOnline = () => setState((prev) => ({ ...prev, status: "recovering", message: "Connessione ripristinata, sincronizzo..." }));
    const onOffline = () => setState((prev) => ({ ...prev, status: "offline", message: "Connessione assente: gli ordini restano protetti" }));
    const onApiStatus = (event) => setState((prev) => ({ ...prev, ...(event.detail || {}) }));
    const onQueue = (event) => setState((prev) => ({
      ...prev,
      pending: Number(event.detail?.pending || 0),
      failed: Number(event.detail?.failed || 0),
    }));
    const onQueueFailed = (event) => setState((prev) => ({
      ...prev,
      status: "offline",
      message: event.detail?.message || "Un ordine richiede un nuovo tentativo",
    }));
    const stopSocket = subscribeSocketStatus((detail) => setState((prev) => ({ ...prev, ...detail })));

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("ordynora:connection-status", onApiStatus);
    window.addEventListener("ordynora:offline-queue", onQueue);
    window.addEventListener("ordynora:offline-order-failed", onQueueFailed);
    return () => {
      stopQueue();
      stopSocket();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("ordynora:connection-status", onApiStatus);
      window.removeEventListener("ordynora:offline-queue", onQueue);
      window.removeEventListener("ordynora:offline-order-failed", onQueueFailed);
      if (recoveredTimer.current) window.clearTimeout(recoveredTimer.current);
    };
  }, [shouldMonitor]);

  useEffect(() => {
    if (!shouldMonitor || state.status !== "connected" || state.pending > 0) return undefined;
    recoveredTimer.current = window.setTimeout(() => {
      setState((prev) => ({ ...prev, message: "" }));
    }, 2800);
    return () => window.clearTimeout(recoveredTimer.current);
  }, [shouldMonitor, state.status, state.pending]);

  if (!shouldMonitor || (!state.message && state.pending === 0)) return null;

  const displayStatus = state.failed > 0 ? "failed" : state.status;
  const displayMessage = state.failed > 0
    ? `${state.failed} ${state.failed === 1 ? "ordine richiede" : "ordini richiedono"} un nuovo tentativo`
    : state.message || "Sincronizzazione in corso";

  async function retryFailed() {
    if (retrying) return;
    setRetrying(true);
    setState((prev) => ({ ...prev, status: "recovering", message: "Nuovo invio in corso..." }));
    try {
      const result = await retryFailedPublicOrders();
      const pending = Number(result.pending || 0);
      const failed = Number(result.failed || 0);
      setState((prev) => ({
        ...prev,
        pending,
        failed,
        status: failed > 0 ? "failed" : pending > 0 ? "recovering" : "connected",
        message: failed > 0
          ? "Invio non riuscito"
          : pending > 0
            ? "Ordine ancora in coda: nuovo tentativo automatico programmato"
            : "Ordini sincronizzati",
      }));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className={`em-connection em-connection--${displayStatus}`} role="status" aria-live="polite">
      <i aria-hidden="true" />
      <span>{displayMessage}</span>
      {state.pending > 0 ? <b>{state.pending} {state.pending === 1 ? "ordine in coda" : "ordini in coda"}</b> : null}
      {state.failed > 0 ? <button type="button" onClick={retryFailed} disabled={retrying}>{retrying ? "Invio..." : "Riprova"}</button> : null}
    </div>
  );
}
