import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import usePwaInstall from "../hooks/usePwaInstall";
import { ORDYNORA_LOGO_URL as logoOrdynora } from "../lib/brand";
import { getRoleLabel, isAdminRole, isSuperAdminUser, normalizeRole } from "../lib/roles";
import { logoutSession } from "../lib/session";
import { isPinStaffUser } from "../lib/staffDevice";

function getRistoranteAttivo() {
  return localStorage.getItem("ristorante_attivo") || "";
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("auth_user") || "null");
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return !!localStorage.getItem("auth_token");
}

function hasPlatformSession() {
  return !!localStorage.getItem("superadmin_platform_session");
}

function restorePlatformSession() {
  try {
    const snapshot = JSON.parse(localStorage.getItem("superadmin_platform_session") || "null");
    if (!snapshot?.token) return;
    localStorage.setItem("auth_token", snapshot.token);
    if (snapshot.user) localStorage.setItem("auth_user", snapshot.user);
    else localStorage.removeItem("auth_user");
    if (snapshot.restaurant) localStorage.setItem("auth_restaurant", snapshot.restaurant);
    else localStorage.removeItem("auth_restaurant");
    localStorage.removeItem("ristorante_attivo");
    localStorage.removeItem("restaurant_slug");
    localStorage.removeItem("restaurant_id");
    localStorage.removeItem("superadmin_platform_session");
    window.location.href = "/super-admin";
  } catch {
    localStorage.removeItem("superadmin_platform_session");
  }
}

async function logout(destination = "/login") {
  await logoutSession();
  localStorage.removeItem("superadmin_platform_session");
  window.location.href = destination;
}

function initials(user) {
  const source = user?.name || user?.email || "EM";
  return source.slice(0, 2).toUpperCase();
}

function getAdminTabFromSearch(search) {
  const tab = new URLSearchParams(search || "").get("tab") || "menu";
  return ["menu", "tables", "staff", "settings"].includes(tab) ? tab : "menu";
}

