const TEMPORARY_FAILURE_PATTERN = /server.*(?:avvio|temporaneamente)|si sta avviando|non raggiungibile|connessione lenta|failed to fetch|network|riprova tra qualche secondo/i;

export function isTemporaryServiceFailure(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "");

  return Boolean(error?.transient)
    || status === 408
    || status === 425
    || status === 429
    || status >= 500
    || TEMPORARY_FAILURE_PATTERN.test(message);
}

export function getConnectionFailureMessage({ online = true, timedOut = false } = {}) {
  if (!online) {
    return "Questo dispositivo è offline. Controlla il Wi-Fi o la rete dati: la sessione resta salvata.";
  }
  if (timedOut) {
    return "Ordynora sta impiegando più del previsto a rispondere. La sessione resta salvata e il controllo ripartirà automaticamente.";
  }
  return "Ordynora non è momentaneamente raggiungibile. La sessione resta salvata e il controllo ripartirà automaticamente.";
}

export function isServiceReady(payload) {
  return Boolean(payload?.ok) && (!payload.database || payload.database === "connected");
}

export function getRecoveryDelayMs(attempt) {
  const normalized = Math.max(1, Number(attempt) || 1);
  return Math.min(10000, 2000 * 1.5 ** (normalized - 1));
}

export function recoveryLabel(phase, seconds = 0) {
  if (phase === "offline") return "Connessione assente: attendo che il dispositivo torni online.";
  if (phase === "ready") return "Server e database sono di nuovo disponibili. Riapro Ordynora...";
  if (phase === "waiting") return `Nuovo controllo automatico tra ${Math.max(1, Number(seconds) || 1)} secondi.`;
  if (phase === "paused") return "Il servizio non ha ancora risposto. Puoi avviare un nuovo controllo senza perdere la sessione.";
  return "Controllo server e database in corso...";
}
