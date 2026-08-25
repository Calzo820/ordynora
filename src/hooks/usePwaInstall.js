import { useCallback, useEffect, useMemo, useState } from "react";

const listeners = new Set();
let deferredPrompt = null;
let initialized = false;
let installed = false;
let lastOutcome = "";

function isBrowser() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function isStandaloneMode() {
  if (!isBrowser()) return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function isIosDevice() {
  if (!isBrowser()) return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
}

function isAndroidDevice() {
  if (!isBrowser()) return false;
  return /android/i.test(window.navigator.userAgent || "");
}

function isChromiumBrowser() {
  if (!isBrowser()) return false;
  return /chrome|crios|edg|opr/i.test(window.navigator.userAgent || "");
}

function emit() {
  const snapshot = getPwaInstallState();
  listeners.forEach((listener) => listener(snapshot));
}

export function initPwaInstall() {
  if (!isBrowser() || initialized) return;
  initialized = true;
  installed = isStandaloneMode();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    lastOutcome = "";
    installed = isStandaloneMode();
    emit();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    lastOutcome = "accepted";
    emit();
  });

  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", () => {
    installed = isStandaloneMode();
    emit();
  });
}

export function getPwaInstallState() {
  const standalone = isStandaloneMode();
  return {
    installed: installed || standalone,
    canPrompt: Boolean(deferredPrompt) && !standalone,
    ios: isIosDevice(),
    android: isAndroidDevice(),
    chromium: isChromiumBrowser(),
    manualHelpAvailable: !standalone,
    lastOutcome,
  };
}

export function subscribePwaInstall(listener) {
  initPwaInstall();
  listeners.add(listener);
  listener(getPwaInstallState());
  return () => listeners.delete(listener);
}

export async function requestPwaInstall() {
  initPwaInstall();

  if (isStandaloneMode()) {
    installed = true;
    emit();
    return { status: "installed" };
  }

  if (!deferredPrompt) {
    emit();
    return { status: "manual" };
  }

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  lastOutcome = choice?.outcome || "dismissed";
  installed = lastOutcome === "accepted" || isStandaloneMode();
  emit();
  return { status: lastOutcome, installed };
}

export function getManualInstallCopy() {
  if (isIosDevice()) {
    return "Su iPhone/iPad: apri Ordynora in Safari, tocca Condividi e scegli Aggiungi alla schermata Home.";
  }
  if (isAndroidDevice()) {
    return "Su Android: apri il menu del browser e scegli Installa app o Aggiungi alla schermata Home. Se non appare, ricarica la pagina e riprova.";
  }
  if (isChromiumBrowser()) {
    return "Su PC: clicca l'icona installa nella barra indirizzi oppure apri il menu del browser e scegli Installa Ordynora.";
  }
  return "Apri il menu del browser e scegli Installa app o Aggiungi alla schermata Home. La notifica può essere chiusa: il bottone nella sidebar resta sempre disponibile.";
}

export default function usePwaInstall() {
  const [state, setState] = useState(getPwaInstallState);

  useEffect(() => subscribePwaInstall(setState), []);

  const requestInstall = useCallback(async () => requestPwaInstall(), []);
  const manualCopy = useMemo(() => getManualInstallCopy(), [state.ios, state.android, state.chromium]);

  return {
    ...state,
    available: !state.installed,
    requestInstall,
    manualCopy,
  };
}
