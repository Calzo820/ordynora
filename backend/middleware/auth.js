// Compatibilità per vecchi import: l'autorizzazione usa sempre il JWT verificato
// dal middleware canonico e non accetta mai il ruolo dichiarato negli header.
export {
  denyImpersonatedPrivateData,
  requireAuth,
  requireRole,
} from "./auth.middleware.js";
