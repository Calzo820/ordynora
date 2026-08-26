import bcrypt from "bcrypt";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { sendEmailVerification, sendPasswordReset } from "../lib/mailer.js";
import {
  createRefreshToken,
  getRefreshCookieOptions,
  getSessionExpiry,
  hashToken,
  readCookie,
} from "../lib/session.js";

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function createOneTimeToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    hash: crypto.createHash("sha256").update(token).digest("hex"),
  };
}

function getClientUrl() {
  return String(process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function getSuperAdminEmails() {
  return String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdminEmail(email) {
  return getSuperAdminEmails().includes(String(email || "").trim().toLowerCase());
}

const buildSlug = (value) => {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

export const signToken = (user) => {
  const isSuperAdmin = isSuperAdminEmail(user.email);

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      restaurantId: isSuperAdmin ? null : user.restaurantId,
      role: isSuperAdmin ? "superadmin" : user.role,
      isSuperAdmin,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
};

function sanitizeUser(user) {
  const isSuperAdmin = isSuperAdminEmail(user.email);

  return {
    id: user.id,
    name: user.name,
    email: user.isPinOnly ? null : user.email,
    role: isSuperAdmin ? "superadmin" : user.role,
    isActive: user.isActive,
    isSuperAdmin,
    emailVerified: Boolean(user.emailVerifiedAt),
    pinAccess: Boolean(user.pinEnabled),
  };
}

function sanitizeRestaurant(restaurant) {
  if (!restaurant) return null;

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    primaryColor: restaurant.primaryColor,
    logoUrl: restaurant.logoUrl,
    currency: restaurant.currency,
    isActive: restaurant.isActive,
    plan: restaurant.plan,
  };
}

async function issueSession(res, req, user) {
  if (!prisma.userSession?.create) return;

  const refreshToken = createRefreshToken();
  await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      userAgent: req.get("user-agent") || null,
      ipAddress: req.ip || null,
      expiresAt: getSessionExpiry(),
    },
  });

  res.cookie("refresh_token", refreshToken, getRefreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie("refresh_token", { ...getRefreshCookieOptions(), maxAge: 0 });
}

export const registerOwner = async (req, res) => {
  try {
    const restaurantName = String(req.body.restaurantName || "").trim();
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!restaurantName || !name || !email || !password) {
      return res.status(400).json({ message: "Compila tutti i campi obbligatori" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Email non valida" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "La password deve avere almeno 8 caratteri" });
    }

    const slug = buildSlug(restaurantName);
    if (!slug) {
      return res.status(400).json({ message: "Nome ristorante non valido" });
    }

    const [existingUser, existingRestaurant] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.restaurant.findUnique({ where: { slug } }),
    ]);

    if (existingUser) {
      return res.status(409).json({ message: "Email già registrata" });
    }

    if (existingRestaurant) {
      return res.status(409).json({ message: "Esiste già un ristorante con questo nome o slug" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verification = createOneTimeToken();

    const result = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          slug,
          primaryColor: "#1d4ed8",
          currency: "EUR",
          isActive: true,
          plan: "starter",
        },
      });

      const user = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          name,
          email,
          passwordHash,
          emailVerificationTokenHash: verification.hash,
          emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
          role: "owner",
          isActive: true,
        },
      });

      return { restaurant, user };
    });

    const token = signToken(result.user);
    await issueSession(res, req, result.user);
    const verificationMail = await sendEmailVerification({
      to: result.user.email,
      name: result.user.name,
      verificationUrl: `${getClientUrl()}/verifica-email?token=${encodeURIComponent(verification.token)}`,
    }).catch((error) => {
      console.error("registration verification email error:", error.message);
      return { sent: false };
    });

    return res.status(201).json({
      message: verificationMail.sent
        ? "Registrazione completata. Controlla la posta per verificare l'email."
        : "Registrazione completata.",
      token,
      user: sanitizeUser(result.user),
      restaurant: sanitizeRestaurant(result.restaurant),
    });
  } catch (error) {
    console.error("registerOwner error:", error);
    return res.status(500).json({ message: "Errore server durante la registrazione" });
  }
};

export const login = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email e password sono obbligatorie" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Email non valida" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { restaurant: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    const isSuperAdmin = isSuperAdminEmail(user.email);

    if (!isSuperAdmin && (!user.restaurant || user.restaurant.isActive === false)) {
      return res.status(403).json({ message: "Ristorante non attivo" });
    }

    if (!user.passwordHash) {
      console.error("login error: utente senza passwordHash", { email: user.email, id: user.id });
      return res.status(500).json({
        message: "Account non configurato correttamente. Ricrea gli utenti demo.",
      });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = signToken(user);
    await issueSession(res, req, user);

    return res.json({
      message: "Login effettuato",
      token,
      user: sanitizeUser(user),
      restaurant: isSuperAdmin ? null : sanitizeRestaurant(user.restaurant),
    });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({
      message: "Errore server durante il login",
      details: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
};

export const loginWithPin = async (req, res) => {
  try {
    const restaurantCode = buildSlug(req.body?.restaurantCode || req.body?.restaurantSlug);
    const pin = String(req.body?.pin || "").trim();
    if (!restaurantCode || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ message: "Inserisci il codice ristorante e un PIN da 4 a 6 numeri" });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantCode } });
    if (!restaurant || !restaurant.isActive) {
      return res.status(401).json({ message: "Codice ristorante o PIN non validi" });
    }

    const staff = await prisma.user.findMany({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
        pinEnabled: true,
        pinHash: { not: null },
        role: { in: ["admin", "kitchen", "bar", "cashier", "waiter"] },
      },
    });

    let user = null;
    for (const candidate of staff) {
      if (candidate.pinHash && await bcrypt.compare(pin, candidate.pinHash)) {
        user = candidate;
        break;
      }
    }
    if (!user) return res.status(401).json({ message: "Codice ristorante o PIN non validi" });

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          restaurantId: restaurant.id,
          userId: user.id,
          action: "staff.pin_login",
          entityType: "user",
          entityId: user.id,
          metadata: { role: user.role },
          ipAddress: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 80) || null,
        },
      }),
    ]);

    const token = signToken(user);
    await issueSession(res, req, user);
    return res.json({
      message: "Accesso staff effettuato",
      token,
      user: sanitizeUser(user),
      restaurant: sanitizeRestaurant(restaurant),
    });
  } catch (error) {
    console.error("loginWithPin error:", error);
    return res.status(500).json({ message: "Errore server durante l'accesso con PIN" });
  }
};

