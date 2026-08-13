import { useState } from "react";
import { useLocation } from "react-router-dom";
import { usePwaInstall } from "../context/PwaInstallContext.jsx";

const APP_PATHS = ["/staff", "/login", "/dashboard", "/cucina", "/bar", "/cassa", "/tavoli"];

export default function AppInstallPrompt() {
  const location = useLocation();
  const { canPrompt, installed, ios, requestInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("ordynora_install_dismissed") === "1");

  const relevantPath = APP_PATHS.some((path) => location.pathname.startsWith(path));
  if (!relevantPath || installed || dismissed || (!canPrompt && !ios)) return null;

  async function install() {
    const result = await requestInstall();
    if (result?.outcome === "manual") window.alert(result.message);
  }

  function dismiss() {
    sessionStorage.setItem("ordynora_install_dismissed", "1");
    setDismissed(true);
  }

  return (
    <aside className="em-install-prompt" aria-label="Installa Ordynora">
      <div>
        <b>Ordynora sul telefono</b>
        <span>{canPrompt ? "Aprilo come un'app, senza cercarlo ogni volta." : "Tocca Condividi e poi Aggiungi alla schermata Home."}</span>
      </div>
      <button type="button" onClick={install}>Installa</button>
      <button type="button" className="em-install-dismiss" onClick={dismiss} aria-label="Chiudi">×</button>
    </aside>
  );
}
