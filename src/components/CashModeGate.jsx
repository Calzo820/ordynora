import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiGet } from "../lib/api";
import {
  getStoredRestaurantMode,
  isIntegratedMode,
  persistRestaurantMode,
} from "../lib/restaurantMode";

export default function CashModeGate({ children }) {
  const [mode, setMode] = useState(() => getStoredRestaurantMode());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    apiGet("/restaurants/me")
      .then((restaurant) => {
        if (!active) return;
        const currentMode = restaurant?.operationMode || "full";
        persistRestaurantMode(currentMode);
        setMode(currentMode);
      })
      .catch(() => {
        // The backend still enforces the mode. Keep the cached mode only as a safe UI fallback.
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, []);

  if (checking) {
    return <div className="em-page-fallback" role="status">Verifica modalità del ristorante...</div>;
  }
  if (isIntegratedMode(mode)) {
    return <Navigate to="/tavoli?mode=integrated" replace />;
  }
  return children;
}
