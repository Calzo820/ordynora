/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const PwaInstallContext = createContext(null);

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallProvider({ children }) {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const handlePrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      sessionStorage.removeItem("ordynora_install_dismissed");
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const requestInstall = useCallback(async () => {
    if (installed) return { outcome: "installed", message: "Ordynora è già installata su questo dispositivo." };
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallEvent(null);
      return choice;
    }
    if (isIos()) return { outcome: "manual", message: "Su iPhone o iPad: tocca Condividi e poi Aggiungi alla schermata Home." };
    return { outcome: "manual", message: "Apri il menu del browser e scegli Installa app o Aggiungi alla schermata Home." };
  }, [installEvent, installed]);

  const value = useMemo(() => ({ canPrompt: Boolean(installEvent), installed, ios: isIos(), requestInstall }), [installEvent, installed, requestInstall]);
  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error("usePwaInstall deve essere usato dentro PwaInstallProvider");
  return value;
}
