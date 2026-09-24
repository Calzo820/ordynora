import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

function getConfiguredSuperAdminEmails() {
  return String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function findAuthenticatedUser(userId) {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, restaurantId: true, role: true, isActive: true },
  });
}

export async function resolveAuthenticatedUser(
  tokenUser,
  {
    findUser = findAuthenticatedUser,
    superAdminEmails = getConfiguredSuperAdminEmails(),
  } = {}
) {
  if (tokenUser?.isSuperAdmin) return tokenUser;

  const currentUser = await findUser(tokenUser?.userId);
  if (!currentUser?.isActive) return null;

  if (tokenUser?.impersonating) {
    const configuredEmails = new Set(superAdminEmails.map(normalizeEmail));
    const currentEmail = normalizeEmail(currentUser.email);
    const tokenEmail = normalizeEmail(tokenUser.email);
    const validPlatformIdentity = Boolean(
      tokenUser.restaurantId
      && tokenUser.platformUserId
      && tokenUser.platformUserId === tokenUser.userId
      && tokenUser.role === "owner"
      && currentEmail
      && currentEmail === tokenEmail
      && configuredEmails.has(currentEmail)
    );

    if (!validPlatformIdentity) return null;

    return {
      ...tokenUser,
      email: currentUser.email,
      role: "owner",
      isSuperAdmin: false,
      impersonating: true,
    };
  }

  if (currentUser.restaurantId !== tokenUser?.restaurantId) return null;

  return {
    ...tokenUser,
    email: currentUser.email,
    restaurantId: currentUser.restaurantId,
    role: currentUser.role,
  };
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice(7).trim();
}

export const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ message: "Token mancante o formato non valido" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const tokenUser = {
      userId: decoded.userId,
      email: decoded.email,
      restaurantId: decoded.restaurantId || null,
      role: decoded.role,
      isSuperAdmin: Boolean(decoded.isSuperAdmin),
      impersonating: Boolean(decoded.impersonating),
      platformUserId: decoded.platformUserId || null,
    };

    const authenticatedUser = await resolveAuthenticatedUser(tokenUser);
    if (!authenticatedUser) {
      return res.status(401).json({ message: "Sessione revocata o account non attivo" });
    }

    req.user = authenticatedUser;

    return next();
  } catch {
    return res.status(401).json({ message: "Token non valido o scaduto" });
  }
};

export const requireRole = (roles = []) => {
  const allowedRoles = (Array.isArray(roles) ? roles : [roles])
    .map((role) => String(role || "").trim().toLowerCase())
    .filter(Boolean);

  return (req, res, next) => {
    if (req.user?.isSuperAdmin) {
      return next();
    }

    if (!req.user?.role) {
      return res.status(401).json({ message: "Utente non autenticato" });
    }

    if (!allowedRoles.includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ message: "Permessi insufficienti" });
    }

    next();
  };
};

export const denyImpersonatedPrivateData = (req, res, next) => {
  if (req.user?.impersonating) {
    return res.status(403).json({
      message: "Questi dati privati non sono disponibili durante l'assistenza SuperAdmin",
    });
  }

  return next();
};
