import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiGet, clearAuthSession, getAuthToken } from "../lib/api";
import ServiceUnavailable from "../pages/ServiceUnavailable.jsx";
import { canAccessRole, getHomePathByRole, normalizeRole } from "../lib/roles";

function ProtectedRoute({ children, roles = [] }) {
  const token = getAuthToken();
  const [state, setState] = useState({ loading: true, allowed: false, user: null, serviceError: "" });

  const normalizedRoles = useMemo(() => roles.map(normalizeRole), [roles]);

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!token) {
        if (active) setState({ loading: false, allowed: false, user: null, serviceError: "" });
        return;
      }

      try {
        const data = await apiGet("/auth/me");
        const user = data?.user || null;

        if (!user) throw new Error("Sessione non valida");

        localStorage.setItem("auth_user", JSON.stringify(user));
        if (data?.restaurant) {
          localStorage.setItem("auth_restaurant", JSON.stringify(data.restaurant));
          localStorage.setItem("ristorante_attivo", data.restaurant.name || "");
          localStorage.setItem("restaurant_slug", data.restaurant.slug || "");
          localStorage.setItem("restaurant_id", data.restaurant.id || "");
        }

        const allowed = canAccessRole(normalizedRoles, user);
        if (active) setState({ loading: false, allowed, user, serviceError: "" });
      } catch (error) {
        const message = error?.message || "";
        const temporaryFailure =
          /server.*(?:avvio|temporaneamente)|si sta avviando|non raggiungibile|connessione lenta|riprova tra qualche secondo/i.test(message);
        if (temporaryFailure) {
          if (active) setState({ loading: false, allowed: false, user: null, serviceError: message });
          return;
        }
        clearAuthSession();
        if (active) setState({ loading: false, allowed: false, user: null, serviceError: "" });
      }
    }

    verify();
    return () => {
      active = false;
    };
  }, [token, normalizedRoles]);

  if (!token) return <Navigate to="/login" replace />;

  if (state.serviceError) return <ServiceUnavailable message={state.serviceError} />;

  if (state.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#eff6ff" }}>
        <div style={{ fontWeight: 800, color: "#1e3a8a" }}>Verifica sessione in corso...</div>
      </div>
    );
  }

  if (!state.allowed) return <Navigate to={getHomePathByRole(state.user?.role, state.user)} replace />;

  return children;
}

export default ProtectedRoute;
