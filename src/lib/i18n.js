import { publicApiFetch } from "./api";

export const VERIFIED_LANGUAGES = [
  { code: "it", name: "Italiano", verified: true },
  { code: "en", name: "English", verified: true },
  { code: "de", name: "Deutsch", verified: true },
  { code: "es", name: "Español", verified: true },
  { code: "ru", name: "Русский", verified: true },
];

const bundlePromises = new Map();
const languagePromises = new Map();
const CACHE_VERSION = "v2";

function baseLanguage(locale) {
  return String(locale || "it").split("-")[0].toLowerCase();
}

function sourceFingerprint(source) {
  const serialized = JSON.stringify(source);
  let hash = 5381;
  for (let index = 0; index < serialized.length; index += 1) hash = ((hash << 5) + hash) ^ serialized.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

function flattenStrings(value, path = [], entries = []) {
  if (typeof value === "string") {
    entries.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flattenStrings(item, [...path, index], entries));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => flattenStrings(item, [...path, key], entries));
  }
  return entries;
}

function setAtPath(target, path, value) {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) cursor = cursor[path[index]];
  cursor[path[path.length - 1]] = value;
}

function readCachedBundle(cacheKey) {
  try {
    const cached = JSON.parse(window.localStorage.getItem(cacheKey) || "null");
    if (cached?.expiresAt > Date.now() && cached?.content) return cached.content;
  } catch {
    // Cache non disponibile o non valido: la traduzione viene richiesta di nuovo.
  }
  return null;
}

function writeCachedBundle(cacheKey, content) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ content, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }));
  } catch {
    // La pagina continua a funzionare anche se lo storage del browser è pieno o disabilitato.
  }
}

export function getManualTranslation(translations, locale) {
  return translations[locale] || translations[baseLanguage(locale)] || null;
}

export async function getTranslatedBundle(namespace, locale, sourceContent) {
  const normalizedLocale = String(locale || "it");
  if (baseLanguage(normalizedLocale) === "it") return sourceContent;

  const cacheKey = `easymenu_i18n_${CACHE_VERSION}_${namespace}_${normalizedLocale}_${sourceFingerprint(sourceContent)}`;
  const cached = readCachedBundle(cacheKey);
  if (cached) return cached;
  if (bundlePromises.has(cacheKey)) return bundlePromises.get(cacheKey);

  const request = (async () => {
    const entries = flattenStrings(sourceContent);
    const translatedValues = [];

    for (let index = 0; index < entries.length; index += 100) {
      const chunk = entries.slice(index, index + 100);
      const response = await publicApiFetch("/i18n/translate", {
        method: "POST",
        body: JSON.stringify({ source: "it", target: normalizedLocale, values: chunk.map((entry) => entry.value) }),
        retries: 1,
        timeoutMs: 20000,
      });
      translatedValues.push(...response.translations);
    }

    const translatedContent = JSON.parse(JSON.stringify(sourceContent));
    entries.forEach((entry, index) => setAtPath(translatedContent, entry.path, translatedValues[index]));
    writeCachedBundle(cacheKey, translatedContent);
    return translatedContent;
  })();

  bundlePromises.set(cacheKey, request);
  try {
    return await request;
  } finally {
    bundlePromises.delete(cacheKey);
  }
}

export async function getAvailableLanguages(displayLocale = "it") {
  const cacheKey = baseLanguage(displayLocale);
  if (languagePromises.has(cacheKey)) return languagePromises.get(cacheKey);

  const request = publicApiFetch(`/i18n/languages?display=${encodeURIComponent(displayLocale)}`, {
    method: "GET",
    retries: 1,
    timeoutMs: 12000,
  })
    .then((response) => ({ configured: Boolean(response.configured), languages: response.languages?.length ? response.languages : VERIFIED_LANGUAGES }))
    .catch(() => ({ configured: false, languages: VERIFIED_LANGUAGES }));

  languagePromises.set(cacheKey, request);
  return request;
}