export const me = async (req, res) => {
  try {
    if (req.user?.impersonating && req.user?.restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: req.user.restaurantId },
      });

      if (!restaurant) {
        return res.status(404).json({ message: "Ristorante non trovato" });
      }

      return res.json({
        user: {
          id: req.user.userId,
          name: "Super admin",
          email: req.user.email,
          role: "owner",
          isActive: true,
          isSuperAdmin: false,
          isImpersonating: true,
        },
        restaurant: sanitizeRestaurant(restaurant),
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { restaurant: true },
    });

    if (!user || !user.isActive) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const isSuperAdmin = isSuperAdminEmail(user.email);

    return res.json({
      user: sanitizeUser(user),
      restaurant: isSuperAdmin ? null : sanitizeRestaurant(user.restaurant),
    });
  } catch (error) {
    console.error("me error:", error);
    return res.status(500).json({ message: "Errore server" });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const refreshTokenValue = readCookie(req, "refresh_token");
    if (!refreshTokenValue || !prisma.userSession?.findUnique) {
      return res.status(401).json({ message: "Sessione mancante" });
    }

    const session = await prisma.userSession.findUnique({
      where: { tokenHash: hashToken(refreshTokenValue) },
      include: { user: { include: { restaurant: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Sessione non valida o scaduta" });
    }

    const isSuperAdmin = isSuperAdminEmail(session.user.email);

    if (!session.user?.isActive || (!isSuperAdmin && !session.user.restaurant?.isActive)) {
      clearRefreshCookie(res);
      return res.status(403).json({ message: "Account non attivo" });
    }

    const accessToken = signToken(session.user);
    return res.json({
      token: accessToken,
      user: sanitizeUser(session.user),
      restaurant: isSuperAdmin ? null : sanitizeRestaurant(session.user.restaurant),
    });
  } catch (error) {
    console.error("refreshToken error:", error);
    return res.status(500).json({ message: "Errore server durante il refresh sessione" });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshTokenValue = readCookie(req, "refresh_token");

    if (refreshTokenValue && prisma.userSession?.updateMany) {
      await prisma.userSession.updateMany({
        where: { tokenHash: hashToken(refreshTokenValue), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    clearRefreshCookie(res);
    return res.json({ message: "Logout effettuato" });
  } catch (error) {
    console.error("logout error:", error);
    return res.status(500).json({ message: "Errore server durante il logout" });
  }
};

export const requestPasswordReset = async (req, res) => {
  const genericMessage = "Se l'indirizzo è registrato, riceverai un link entro pochi minuti.";

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) return res.json({ message: genericMessage });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) return res.json({ message: genericMessage });

    const reset = createOneTimeToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: reset.hash,
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl: `${getClientUrl()}/reimposta-password?token=${encodeURIComponent(reset.token)}`,
    });

    return res.json({ message: genericMessage });
  } catch (error) {
    console.error("requestPasswordReset error:", error);
    return res.json({ message: genericMessage });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!token || password.length < 8) {
      return res.status(400).json({ message: "Il link non è valido oppure la password ha meno di 8 caratteri." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
        isActive: true,
      },
    });
    if (!user) return res.status(400).json({ message: "Il link è scaduto o è già stato utilizzato." });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      }),
      prisma.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return res.json({ message: "Password aggiornata. Ora puoi accedere con la nuova password." });
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ message: "Non è stato possibile aggiornare la password." });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ message: "Link di verifica non valido." });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { gt: new Date() },
        isActive: true,
      },
    });
    if (!user) return res.status(400).json({ message: "Il link è scaduto o l'email è già stata verificata." });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });

    return res.json({ message: "Email verificata correttamente." });
  } catch (error) {
    console.error("verifyEmail error:", error);
    return res.status(500).json({ message: "Non è stato possibile verificare l'email." });
  }
};

export const resendEmailVerification = async (req, res) => {
  const genericMessage = "Se l'account richiede la verifica, riceverai una nuova email.";

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) return res.json({ message: genericMessage });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.isActive || user.emailVerifiedAt) return res.json({ message: genericMessage });

    const verification = createOneTimeToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: verification.hash,
        emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
    await sendEmailVerification({
      to: user.email,
      name: user.name,
      verificationUrl: `${getClientUrl()}/verifica-email?token=${encodeURIComponent(verification.token)}`,
    });
    return res.json({ message: genericMessage });
  } catch (error) {
    console.error("resendEmailVerification error:", error);
    return res.json({ message: genericMessage });
  }
};
