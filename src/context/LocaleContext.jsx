/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "ordynora_locale";
const LEGACY_STORAGE_KEY = "easymenu_locale";
const SUPPORTED_BASE_LOCALES = new Set(["it", "en", "de", "es", "ru"]);
const RTL_LANGUAGES = new Set(["ar", "dv", "fa", "he", "ku", "ps", "sd", "ug", "ur", "yi"]);

const LocaleContext = createContext(null);

function getInitialLocale() {
  if (typeof window === "undefined") return "it";

  let savedLocale = "";
  try {
    savedLocale = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY) || "";
  } catch {
    // Alcuni browser bloccano lo storage: la lingua del browser resta un fallback valido.
  }

  const candidate = savedLocale || window.navigator?.language || "it";
  try {
    const canonical = Intl.getCanonicalLocales(String(candidate).replaceAll("_", "-"))[0] || "it";
    const base = canonical.split("-")[0].toLowerCase();
    return SUPPORTED_BASE_LOCALES.has(base) ? base : "it";
  } catch {
    return "it";
  }
}

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(getInitialLocale);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Il cambio lingua continua a funzionare anche senza persistenza locale.
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LANGUAGES.has(locale.split("-")[0].toLowerCase()) ? "rtl" : "ltr";
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale deve essere usato dentro LocaleProvider");
  return context;
}
