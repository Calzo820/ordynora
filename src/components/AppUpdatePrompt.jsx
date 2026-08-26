import { useEffect, useRef, useState } from "react";

export default function AppUpdatePrompt() {
  const registrationRef = useRef(null);
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onUpdateAvailable = (event) => {
      registrationRef.current = event.detail?.registration || null;
      setAvailable(Boolean(registrationRef.current?.waiting));
    };
    window.addEventListener("ordynora:update-available", onUpdateAvailable);
    return () => window.removeEventListener("ordynora:update-available", onUpdateAvailable);
  }, []);

  function applyUpdate() {
    const waitingWorker = registrationRef.current?.waiting;
    if (!waitingWorker || updating) return;
    setUpdating(true);

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }, { once: true });

    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  if (!available) return null;

  return (
    <aside className="em-install-prompt em-update-prompt" role="status" aria-live="polite">
      <div>
        <b>Aggiornamento disponibile</b>
        <span>Installa la nuova versione in un momento sicuro, senza interrompere una comanda.</span>
      </div>
      <button type="button" onClick={applyUpdate} disabled={updating}>
        {updating ? "Aggiorno..." : "Aggiorna ora"}
      </button>
      <button type="button" className="em-install-dismiss" onClick={() => setAvailable(false)} aria-label="Più tardi">×</button>
    </aside>
  );
}
