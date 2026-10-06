import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import prisma from "../lib/prisma.js";
import { restaurantCapabilities } from "../lib/restaurantMode.js";
import { logError } from "../lib/logger.js";
import { sendSupportAccessNotification } from "../lib/mailer.js";

const ALLOWED_PLANS = new Set(["starter", "growth", "semiannual", "enterprise"]);
const ALLOWED_SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "past_due", "canceled", "unpaid", "incomplete"]);
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { apiVersion: "2025-03-31.basil" }) : null;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function parseSubscriptionDays(value) {
  const parsed = Number(value || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(365, Math.round(parsed)));
}

function buildSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getSuperAdminEmails() {
  return String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isRequestSuperAdmin(req) {
  const tokenEmail = String(req.user?.email || "").trim().toLowerCase();
  return Boolean(req.user?.isSuperAdmin) || getSuperAdminEmails().includes(tokenEmail);
}

function requireSuperAdmin(req, res) {
  if (!isRequestSuperAdmin(req)) {
    res.status(403).json({ message: "Accesso riservato al super admin" });
    return false;
  }
  return true;
}

function serializeRestaurant(restaurant) {
  const owner =
    restaurant.users?.find((user) => user.role === "owner") ||
    restaurant.users?.[0] ||
    null;
  const safeOwner = owner
    ? {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        isActive: owner.isActive,
        createdAt: owner.createdAt,
      }
    : null;

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    primaryColor: restaurant.primaryColor,
    logoUrl: restaurant.logoUrl,
    currency: restaurant.currency,
    plan: restaurant.plan,
    operationMode: restaurant.operationMode || "full",
    isActive: restaurant.isActive,
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt,
    subscription: restaurant.subscription
      ? {
          status: restaurant.subscription.status,
          plan: restaurant.subscription.plan,
          currentPeriodEnd: restaurant.subscription.currentPeriodEnd,
          trialEndsAt: restaurant.subscription.trialEndsAt,
          cancelAtPeriodEnd: restaurant.subscription.cancelAtPeriodEnd,
        }
      : null,
    counts: restaurant._count || {},
    owner: safeOwner,
    users: safeOwner ? [safeOwner] : [],
  };
}

async function getRestaurantForSuperAdmin(id) {
  return prisma.restaurant.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      subscription: true,
      _count: { select: { users: true, menuItems: true, tables: true } },
    },
  });
}

export const listRestaurantsForSuperAdmin = async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const restaurants = await prisma.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        },
        subscription: true,
        _count: { select: { menuItems: true, tables: true, users: true } },
      },
    });

    return res.json({ restaurants: restaurants.map(serializeRestaurant) });
  } catch (error) {
    console.error("listRestaurantsForSuperAdmin error:", error);
    return res.status(500).json({ message: "Errore server durante il recupero ristoranti" });
  }
};

