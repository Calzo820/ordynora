import prisma from "../lib/prisma.js";
import { paginationMeta, parsePagination } from "../lib/queryPagination.js";

const PLAN_OPTIONS = new Set(["starter", "growth", "semiannual", "enterprise"]);
const ACTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active"];

function activeRestaurantWhere(now = new Date()) {
  return {
    isActive: true,
    subscription: {
      is: {
        status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
        OR: [
          { currentPeriodEnd: { gt: now } },
          { trialEndsAt: { gt: now } },
          { currentPeriodEnd: null, trialEndsAt: null },
        ],
      },
    },
  };
}

export function buildPlatformRestaurantWhere(query = {}, now = new Date()) {
  const search = String(query.q || "").trim().slice(0, 100);
  const status = String(query.status || "all").trim().toLowerCase();
  const conditions = [];

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        {
          users: {
            some: {
              role: "owner",
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  if (PLAN_OPTIONS.has(status)) conditions.push({ plan: status });
  if (status === "active") conditions.push(activeRestaurantWhere(now));
  if (status === "suspended") conditions.push({ NOT: activeRestaurantWhere(now) });
  if (status === "alerts") {
    conditions.push({
      OR: [
        { isActive: false },
        { menuItems: { none: { isDeleted: false } } },
        { tables: { none: { isActive: true } } },
        { users: { none: { role: "owner", isActive: true } } },
      ],
    });
  }

  return conditions.length ? { AND: conditions } : {};
}

function serializeRestaurant(restaurant) {
  const owner = restaurant.users?.[0] || null;

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    primaryColor: restaurant.primaryColor,
    logoUrl: restaurant.logoUrl,
    currency: restaurant.currency,
    plan: restaurant.plan,
    isActive: restaurant.isActive,
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt,
    subscription: restaurant.subscription,
    counts: restaurant._count || {},
    owner,
    users: owner ? [owner] : [],
  };
}

export async function listPlatformRestaurants(req, res) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ message: "Accesso riservato al SuperAdmin" });
  }

  try {
    const pagination = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
    const now = new Date();
    const where = buildPlatformRestaurantWhere(req.query, now);
    const activeWhere = activeRestaurantWhere(now);

    const [restaurants, filteredTotal, total, active] = await prisma.$transaction([
      prisma.restaurant.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          primaryColor: true,
          logoUrl: true,
          currency: true,
          plan: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          users: {
            where: { role: "owner" },
            take: 1,
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
          },
          subscription: {
            select: {
              status: true,
              plan: true,
              currentPeriodEnd: true,
              trialEndsAt: true,
              cancelAtPeriodEnd: true,
            },
          },
          _count: { select: { users: true, menuItems: true, tables: true } },
        },
      }),
      prisma.restaurant.count({ where }),
      prisma.restaurant.count(),
      prisma.restaurant.count({ where: activeWhere }),
    ]);

    return res.json({
      restaurants: restaurants.map(serializeRestaurant),
      pagination: paginationMeta({ ...pagination, total: filteredTotal }),
      summary: {
        total,
        active,
        suspended: Math.max(0, total - active),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("listPlatformRestaurants error:", error);
    return res.status(500).json({ message: "Errore durante il recupero dei ristoranti" });
  }
}