export default function Navbar() {
  const location = useLocation();
  const user = getUser();
  const role = normalizeRole(user?.role);
  const staffDevice = isPinStaffUser(user);
  const logged = isLoggedIn();
  const isSuperAdmin = isSuperAdminUser(user) || location.pathname.startsWith("/super-admin");
  const impersonating = hasPlatformSession() && !isSuperAdmin;
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installMessage, setInstallMessage] = useState("");
  const pwa = usePwaInstall();

  const restaurantName = isSuperAdmin
    ? "Piattaforma SaaS"
    : hasPlatformSession()
      ? `${getRistoranteAttivo() || "Ristorante"} - superadmin`
      : getRistoranteAttivo() || "Nessun ristorante";

  const isAdmin = !isSuperAdmin && isAdminRole(role);
  const isWaiter = role === "waiter";
  const canKitchen = isAdmin || role === "kitchen";
  const canBar = isAdmin || role === "bar";
  const canCashier = isAdmin || role === "cashier";
  const canTables = isAdmin || role === "cashier" || isWaiter;

  useEffect(() => {
    if (!logged) return undefined;
    document.body.classList.add("em-sidebar-ready");
    document.body.classList.toggle("em-sidebar-open", open);
    document.body.classList.toggle("em-sidebar-closed", !open);
    return () => {
      document.body.classList.remove("em-sidebar-ready", "em-sidebar-open", "em-sidebar-closed");
    };
  }, [logged, open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const links = !logged
    ? []
    : isSuperAdmin
      ? [{ to: "/super-admin", label: "SuperAdmin", match: ["/super-admin"] }]
      : [
          isAdmin && { to: "/dashboard", label: "Dashboard", match: ["/dashboard"] },
          canKitchen && !impersonating && { to: "/cucina", label: isAdmin ? "Servizio" : "Cucina", match: ["/cucina"] },
          canBar && { to: "/bar", label: "Bar", match: ["/bar"] },
          canCashier && !impersonating && { to: "/cassa", label: "Cassa", match: ["/cassa"] },
          canTables && { to: "/tavoli", label: isWaiter ? "Sala" : "Tavoli", match: ["/tavoli"] },
          isAdmin && { to: "/admin?tab=menu", label: "Menu", match: ["/admin"], adminTab: "menu" },
          isAdmin && !impersonating && { to: "/statistiche", label: "Statistiche", match: ["/statistiche"] },
          isAdmin && !impersonating && { to: "/storico", label: "Storico", match: ["/storico"] },
        ].filter(Boolean);

  const settingsLinks = !logged || !isAdmin || isSuperAdmin
    ? []
    : [
        { to: "/onboarding", label: "Setup guidato", match: ["/onboarding", "/setup"] },
        { to: "/admin?tab=settings", label: "Profilo e app", match: ["/admin"], adminTab: "settings" },
        { to: "/admin?tab=staff", label: "Staff e ruoli", match: ["/admin"], adminTab: "staff" },
        { to: "/qr", label: "QR tavoli", match: ["/qr"] },
        { to: "/billing", label: "Abbonamento", match: ["/billing"] },
        { to: "/privacy", label: "Privacy", match: ["/privacy", "/termini", "/cookie"] },
        { to: "/contattaci", label: "Contattaci", match: ["/contattaci"] },
      ];

  const settingsActive = settingsLinks.some((link) => isActive(link));

  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  if (!logged) return null;

  function isActive(link) {
    if (link.href) return false;
    if (link.adminTab && location.pathname.startsWith("/admin")) {
      return getAdminTabFromSearch(location.search) === link.adminTab;
    }
    if (link.label === "Menu" && location.pathname.startsWith("/admin")) {
      return getAdminTabFromSearch(location.search) === "menu";
    }
    return (link.match || [link.to]).some((path) => location.pathname.startsWith(path));
  }

  function handleNavigate() {
    setOpen(false);
  }

  async function handleInstallClick() {
    const result = await pwa.requestInstall();
    if (result.status === "installed" || result.status === "accepted") {
      setInstallMessage("App installata correttamente.");
      return;
    }
    setInstallMessage(pwa.manualCopy);
    window.dispatchEvent(new CustomEvent("ordynora:show-install-banner"));
  }

  return (
    <>
      <style>{`
        body.em-sidebar-ready,
        body.em-sidebar-open,
        body.em-sidebar-closed { padding-left: 0 !important; }
        .em-menu-toggle {
          position: fixed;
          top: 14px;
          left: 14px;
          z-index: 1202;
          width: auto;
          min-width: 46px;
          height: 46px;
          border-radius: 15px;
          border: 1px solid rgba(15,23,42,0.13);
          background: rgba(255,255,255,0.96);
          color: #0f172a;
          box-shadow: 0 16px 34px rgba(15,23,42,0.18);
          display: inline-grid;
          grid-auto-flow: column;
          gap: 9px;
          place-items: center;
          padding: 0 14px;
          cursor: pointer;
        }
        .em-menu-toggle__label { font-size: 13px; font-weight: 950; letter-spacing: -0.01em; }
        .em-menu-glyph,
        .em-menu-glyph::before,
        .em-menu-glyph::after {
          display: block;
          width: 20px;
          height: 2px;
          border-radius: 999px;
          background: #0f172a;
          transition: transform .16s ease, background .16s ease;
          content: "";
        }
        .em-menu-glyph::before { transform: translateY(-7px); }
        .em-menu-glyph::after { transform: translateY(5px); }
        .em-menu-glyph.is-close { background: transparent; }
        .em-menu-glyph.is-close::before { transform: translateY(2px) rotate(45deg); }
        .em-menu-glyph.is-close::after { transform: translateY(0) rotate(-45deg); }
        .em-sidebar-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1198;
          background: rgba(2,6,23,0.36);
          opacity: 0;
          pointer-events: none;
          transition: opacity .18s ease;
        }
        .em-sidebar-backdrop.is-open { opacity: 1; pointer-events: auto; }
        .em-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: min(268px, 86vw);
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: #07111f;
          color: #f8fafc;
          border-right: 1px solid rgba(255,255,255,0.08);
          box-shadow: 24px 0 50px rgba(2,6,23,0.28);
          transform: translateX(-105%);
          transition: transform .2s ease;
        }
        .em-sidebar.is-open { transform: translateX(0); }
        .em-sidebar__brand { padding: 18px 16px 16px 72px; display: flex; gap: 12px; align-items: center; min-height: 80px; }
        .em-sidebar__logo { width: 42px; height: 42px; border-radius: 14px; background: white; display: grid; place-items: center; padding: 7px; overflow: hidden; flex: 0 0 auto; }
        .em-sidebar__logo img { width: 100%; height: 100%; object-fit: contain; }
        .em-sidebar__name { font-size: 18px; font-weight: 950; letter-spacing: -0.04em; line-height: 1; }
        .em-sidebar__restaurant { margin-top: 6px; color: #9fb0c7; font-size: 12px; font-weight: 750; display: flex; align-items: center; gap: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .em-sidebar__dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,0.12); }
        .em-sidebar__nav { display: grid; gap: 6px; padding: 14px; overflow: auto; }
        .em-sidebar__link { display: flex; align-items: center; gap: 14px; min-height: 46px; padding: 0 14px; border-radius: 16px; color: #cbd5e1; text-decoration: none; font-weight: 900; }
        .em-sidebar__link:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .em-sidebar__link.is-active { background: #fff; color: #07111f; }
        .em-sidebar__settings { display: grid; gap: 6px; }
        .em-sidebar__settings-toggle {
          width: 100%;
          min-height: 46px;
          border: 0;
          border-radius: 16px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 14px;
          background: transparent;
          color: #cbd5e1;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
          text-align: left;
        }
        .em-sidebar__settings-toggle:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .em-sidebar__settings-toggle.is-active { background: rgba(255,255,255,0.12); color: #fff; }
        .em-sidebar__settings-label { flex: 1; }
        .em-sidebar__chevron { font-size: 13px; transition: transform .18s ease; opacity: .72; }
        .em-sidebar__chevron.is-open { transform: rotate(180deg); }
        .em-sidebar__submenu {
          margin-left: 14px;
          padding-left: 13px;
          display: grid;
          gap: 5px;
          border-left: 1px solid rgba(255,255,255,0.10);
        }
        .em-sidebar__sublink {
          min-height: 37px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 11px;
          border-radius: 13px;
          color: #9fb0c7;
          text-decoration: none;
          font-size: 13px;
          font-weight: 850;
        }
        .em-sidebar__sublink:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .em-sidebar__sublink.is-active { background: rgba(255,255,255,0.95); color: #07111f; }
        .em-sidebar__footer { margin-top: auto; padding: 14px; display: grid; gap: 10px; }
        .em-sidebar__user { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 18px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08); }
        .em-sidebar__avatar { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: #1d4ed8; color: white; font-size: 13px; font-weight: 950; flex: 0 0 auto; }
        .em-sidebar__email { max-width: 170px; color: #cbd5e1; font-size: 11px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .em-sidebar__actions { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .em-sidebar__btn { border: 1px solid rgba(255,255,255,0.10); border-radius: 13px; padding: 10px 11px; background: rgba(255,255,255,0.07); color: white; font-weight: 900; cursor: pointer; }
        .em-sidebar__btn--green { background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.25); }
        .em-sidebar__btn--install { background: rgba(59,130,246,0.18); border-color: rgba(96,165,250,0.24); }
        .em-sidebar__install-help { border-radius: 14px; padding: 10px 12px; background: rgba(59,130,246,0.10); border: 1px solid rgba(96,165,250,0.18); color: #bfdbfe; font-size: 12px; line-height: 1.35; font-weight: 750; }
        @media (min-width: 1240px) {
          body.em-sidebar-ready,
          body.em-sidebar-open,
          body.em-sidebar-closed {
            padding-left: 264px !important;
          }
          .em-menu-toggle,
          .em-sidebar-backdrop {
            display: none !important;
          }
          .em-sidebar {
            width: 264px;
            transform: translateX(0) !important;
            box-shadow: 14px 0 42px rgba(2,6,23,0.16);
          }
          .em-sidebar__brand {
            padding-left: 18px;
          }
          .em-sidebar__nav {
            padding-top: 8px;
          }
        }
        @media (max-height: 760px) {
          .em-sidebar__brand { min-height: 68px; padding-top: 12px; padding-bottom: 10px; }
          .em-sidebar__nav { padding-top: 6px; padding-bottom: 6px; }
          .em-sidebar__link,
          .em-sidebar__settings-toggle { min-height: 40px; }
          .em-sidebar__footer { padding-top: 8px; }
        }
        @media print {
          .em-menu-toggle, .em-sidebar, .em-sidebar-backdrop { display: none !important; }
        }
      `}</style>

      <button
        className="em-menu-toggle"
        type="button"
        aria-label={open ? "Chiudi navigazione" : "Apri navigazione"}
        aria-expanded={open}
        aria-controls="ordynora-sidebar"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={open ? "em-menu-glyph is-close" : "em-menu-glyph"} aria-hidden="true" />
        <span className="em-menu-toggle__label">Ordynora</span>
      </button>
      <div className={open ? "em-sidebar-backdrop is-open" : "em-sidebar-backdrop"} onClick={() => setOpen(false)} aria-hidden="true" />

      <aside id="ordynora-sidebar" className={open ? "em-sidebar is-open" : "em-sidebar"} aria-label="Navigazione Ordynora">
        <div className="em-sidebar__brand">
          <div className="em-sidebar__logo"><img src={logoOrdynora} alt="Ordynora" /></div>
          <div style={{ minWidth: 0 }}>
            <div className="em-sidebar__name">Ordynora</div>
            <div className="em-sidebar__restaurant"><span className="em-sidebar__dot" />{restaurantName}</div>
          </div>
        </div>

        <nav className="em-sidebar__nav">
          {links.map((link) => (
            <Link key={link.to} to={link.to} onClick={handleNavigate} aria-current={isActive(link) ? "page" : undefined} className={isActive(link) ? "em-sidebar__link is-active" : "em-sidebar__link"}>
              <span>{link.label}</span>
            </Link>
          ))}

          {settingsLinks.length ? (
            <div className="em-sidebar__settings">
              <button
                type="button"
                className={settingsActive ? "em-sidebar__settings-toggle is-active" : "em-sidebar__settings-toggle"}
                onClick={() => setSettingsOpen((prev) => !prev)}
                aria-expanded={settingsOpen}
              >
                <span className="em-sidebar__settings-label">Impostazioni</span>
                <span className={settingsOpen ? "em-sidebar__chevron is-open" : "em-sidebar__chevron"} aria-hidden="true">v</span>
              </button>

              {settingsOpen ? (
                <div className="em-sidebar__submenu">
                  {settingsLinks.map((link) =>
                    link.href ? (
                      <a key={link.href} href={link.href} target="_blank" rel="noreferrer" onClick={handleNavigate} className="em-sidebar__sublink">
                        <span>{link.label}</span>
                      </a>
                    ) : (
                      <Link key={link.to} to={link.to} onClick={handleNavigate} aria-current={isActive(link) ? "page" : undefined} className={isActive(link) ? "em-sidebar__sublink is-active" : "em-sidebar__sublink"}>
                        <span>{link.label}</span>
                      </Link>
                    )
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>

        <div className="em-sidebar__footer">
          <div className="em-sidebar__user">
            <div className="em-sidebar__avatar">{initials(user)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950 }}>{isSuperAdmin ? "SuperAdmin" : user?.name || "Staff"}</div>
              <div className="em-sidebar__email">{getRoleLabel(role)} · {user?.email || ""}</div>
            </div>
          </div>
          <div className="em-sidebar__actions">
            {!pwa.installed ? <button className="em-sidebar__btn em-sidebar__btn--install" type="button" onClick={handleInstallClick}>{pwa.canPrompt ? "Installa app" : "Guida installazione"}</button> : null}
            {installMessage ? <div className="em-sidebar__install-help">{installMessage}</div> : null}
            {impersonating ? <button className="em-sidebar__btn em-sidebar__btn--green" onClick={restorePlatformSession}>SuperAdmin</button> : null}
            <button className="em-sidebar__btn" onClick={() => logout(staffDevice ? "/staff" : "/login")}>
              {staffDevice ? "Cambia operatore" : "Esci"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