export const createRestaurantForSuperAdmin = async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const name = String(req.body.name || "").trim();
    const ownerName = String(req.body.ownerName || "Owner").trim() || "Owner";
    const ownerEmail = String(req.body.ownerEmail || "").trim().toLowerCase();
    const ownerPassword = String(req.body.ownerPassword || "");
    const plan = String(req.body.plan || "starter").trim().toLowerCase();
    const tablesCount = Math.max(0, Math.min(80, Number(req.body.tablesCount || 0)));

    if (!name || !ownerEmail || !ownerPassword) {
      return res.status(400).json({ message: "Nome ristorante, email owner e password sono obbligatori" });
    }

    if (!EMAIL_REGEX.test(ownerEmail)) {
      return res.status(400).json({ message: "Email owner non valida" });
    }

    if (ownerPassword.length < 8) {
      return res.status(400).json({ message: "La password iniziale deve avere almeno 8 caratteri" });
    }

    if (!ALLOWED_PLANS.has(plan)) {
      return res.status(400).json({ message: "Piano non valido" });
    }

    const slug = buildSlug(req.body.slug || name);
    if (!slug) return res.status(400).json({ message: "Slug non valido" });

    const [existingRestaurant, existingUser] = await Promise.all([
      prisma.restaurant.findUnique({ where: { slug } }),
      prisma.user.findUnique({ where: { email: ownerEmail } }),
    ]);

    if (existingRestaurant) return res.status(409).json({ message: "Slug già in uso" });
    if (existingUser) return res.status(409).json({ message: "Email owner già registrata" });

    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    const restaurant = await prisma.$transaction(async (tx) => {
      const created = await tx.restaurant.create({
        data: {
          name,
          slug,
          plan,
          currency: "EUR",
          primaryColor: "#1d4ed8",
          isActive: true,
          users: {
            create: {
              name: ownerName,
              email: ownerEmail,
              passwordHash,
              role: "owner",
              isActive: true,
            },
          },
          subscription: {
            create: {
              plan,
              status: "trialing",
              trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });

      if (tablesCount > 0) {
        await tx.table.createMany({
          data: Array.from({ length: tablesCount }).map((_, index) => ({
            restaurantId: created.id,
            name: `Tavolo ${index + 1}`,
            code: String(index + 1),
            seats: 4,
            sortOrder: index + 1,
            isActive: true,
          })),
        });
      }

      return created;
    });

    const full = await getRestaurantForSuperAdmin(restaurant.id);
    return res.status(201).json({ message: "Ristorante creato", restaurant: serializeRestaurant(full) });
  } catch (error) {
    console.error("createRestaurantForSuperAdmin error:", error);
    return res.status(500).json({ message: "Errore server durante creazione ristorante" });
  }
};

export const updateRestaurantForSuperAdmin = async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const restaurantId = String(req.params.restaurantId || "");
    const current = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });
    if (!current) return res.status(404).json({ message: "Ristorante non trovato" });

    const data = {};
    const subscriptionData = {};
    let shouldUpdateSubscription = false;
    const subscriptionDays = parseSubscriptionDays(req.body.subscriptionDays);
    const shouldRefreshSubscriptionPeriod =
      req.body.subscriptionStatus !== undefined || req.body.subscriptionDays !== undefined || !current.subscription;

    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "Nome ristorante obbligatorio" });
      data.name = name;
    }

    if (req.body.slug !== undefined) {
      const slug = buildSlug(req.body.slug);
      if (!slug) return res.status(400).json({ message: "Slug non valido" });
      if (slug !== current.slug) {
        const collision = await prisma.restaurant.findUnique({ where: { slug } });
        if (collision && collision.id !== current.id) return res.status(409).json({ message: "Slug già in uso" });
      }
      data.slug = slug;
    }

    if (req.body.plan !== undefined) {
      const plan = String(req.body.plan || "").trim().toLowerCase();
      if (!ALLOWED_PLANS.has(plan)) return res.status(400).json({ message: "Piano non valido" });
      data.plan = plan;
    }

    if (req.body.subscriptionStatus !== undefined) {
      const status = String(req.body.subscriptionStatus || "").trim().toLowerCase();
      if (!ALLOWED_SUBSCRIPTION_STATUSES.has(status)) {
        return res.status(400).json({ message: "Stato abbonamento non valido" });
      }
      subscriptionData.status = status;
      shouldUpdateSubscription = true;
      data.isActive = status === "trialing" || status === "active";
    }

    if (req.body.cancelAtPeriodEnd !== undefined) {
      subscriptionData.cancelAtPeriodEnd = Boolean(req.body.cancelAtPeriodEnd);
      shouldUpdateSubscription = true;
    }

    if (req.body.isActive !== undefined) {
      data.isActive = Boolean(req.body.isActive);
    }

    if (req.body.primaryColor !== undefined) data.primaryColor = String(req.body.primaryColor || "#1d4ed8");
    if (req.body.logoUrl !== undefined) data.logoUrl = String(req.body.logoUrl || "").trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({ where: { id: restaurantId }, data });
      if (data.plan || shouldUpdateSubscription) {
        const status = subscriptionData.status || current.subscription?.status || "trialing";
        const plan = data.plan || current.subscription?.plan || current.plan || "starter";
        const periodData = {};

        if (shouldRefreshSubscriptionPeriod && status === "trialing") {
          periodData.trialEndsAt = addDays(subscriptionDays);
          periodData.currentPeriodEnd = null;
          periodData.cancelAtPeriodEnd = false;
        }

        if (shouldRefreshSubscriptionPeriod && status === "active") {
          periodData.currentPeriodEnd = addDays(subscriptionDays);
          periodData.trialEndsAt = null;
          periodData.cancelAtPeriodEnd = false;
        }

        await tx.saaSSubscription.upsert({
          where: { restaurantId },
          update: { plan, ...subscriptionData, ...periodData },
          create: { restaurantId, plan, status, ...subscriptionData, ...periodData },
        });
      }
    });

    const updated = await getRestaurantForSuperAdmin(restaurantId);
    return res.json({ message: "Ristorante aggiornato", restaurant: serializeRestaurant(updated) });
  } catch (error) {
    console.error("updateRestaurantForSuperAdmin error:", error);
    return res.status(500).json({ message: "Errore server durante aggiornamento ristorante" });
  }
};

