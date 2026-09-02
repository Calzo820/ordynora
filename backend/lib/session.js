import crypto from "node:crypto";

const DEFAULT_SESSION_DAYS = 14;
const MAX_SESSION_DAYS = 365;

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function createRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export function getSessionDays(value, fallback = DEFAULT_SESSION_DAYS) {
  const parsed = Number(value);
  const fallbackDays = Number(fallback);
  const days = Number.isFinite(parsed) && parsed > 0
    ? parsed
    : Number.isFinite(fallbackDays) && fallbackDays > 0
      ? fallbackDays
      : DEFAULT_SESSION_DAYS;
  return Math.min(MAX_SESSION_DAYS, Math.max(1, Math.round(days)));
}

export function getSessionExpiry(days = getSessionDays(process.env.SESSION_DAYS)) {
  return new Date(Date.now() + getSessionDays(days) * 24 * 60 * 60 * 1000);
}

export function getRefreshCookieOptions({ days = getSessionDays(process.env.SESSION_DAYS), persistent = true } = {}) {
  const production = process.env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/auth",
  };
  if (persistent) options.maxAge = getSessionDays(days) * 24 * 60 * 60 * 1000;
  return options;
}

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const cookies = Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return [part, ""];
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
  return cookies[name] || "";
}
