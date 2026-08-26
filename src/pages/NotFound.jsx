import { Link } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import { getHomePathByRole } from "../lib/roles";

function getPrimaryTarget() {
  try {
    const user = JSON.parse(localStorage.getItem("auth_user") || "null");
    return getHomePathByRole(user?.role, user);
  } catch {
    // La destinazione predefinita resta la dashboard.
  }
  return "/dashboard";
}

export default function NotFound() {
  const loggedIn = Boolean(localStorage.getItem("auth_token"));
  const primaryTarget = loggedIn ? getPrimaryTarget() : "/";

  return (
    <div className="em-not-found-page">
      <Navbar />
      <main className="em-not-found">
        <span>Errore 404</span>
        <h1>Questa pagina non esiste</h1>
        <p>Il collegamento potrebbe essere cambiato oppure non essere più disponibile.</p>
        <div>
          <Link className="is-primary" to={primaryTarget}>
            {loggedIn ? "Torna alla dashboard" : "Torna alla home"}
          </Link>
          <Link to={loggedIn ? "/contattaci" : "/demo"}>
            {loggedIn ? "Contatta l'assistenza" : "Apri la demo"}
          </Link>
        </div>
      </main>
    </div>
  );
}