export const impersonateRestaurantForSuperAdmin = async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const restaurantId = String(req.params.restaurantId || "");
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        users: {
          where: { role: "owner", isActive: true },
          select: { email: true, name: true },
          take: 1,
        },
      },
    });
    if (!restaurant) return res.status(404).json({ message: "Ristorante non trovato" });

    const supportReason = String(req.body?.supportReason || "").trim();
    if (supportReason.length < 8) {
      return res.status(400).json({ message: "Serve un motivo supporto o consenso esplicito del ristorante" });
    }

    const accessedAt = new Date();
    const accessLog = await logError({
      restaurantId: restaurant.id,
      source: "superadmin-support-access",
      level: "audit",
      message: "Accesso SuperAdmin in modalità assistenza",
      metadata: {
        supportReason,
        superAdminEmail: req.user?.email,
        platformUserId: req.user?.userId,
        restaurantName: restaurant.name,
      },
    });

    const owner = restaurant.users?.[0] || null;
    const notification = await sendSupportAccessNotification({
      to: owner?.email,
      restaurantName: restaurant.name,
      superAdminEmail: req.user?.email,
      supportReason,
      accessedAt,
    }).catch((error) => ({ sent: false, reason: error.message || "mail_failed" }));

    if (!notification.sent) {
      await logError({
        restaurantId: restaurant.id,
        source: "superadmin-support-email",
        level: "warning",
        message: "Avviso email accesso assistenza non inviato",
        metadata: {
          reason: notification.reason,
          ownerEmail: owner?.email || null,
          accessLogId: accessLog?.id || null,
        },
      });
    }

    const token = jwt.sign(
      {
        userId: req.user.userId,
        platformUserId: req.user.userId,
        email: req.user.email,
        restaurantId: restaurant.id,
        role: "owner",
        impersonating: true,
        isSuperAdmin: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      message: notification.sent
        ? "Gestione ristorante aperta e avviso email inviato all'owner"
        : "Gestione ristorante aperta; configura BREVO_API_KEY per inviare l'avviso all'owner",
      supportNotificationSent: notification.sent,
      token,
      user: {
        id: req.user.userId,
        name: "Super admin",
        email: req.user.email,
        role: "owner",
        isActive: true,
        isImpersonating: true,
      },
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        primaryColor: restaurant.primaryColor,
        logoUrl: restaurant.logoUrl,
        currency: restaurant.currency,
        isActive: restaurant.isActive,
        plan: restaurant.plan,
        operationMode: restaurant.operationMode || "full",
      },
    });
  } catch (error) {
    console.error("impersonateRestaurantForSuperAdmin error:", error);
    return res.status(500).json({ message: "Errore apertura gestione ristorante" });
  }
};

export const getMyRestaurant = async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });

    if (!restaurant) {
      return res.status(404).json({ message: "Ristorante non trovato" });
    }

    return res.json({
      ...restaurant,
      capabilities: restaurantCapabilities(restaurant.operationMode),
    });
  } catch (error) {
    console.error("getMyRestaurant error:", error);
    return res.status(500).json({ message: "Errore server" });
  }
};

export const updateMyRestaurant = async (req, res) => {
  try {
    const current = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });

    if (!current) {
      return res.status(404).json({ message: "Ristorante non trovato" });
    }

    const data = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "Il nome del ristorante è obbligatorio" });
      data.name = name;

      const nextSlug = buildSlug(name);
      if (!nextSlug) return res.status(400).json({ message: "Nome ristorante non valido" });

      if (nextSlug !== current.slug) {
        const collision = await prisma.restaurant.findUnique({ where: { slug: nextSlug } });
        if (collision && collision.id !== current.id) {
          return res.status(409).json({ message: "Slug già in uso da un altro ristorante" });
        }
        data.slug = nextSlug;
      }
    }

    if (req.body.primaryColor !== undefined) data.primaryColor = String(req.body.primaryColor || "").trim() || "#1d4ed8";
    if (req.body.logoUrl !== undefined) data.logoUrl = String(req.body.logoUrl || "").trim() || null;
    if (req.body.currency !== undefined) data.currency = String(req.body.currency || "EUR").trim().toUpperCase();
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.settingsJson !== undefined) data.settingsJson = req.body.settingsJson ?? null;

    const restaurant = await prisma.restaurant.update({ where: { id: req.user.restaurantId }, data });

    return res.json({ message: "Ristorante aggiornato", restaurant });
  } catch (error) {
    console.error("updateMyRestaurant error:", error);
    return res.status(500).json({ message: "Errore server" });
  }
};

