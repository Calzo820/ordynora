import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

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

    if (tokenUser.isSuperAdmin) {
      req.user = tokenUser;
      return next();
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { id: true, email: true, restaurantId: true, role: true, isActive: true },
    });

    if (!currentUser?.isActive || currentUser.restaurantId !== tokenUser.restaurantId) {
      return res.status(401).json({ message: "Sessione revocata o account non attivo" });
    }

    req.user = {
      ...tokenUser,
      email: currentUser.email,
      restaurantId: currentUser.restaurantId,
      role: currentUser.role,
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Token non valido o scaduto" });
  }
};

export const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) {
      return next();
    }

    if (!req.user?.role) {
      return res.status(401).json({ message: "Utente non autenticato" });
    }

    if (!roles.includes(req.user.role)) {
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
