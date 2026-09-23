import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import authRoutes from "./routes/auth.routes.js";
import restaurantRoutes from "./routes/restaurant.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import tableRoutes from "./routes/table.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import orderRoutes from "./routes/order.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import onboardingRoutes from "./routes/onboarding.routes.js";
import userRoutes from "./routes/user.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import logRoutes from "./routes/log.routes.js";
import demoRoutes from "./routes/demo.routes.js";
import systemRoutes from "./routes/system.routes.js";
import translationRoutes from "./routes/translation.routes.js";
import cashRoutes from "./routes/cash.routes.js";
import printRoutes from "./routes/print.routes.js";
import { handleStripeWebhook } from "./controllers/payment.controller.js";
import prisma from "./lib/prisma.js";
import { validateEnvironment } from "./lib/env.js";
import { logError } from "./lib/logger.js";
import { createRateLimiter, publicOrderRateLimitKey } from "./lib/rateLimit.js";
import { validateJsonBody } from "./middleware/validateJson.js";
import { requestContext } from "./middleware/requestContext.js";
import { startBackupScheduler, stopBackupScheduler } from "./services/backup.service.js";
import { startHealthMonitor, stopHealthMonitor } from "./services/healthMonitor.service.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envStatus = validateEnvironment();
const isProduction = process.env.NODE_ENV === "production";

function devLog(...args) {
  if (!isProduction) console.log(...args);
}

const app = express();
const server = http.createServer(app);

if (isProduction) app.set("trust proxy", 1);

const API_PREFIXES = [
  "/auth",
  "/restaurants",
  "/menu",
  "/tables",
  "/reservations",
  "/orders",
  "/payments",
  "/cash",
  "/print-jobs",
  "/subscriptions",
  "/analytics",
  "/onboarding",
  "/users",
  "/logs",
  "/demo",
  "/system",
  "/i18n",
  "/api",
];

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return String(value || "").replace(/\/$/, "");
  }
}

const allowedOrigins = String(
  process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4173"
)
  .split(",")
  .map((value) => normalizeOrigin(value.trim()))
  .filter(Boolean);

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.includes(normalizeOrigin(origin));
}

const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error("Origin non consentita"));
    },
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  devLog(`Socket connesso: ${socket.id}`);

  const token = socket.handshake.auth?.token;
  let authenticated = false;
  let tokenExpiryTimer = null;
  if (token) {
    try {
      const decoded = jwt.verify(String(token), process.env.JWT_SECRET);
      if (decoded?.restaurantId) {
        socket.join(`restaurant:${decoded.restaurantId}`);
        if (decoded.role) socket.join(`restaurant:${decoded.restaurantId}:role:${decoded.role}`);
        socket.data.restaurantId = decoded.restaurantId;
        socket.data.role = decoded.role;
        authenticated = true;
        if (decoded.exp) {
          const remainingMs = Math.max(0, decoded.exp * 1000 - Date.now());
          tokenExpiryTimer = setTimeout(() => {
            socket.emit("auth-required", { message: "Sessione live scaduta: riconnessione in corso" });
            socket.disconnect(true);
          }, remainingMs);
          tokenExpiryTimer.unref?.();
        }
      }
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated) {
    socket.emit("auth-required", { message: "Canale riservato agli utenti autenticati" });
    setTimeout(() => socket.disconnect(true), 500).unref?.();
    return;
  }

  const sendHeartbeat = () => socket.emit("server-health", {
    ok: true,
    message: "Aggiornamento live attivo",
    timestamp: new Date().toISOString(),
  });
  sendHeartbeat();
  const heartbeat = setInterval(sendHeartbeat, 25000);
  heartbeat.unref?.();

  socket.on("client-heartbeat", (acknowledge) => {
    if (typeof acknowledge === "function") {
      acknowledge({ ok: true, timestamp: new Date().toISOString() });
    }
  });

  socket.on("disconnect", () => {
    clearInterval(heartbeat);
    if (tokenExpiryTimer) clearTimeout(tokenExpiryTimer);
    devLog(`Socket disconnesso: ${socket.id}`);
  });
});

app.disable("x-powered-by");

app.use(requestContext);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:"
  );
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (API_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error("Origin non consentita"));
    },
    credentials: true,
  })
);