export const exportMyRestaurantData = async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        menuItems: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] },
        tables: { orderBy: { sortOrder: "asc" } },
        reservations: {
          include: { table: { select: { id: true, name: true, code: true } } },
          orderBy: [{ date: "asc" }, { time: "asc" }],
        },
        orders: {
          include: {
            table: { select: { id: true, name: true, code: true } },
            items: true,
            payments: true,
            statusHistory: true,
          },
          orderBy: { createdAt: "desc" },
        },
        subscription: true,
      },
    });

    if (!restaurant) return res.status(404).json({ message: "Ristorante non trovato" });

    const exportPayload = {
      exportVersion: 1,
      generatedAt: new Date().toISOString(),
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        primaryColor: restaurant.primaryColor,
        logoUrl: restaurant.logoUrl,
        currency: restaurant.currency,
        isActive: restaurant.isActive,
        plan: restaurant.plan,
        settings: restaurant.settingsJson,
        createdAt: restaurant.createdAt,
        updatedAt: restaurant.updatedAt,
      },
      users: restaurant.users,
      menu: restaurant.menuItems,
      tables: restaurant.tables,
      reservations: restaurant.reservations,
      orders: restaurant.orders,
      subscription: restaurant.subscription
        ? {
            plan: restaurant.subscription.plan,
            status: restaurant.subscription.status,
            currentPeriodEnd: restaurant.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: restaurant.subscription.cancelAtPeriodEnd,
            trialEndsAt: restaurant.subscription.trialEndsAt,
          }
        : null,
    };

    const safeSlug = String(restaurant.slug || "ristorante").replace(/[^a-z0-9-]/gi, "-");
    res.setHeader("Content-Disposition", `attachment; filename="ordynora-${safeSlug}-${localDateForFilename()}.json"`);
    return res.json(exportPayload);
  } catch (error) {
    console.error("exportMyRestaurantData error:", error);
    return res.status(500).json({ message: "Non è stato possibile preparare l'esportazione." });
  }
};

function localDateForFilename() {
  return new Date().toISOString().slice(0, 10);
}

export const deleteMyRestaurantAccount = async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    const confirmation = String(req.body?.confirmation || "").trim();
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId },
      include: { subscription: true },
    });
    if (!restaurant) return res.status(404).json({ message: "Ristorante non trovato" });
    if (confirmation !== restaurant.name) {
      return res.status(400).json({ message: "Scrivi esattamente il nome del ristorante per confermare." });
    }

    const owner = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!owner || owner.role !== "owner" || !(await bcrypt.compare(password, owner.passwordHash))) {
      return res.status(401).json({ message: "Password non corretta." });
    }

    if (restaurant.subscription?.stripeSubscriptionId) {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({
          message: "Prima di eliminare l'account dobbiamo annullare l'abbonamento. Contatta l'assistenza.",
        });
      }
      try {
        await stripe.subscriptions.cancel(restaurant.subscription.stripeSubscriptionId);
      } catch (error) {
        if (error?.code !== "resource_missing") throw error;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.reservation.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.tableSession.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.table.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.menuItem.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.paymentTransaction.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.errorLog.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.saaSSubscription.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.orderCounter.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.user.deleteMany({ where: { restaurantId: restaurant.id } });
      await tx.restaurant.delete({ where: { id: restaurant.id } });
    });

    res.clearCookie("refresh_token");
    return res.json({ message: "Account e dati del ristorante eliminati." });
  } catch (error) {
    console.error("deleteMyRestaurantAccount error:", error);
    return res.status(500).json({ message: "Eliminazione non riuscita. Nessun dato è stato rimosso." });
  }
};
