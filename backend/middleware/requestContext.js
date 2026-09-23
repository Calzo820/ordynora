import crypto from "node:crypto";
import { logError } from "../lib/logger.js";
import { logInfo } from "../lib/structuredLogger.js";

export function requestContext(req, res, next) {
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  const startedAt = Date.now();
  res.on("finish", () => {
    const metadata = {
      requestId: req.requestId,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    };
    logInfo("http", `${req.method} ${req.path}`, metadata);
    if (res.statusCode >= 500 && process.env.NODE_ENV !== "test") {
      void logError({
        restaurantId: req.user?.restaurantId || null,
        source: `${req.method} ${req.path}`,
        message: `Risposta HTTP ${res.statusCode}`,
        metadata,
      });
    }
  });
  next();
}
