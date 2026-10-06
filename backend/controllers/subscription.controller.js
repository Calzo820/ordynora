import Stripe from "stripe";
import prisma from "../lib/prisma.js";

const PLAN_PRICE_ENV = {
  starter: ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_MONTHLY"],
  growth: ["STRIPE_PRICE_GROWTH", "STRIPE_PRICE_QUARTERLY"],
  semiannual: ["STRIPE_PRICE_SEMIANNUAL"],
  enterprise: ["STRIPE_PRICE_ENTERPRISE", "STRIPE_PRICE_YEARLY", "STRIPE_PRICE_ANNUAL"],
};

function getPlanPriceId(plan) {
  const envNames = PLAN_PRICE_ENV[plan] || [];
  for (const envName of envNames) {
    const value = process.env[envName];
    if (value) return value;
  }
  return "";
}

function getPrimaryPlanEnv(plan) {
  return PLAN_PRICE_ENV[plan]?.[0] || "";
}

function isBillingCoreConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && getPlanPriceId("starter"));
}

function configuredPlans() {
  return Object.fromEntries(Object.keys(PLAN_PRICE_ENV).map((plan) => [plan, Boolean(getPlanPriceId(plan))]));
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

function getClientUrl() {
  return String(process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function mapStripeStatus(status) {
  const allowed = new Set(["trialing", "active", "past_due", "canceled", "unpaid", "incomplete"]);
  return allowed.has(status) ? status : "incomplete";
}

function isOperationalSubscription(data) {
  if (!["trialing", "active"].includes(data.status)) return false;
  const validUntil = data.currentPeriodEnd || data.trialEndsAt;
  if (validUntil && validUntil.getTime() < Date.now()) return false;
  return true;
}

function getPlanFromPriceId(priceId) {
  if (!priceId) return "starter";
  const found = Object.entries(PLAN_PRICE_ENV).find(([, envNames]) =>
    envNames.some((envName) => process.env[envName] && process.env[envName] === priceId)
  );
  return found?.[0] || "starter";
}

function serializeSubscription(subscription, restaurant) {
  return {
    restaurant: restaurant
      ? {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          plan: restaurant.plan,
          operationMode: restaurant.operationMode || "full",
          isActive: restaurant.isActive,
          stripeCustomerId: restaurant.stripeCustomerId,
        }
      : null,
    subscription: subscription
      ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          stripePriceId: subscription.stripePriceId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
        }
      : null,
  };
}

export async function getBillingStatus(req, res) {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) return res.status(404).json({ message: "Ristorante non trovato" });

    return res.json({
      ...serializeSubscription(restaurant.subscription, restaurant),
      plans: [
        { id: "starter", name: "Mensile", priceLabel: "49,99 €/mese + IVA", recommended: false, envKey: "STRIPE_PRICE_STARTER" },
        { id: "growth", name: "Trimestrale", priceLabel: "134,99 €/3 mesi + IVA", discountLabel: "10% OFF", recommended: false, envKey: "STRIPE_PRICE_GROWTH" },
        { id: "semiannual", name: "Semestrale", priceLabel: "254,99 €/6 mesi + IVA", discountLabel: "15% OFF", recommended: true, envKey: "STRIPE_PRICE_SEMIANNUAL" },
        { id: "enterprise", name: "Annuale", priceLabel: "449,99 €/anno + IVA", discountLabel: "25% OFF", recommended: false, envKey: "STRIPE_PRICE_ENTERPRISE" },
      ],
      billingConfigured: isBillingCoreConfigured(),
      configuredPlans: configuredPlans(),
      webhookUrlHint: "/payments/webhook",
    });
  } catch (error) {
    console.error("getBillingStatus error:", error);
    return res.status(500).json({ message: "Errore recupero abbonamento" });
  }
}