app.post("/payments/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json({ limit: "5mb" }));
app.use(validateJsonBody);

app.use((req, _res, next) => {
  devLog(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use("/auth/login", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20, keyPrefix: "auth-login" }));
app.use("/auth/pin-login", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 30, keyPrefix: "auth-pin" }));
app.use("/auth/register", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10, keyPrefix: "auth-register" }));
app.use("/auth/forgot-password", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: "auth-forgot" }));
app.use("/auth/reset-password", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10, keyPrefix: "auth-reset" }));
app.use("/auth/resend-verification", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: "auth-resend" }));
app.use("/demo/ensure", createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: "demo-ensure" }));
app.post("/orders/public", createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 300,
  keyPrefix: "public-order-create-ip",
  keyBuilder: (req) => String(req.ip || "no-ip"),
}));
app.post("/orders/public", createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 30,
  keyPrefix: "public-order-create-table",
  keyBuilder: publicOrderRateLimitKey,
}));
app.get("/orders/public/:token", createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 180, keyPrefix: "public-order-status" }));
app.post("/orders/public/:token/request-bill", createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 8, keyPrefix: "public-order-bill" }));
app.post("/orders/public/:token/call-staff", createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 8, keyPrefix: "public-order-staff" }));
app.get("/payments/public/:token/summary", createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 180, keyPrefix: "public-payment-summary" }));
app.get("/payments/public/:token/receipt", createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 30, keyPrefix: "public-payment-receipt" }));
app.post("/payments/public/:token/checkout", createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 8, keyPrefix: "public-payment-checkout" }));
app.use("/i18n", createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 30, keyPrefix: "translations" }));

app.get("/", (_req, res) => {
  res.json({
    message: "Backend Ordynora attivo",
    environment: envStatus.nodeEnv,
    paymentsEnabled: envStatus.paymentsEnabled,
    webhookEnabled: envStatus.webhookEnabled,
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ordynora-backend", timestamp: new Date().toISOString() });
});

app.get("/ready", async (_req, res) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.reservation.findFirst({ select: { id: true } }),
    ]);
    res.json({ ok: true, database: "connected", reservations: "ready", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: "unavailable",
      reservations: error?.code === "P2021" ? "migration_required" : "unavailable",
    });
  }
});

app.use("/auth", authRoutes);
app.use("/restaurants", restaurantRoutes);
app.use("/menu", menuRoutes);
app.use("/tables", tableRoutes);
app.use("/reservations", reservationRoutes);
app.use("/orders", orderRoutes);
app.use("/payments", paymentRoutes);
app.use("/cash", cashRoutes);
app.use("/print-jobs", printRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/onboarding", onboardingRoutes);
app.use("/users", userRoutes);
app.use("/logs", logRoutes);
app.use("/demo", demoRoutes);
app.use("/system", systemRoutes);
app.use("/i18n", translationRoutes);

app.use(API_PREFIXES, (req, res, next) => {
  const acceptsHtml = req.method === "GET" && String(req.headers.accept || "").includes("text/html");
  if (acceptsHtml) return next();
  res.status(404).json({ message: "Rotta API non trovata", requestId: req.requestId });
});

if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(__dirname, "../dist");
  app.get(["/sw.js", "/app.webmanifest"], (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(staticDir, req.path.slice(1)));
  });
  app.use(express.static(staticDir, { index: false, maxAge: "1d" }));
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.use((req, res) => {
  res.status(404).json({ message: "Rotta non trovata" });
});

app.use(async (error, req, res, _next) => {
  console.error("Unhandled error:", error);

  await logError({
    restaurantId: req.user?.restaurantId || null,
    source: `${req.method} ${req.path}`,
    message: error?.message || "Unhandled backend error",
    error,
    metadata: { requestId: res.getHeader("X-Request-Id") },
  });

  if (error?.message === "Origin non consentita") {
    return res.status(403).json({ message: "Origin non consentita" });
  }

  return res.status(500).json({ message: "Errore interno del server" });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`Server attivo su http://localhost:${PORT}`);
    startHealthMonitor();
    startBackupScheduler();
  });

  const shutdown = () => {
    stopHealthMonitor();
    stopBackupScheduler();
    server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export { app, server, io };
