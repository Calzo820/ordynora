import bcrypt from "bcrypt";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const ALLOWED_ROLES = new Set(["owner", "admin", "kitchen", "bar", "cashier", "waiter"]);
const PIN_ROLES = new Set(["admin", "kitchen", "bar", "cashier", "waiter"]);
const PIN_REGEX = /^\d{4,6}$/;

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.isPinOnly ? null : user.email,
    role: user.role,
    isActive: user.isActive,
    pinEnabled: user.pinEnabled,
    isPinOnly: user.isPinOnly,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function pinAlreadyUsed(restaurantId, pin, excludedUserId = null) {
  const users = await prisma.user.findMany({
    where: {
      restaurantId,
      pinEnabled: true,
      pinHash: { not: null },
      ...(excludedUserId ? { id: { not: excludedUserId } } : {}),
    },
    select: { pinHash: true },
  });
  for (const user of users) {
    if (user.pinHash && await bcrypt.compare(pin, user.pinHash)) return true;
  }
  return false;
}

function canManageRole(actorRole, targetRole) {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner";
  return false;
}

export const listUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { restaurantId: req.user.restaurantId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    return res.json(users.map(sanitizeUser));
  } catch (error) {
    console.error("listUsers error:", error);
    return res.status(500).json({ message: "Errore durante recupero utenti" });
  }
};

export const createUser = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const pin = String(req.body.pin || "").trim();
    const usePin = String(req.body.accessMode || "").toLowerCase() === "pin" || Boolean(pin);
    const role = String(req.body.role || "kitchen").trim().toLowerCase();

    if (!name) {
      return res.status(400).json({ message: "Il nome è obbligatorio" });
    }

    if (usePin) {
      if (!PIN_ROLES.has(role)) return res.status(400).json({ message: "L'accesso PIN è riservato allo staff operativo" });
      if (!PIN_REGEX.test(pin)) return res.status(400).json({ message: "Il PIN deve contenere da 4 a 6 numeri" });
      if (await pinAlreadyUsed(req.user.restaurantId, pin)) {
        return res.status(409).json({ message: "Questo PIN è già usato da un altro membro dello staff" });
      }
    } else {
      if (!email || !password) return res.status(400).json({ message: "Email e password sono obbligatorie" });
      if (!EMAIL_REGEX.test(email)) return res.status(400).json({ message: "Email non valida" });
      if (password.length < 8) return res.status(400).json({ message: "La password deve avere almeno 8 caratteri" });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ message: "Ruolo non valido" });
    }

    if (!canManageRole(req.user.role, role)) {
      return res.status(403).json({ message: "Non puoi creare utenti con questo ruolo" });
    }

    const internalEmail = `pin-${crypto.randomUUID()}@internal.ordynora.local`;
    const accountEmail = usePin ? internalEmail : email;
    const existing = await prisma.user.findUnique({ where: { email: accountEmail } });
    if (existing) {
      return res.status(409).json({ message: "Email già registrata" });
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          restaurantId: req.user.restaurantId,
          name,
          email: accountEmail,
          passwordHash: await bcrypt.hash(usePin ? crypto.randomBytes(24).toString("hex") : password, 12),
          pinHash: usePin ? await bcrypt.hash(pin, 12) : null,
          pinEnabled: usePin,
          isPinOnly: usePin,
          role,
          isActive: true,
        },
      });
      await writeAudit(tx, req, {
        action: "staff.created",
        entityType: "user",
        entityId: created.id,
        metadata: { name, role, accessMode: usePin ? "pin" : "email" },
      });
      return created;
    });

    return res.status(201).json({ message: "Utente creato", user: sanitizeUser(user) });
  } catch (error) {
    console.error("createUser error:", error);
    return res.status(500).json({ message: "Errore durante creazione utente" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || user.restaurantId !== req.user.restaurantId) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (!canManageRole(req.user.role, user.role)) {
      return res.status(403).json({ message: "Non puoi modificare questo utente" });
    }

    const data = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "Nome obbligatorio" });
      data.name = name;
    }

    if (req.body.email !== undefined) {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!EMAIL_REGEX.test(email)) return res.status(400).json({ message: "Email non valida" });
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== user.id) return res.status(409).json({ message: "Email già registrata" });
      data.email = email;
    }

    if (req.body.role !== undefined) {
      const role = String(req.body.role || "").trim().toLowerCase();
      if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ message: "Ruolo non valido" });
      if (!canManageRole(req.user.role, role)) return res.status(403).json({ message: "Non puoi assegnare questo ruolo" });
      if (user.isPinOnly && !PIN_ROLES.has(role)) {
        return res.status(400).json({ message: "Un utente con solo PIN deve mantenere un ruolo staff compatibile" });
      }
      data.role = role;
    }

    if (req.body.isActive !== undefined) {
      if (user.id === req.user.userId && req.body.isActive === false) {
        return res.status(400).json({ message: "Non puoi disattivare il tuo account" });
      }
      data.isActive = Boolean(req.body.isActive);
    }

    if (req.body.password) {
      const password = String(req.body.password || "");
      if (password.length < 8) return res.status(400).json({ message: "La password deve avere almeno 8 caratteri" });
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    if (req.body.pin !== undefined) {
      const pin = String(req.body.pin || "").trim();
      if (!pin) {
        if (user.isPinOnly) return res.status(400).json({ message: "Un accesso solo PIN deve mantenere un PIN attivo" });
        data.pinHash = null;
        data.pinEnabled = false;
      } else {
        if (!PIN_ROLES.has(data.role || user.role)) return res.status(400).json({ message: "L'accesso PIN è riservato allo staff operativo" });
        if (!PIN_REGEX.test(pin)) return res.status(400).json({ message: "Il PIN deve contenere da 4 a 6 numeri" });
        if (await pinAlreadyUsed(req.user.restaurantId, pin, user.id)) {
          return res.status(409).json({ message: "Questo PIN è già usato da un altro membro dello staff" });
        }
        data.pinHash = await bcrypt.hash(pin, 12);
        data.pinEnabled = true;
      }
    }

    const securityChanged = Boolean(
      (data.role && data.role !== user.role)
      || data.isActive === false
      || (data.email && data.email !== user.email)
      || data.passwordHash
      || data.pinHash
      || data.pinEnabled === false
    );

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id }, data });
      if (securityChanged) {
        await tx.userSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await writeAudit(tx, req, {
        action: "staff.updated",
        entityType: "user",
        entityId: id,
        metadata: {
          changedFields: Object.keys(data).filter((field) => field !== "passwordHash" && field !== "pinHash"),
          sessionsRevoked: securityChanged,
        },
      });
      return result;
    });
    return res.json({ message: "Utente aggiornato", user: sanitizeUser(updated) });
  } catch (error) {
    console.error("updateUser error:", error);
    return res.status(500).json({ message: "Errore durante aggiornamento utente" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || user.restaurantId !== req.user.restaurantId) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    if (user.id === req.user.userId) {
      return res.status(400).json({ message: "Non puoi eliminare il tuo account" });
    }

    if (!canManageRole(req.user.role, user.role)) {
      return res.status(403).json({ message: "Non puoi eliminare questo utente" });
    }

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, req, {
        action: "staff.deleted",
        entityType: "user",
        entityId: id,
        metadata: { name: user.name, role: user.role },
      });
      await tx.user.delete({ where: { id } });
    });
    return res.json({ message: "Utente eliminato" });
  } catch (error) {
    console.error("deleteUser error:", error);
    return res.status(500).json({ message: "Errore durante eliminazione utente" });
  }
};