export async function createSubscriptionCheckout(req, res) {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(501).json({ message: "Stripe non configurato: manca STRIPE_SECRET_KEY nel backend/.env o nel .env root" });

    const plan = String(req.body?.plan || "starter").toLowerCase();
    if (!PLAN_PRICE_ENV[plan]) return res.status(400).json({ message: "Piano non valido" });

    const priceId = getPlanPriceId(plan);
    if (!priceId) {
      return res.status(400).json({
        message: `Configura ${getPrimaryPlanEnv(plan)} nel backend/.env o nelle variabili Render prima di vendere questo piano`,
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId },
      include: { users: true, subscription: true },
    });

    if (!restaurant) return res.status(404).json({ message: "Ristorante non trovato" });

    const owner = restaurant.users.find((user) => user.role === "owner") || restaurant.users[0];
    let customerId = restaurant.stripeCustomerId || restaurant.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: restaurant.name,
        email: owner?.email,
        metadata: { restaurantId: restaurant.id, restaurantSlug: restaurant.slug },
      });
      customerId = customer.id;
      await prisma.restaurant.update({ where: { id: restaurant.id }, data: { stripeCustomerId: customerId } });
    }

    const clientUrl = getClientUrl();
    const automaticTaxEnabled = String(process.env.STRIPE_AUTOMATIC_TAX || "").toLowerCase() === "true";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${clientUrl}/billing?billing=success`,
      cancel_url: `${clientUrl}/billing?billing=cancelled`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: automaticTaxEnabled },
      tax_id_collection: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
      metadata: { restaurantId: restaurant.id, plan },
      subscription_data: {
        trial_period_days: Number(process.env.STRIPE_TRIAL_DAYS || 14),
        metadata: { restaurantId: restaurant.id, plan },
      },
    });

    return res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error("createSubscriptionCheckout error:", error);
    return res.status(500).json({ message: "Errore creazione checkout abbonamento" });
  }
}

export async function createBillingPortal(req, res) {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(501).json({ message: "Stripe non configurato" });

    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
    if (!restaurant?.stripeCustomerId) {
      return res.status(400).json({ message: "Nessun cliente Stripe associato a questo ristorante" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: restaurant.stripeCustomerId,
      return_url: `${getClientUrl()}/billing`,
    });

    return res.json({ portalUrl: session.url });
  } catch (error) {
    console.error("createBillingPortal error:", error);
    return res.status(500).json({ message: "Errore apertura portale abbonamento" });
  }
}

export async function syncSubscriptionFromStripe(sessionOrSubscription) {
  const object = sessionOrSubscription;
  const subscriptionId =
    object.object === "checkout.session"
      ? typeof object.subscription === "string"
        ? object.subscription
        : object.subscription?.id
      : object.id;

  const restaurantId = object.metadata?.restaurantId || object.subscription_details?.metadata?.restaurantId;
  if (!subscriptionId && !restaurantId) return null;

  const stripe = getStripe();
  const isFullSubscription = object.object === "subscription" && Boolean(object.status || object.items);
  let sub = isFullSubscription ? object : null;
  if (!sub && stripe && subscriptionId) {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  }

  const resolvedRestaurantId = restaurantId || sub?.metadata?.restaurantId;
  if (!resolvedRestaurantId || !sub) return null;

  const priceId = sub.items?.data?.[0]?.price?.id || object.metadata?.stripePriceId || null;
  const plan = sub.metadata?.plan || object.metadata?.plan || getPlanFromPriceId(priceId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  const data = {
    stripeCustomerId: customerId || null,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    plan,
    status: mapStripeStatus(sub.status),
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
  };
  const restaurantIsActive = isOperationalSubscription(data);

  const updated = await prisma.$transaction(async (tx) => {
    const subscription = await tx.saaSSubscription.upsert({
      where: { restaurantId: resolvedRestaurantId },
      create: { restaurantId: resolvedRestaurantId, ...data },
      update: data,
    });

    const restaurant = await tx.restaurant.update({
      where: { id: resolvedRestaurantId },
      data: { plan, stripeCustomerId: customerId || undefined, isActive: restaurantIsActive },
    });

    return { subscription, restaurant };
  });

  return updated;
}
