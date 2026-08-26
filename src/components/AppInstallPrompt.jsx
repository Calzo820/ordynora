import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import usePwaInstall from "../hooks/usePwaInstall";

const APP_PATHS = ["/", "/demo", "/register", "/staff", "/login", "/dashboard", "/cucina", "/bar", "/cassa", "/tavoli", "/admin", "/qr", "/billing"];
const DISMISS_KEY = "ordynora_install_banner_dismissed";

export default function AppInstallPrompt() {
  const location = useLocation();
  const pwa = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  const [manualHelp, setManualHelp] = useState(false);

  useEffect(() => {
    function handleReopen() {
      localStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
      setManualHelp(false);
    }

    window.addEventListener("ordynora:show-install-banner", handleReopen);
    return () => window.removeEventListener("ordynora:show-install-banner", handleReopen);
  }, []);

  const relevantPath = APP_PATHS.some((path) => location.pathname.startsWith(path));
  if (!relevantPath || pwa.installed || dismissed || !pwa.available) return null;

  async function install() {
    const result = await pwa.requestInstall();
    if (result.status === "manual" || result.status === "dismissed") {
      setManualHelp(true);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <aside className="em-install-prompt" aria-label="Installa Ordynora">
      <div>
        <b>Ordynora sul telefono</b>
        <span>
          {manualHelp
            ? pwa.manualCopy
            : pwa.canPrompt
              ? "Aprilo come un'app, senza cercarlo ogni volta. Se chiudi questa notifica, il bottone Installa app resta sempre nella sidebar."
              : pwa.manualCopy}
        </span>
      </div>
      <button type="button" onClick={install}>{pwa.canPrompt ? "Installa app" : "Come installare"}</button>
      <button type="button" className="em-install-dismiss" onClick={dismiss} aria-label="Chiudi">×</button>
    </aside>
  );
}
