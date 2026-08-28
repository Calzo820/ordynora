import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { LocaleProvider } from "./context/LocaleContext.jsx";
import { initPwaInstall } from "./hooks/usePwaInstall";

import "./index.css";
import "./styles/easymenu-v2.css";
import "./styles/easymenu-os.css";
import "./styles/easymenu-ux-pro.css";
import "./styles/operational-ux.css";
import "./styles/foundation.css";
import "./styles/premium-final.css";
import "./styles/responsive-hardening.css";
import "./styles/surprise-polish.css";
import "./styles/scale-polish.css";

initPwaInstall();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      const announceUpdate = () => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;
        window.dispatchEvent(new CustomEvent("ordynora:update-available", {
          detail: { registration },
        }));
      };

      announceUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") announceUpdate();
        });
      });

      const checkForUpdates = () => registration.update().catch(() => {});
      window.addEventListener("focus", checkForUpdates);
      window.setInterval(checkForUpdates, 60 * 60 * 1000);
    }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
