import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiGet, clearAuthSession, getAuthToken } from "../lib/api";
import ServiceUnavailable from "../pages/ServiceUnavailable.jsx";
import { canAccessRole, getHomePathByRole, normalizeRole } from "../lib/roles";
import { persistLoginPayload, refreshSession } from "../lib/session";
import { getRememberedRestaurantCode, isPinStaffUser } from "../lib/staffDevice";

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("auth_user") || "null");
  } catch {
    return null;
  }
}

function ProtectedRoute({ children, roles = [] }) {
  const [state, setState] = useState({
    loading: true,
    allowed: false,
    user: null,
    serviceError: "",
    loginPath: "/login",
  });

  const normalizedRoles = useMemo(() => roles.map(normalizeRole), [roles]);

  useEffect(() => {
    let active = true;

    async function verify() {
      const cachedUser = getStoredUser();
      const loginPath = isPinStaffUser(cachedUser) || getRememberedRestaurantCode()
        ? "/staff"
        : "/login";

      try {
        const data = getAuthToken() ? await apiGet("/auth/me") : await refreshSession();
        const user = data?.user || null;

        if (!user) throw new Error("Sessione non valida");

        persistLoginPayload(data);

        const allowed = canAccessRole(normalizedRoles, user);
        if (active) setState({ loading: false, allowed, user, serviceError: "", loginPath });
      } catch (error) {
        const message = error?.message || "";
        const temporaryFailure =
          /server.*(?:avvio|temporaneamente)|si sta avviando|non raggiungibile|connessione lenta|riprova tra qualche secondo/i.test(message);
        if (temporaryFailure) {
          if (active) setState({ loading: false, allowed: false, user: null, serviceError: message, loginPath });
          return;
        }
        clearAuthSession();
        if (active) setState({ loading: false, allowed: false, user: null, serviceError: "", loginPath });
      }
    }

    verify();
    return () => {
      active = false;
    };
  }, [normalizedRoles]);

  if (state.serviceError) return <ServiceUnavailable message={state.serviceError} />;

  if (state.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#eff6ff" }}>
        <div style={{ fontWeight: 800, color: "#1e3a8a" }}>Verifica sessione in corso...</div>
      </div>
    );
  }

  if (!state.allowed) {
    const destination = state.user
      ? getHomePathByRole(state.user.role, state.user)
      : state.loginPath;
    return <Navigate to={destination} replace />;
  }

  return children;
}

export default ProtectedRoute;
