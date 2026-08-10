import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { LocaleProvider } from "./context/LocaleContext.jsx";

import "./index.css";
import "./styles/easymenu-v2.css";
import "./styles/easymenu-os.css";
import "./styles/easymenu-ux-pro.css";
import "./styles/operational-ux.css";
import "./styles/foundation.css";
import "./styles/premium-final.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>
);
