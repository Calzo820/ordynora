import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { coverTotal, equalShareAmount } from "../lib/billing.js";
import { syncSubscriptionFromStripe } from "./subscription.controller.js";
import { logPaymentProblem } from "../lib/logger.js";
import { safeEmit } from "../lib/socketSafe.js";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

function tablePaymentsEnabled() {
  return String(process.env.PUBLIC_TABLE_PAYMENTS_ENABLED || "").toLowerCase() === "true";
}

function tablePaymentsComingSoon(res) {
  return res.status(503).json({
    available: false,
    code: "TABLE_PAYMENTS_COMING_SOON",
    message: "I pagamenti dal tavolo non sono ancora disponibili. La funzione sarà attivata prossimamente.",
  });
}

function getClientUrl() {
  return String(process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function connectStatus(restaurant, account = null) {
  const detailsSubmitted = Boolean(account?.details_submitted ?? restaurant?.stripeConnectDetailsSubmitted);
  const chargesEnabled = Boolean(account?.charges_enabled ?? restaurant?.stripeConnectChargesEnabled);
  const payoutsEnabled = Boolean(account?.payouts_enabled ?? restaurant?.stripeConnectPayoutsEnabled);
  const webhookConfigured = Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET);

  return {
    accountId: restaurant?.stripeConnectAccountId || account?.id || null,
    connected: Boolean(restaurant?.stripeConnectAccountId),
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    webhookConfigured,
    ready: detailsSubmitted && chargesEnabled && payoutsEnabled && webhookConfigured,
    requirements: account?.requirements
      ? {
          currentlyDue: account.requirements.currently_due || [],
          eventuallyDue: account.requirements.eventually_due || [],
          disabledReason: account.requirements.disabled_reason || null,
        }
      : null,
  };
}

async function persistConnectStatus(restaurantId, account) {
  return prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      stripeConnectAccountId: account.id,
      stripeConnectDetailsSubmitted: Boolean(account.details_submitted),
      stripeConnectChargesEnabled: Boolean(account.charges_enabled),
      stripeConnectPayoutsEnabled: Boolean(account.payouts_enabled),
      stripeConnectOnboardedAt: account.details_submitted ? new Date() : undefined,
    },
  });
}

export async function getStripeConnectStatus(req, res) {
  try {
    if (!tablePaymentsEnabled()) {
      return res.json({
        ...connectStatus(null),
        available: false,
        code: "TABLE_PAYMENTS_COMING_SOON",
        message: "I pagamenti dal tavolo saranno disponibili prossimamente.",
      });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
    if (!restaurant) return res.status(404).json({ message: "Ristorante non trovato" });
    if (!restaurant.stripeConnectAccountId) return res.json({ ...connectStatus(restaurant), available: true });

    const stripe = getStripe();
    if (!stripe) return res.json({ ...connectStatus(restaurant), available: true, stripeConfigured: false });

    const account = await stripe.accounts.retrieve(restaurant.stripeConnectAccountId);
    await persistConnectStatus(restaurant.id, account);
    return res.json({ ...connectStatus(restaurant, account), available: true, stripeConfigured: true });
  } catch (error) {
    console.error("getStripeConnectStatus error:", error);
    return res.status(500).json({ message: "Non è stato possibile verificare il conto Stripe del ristorante." });
  }
}

export async function createStripeConnectOnboarding(req, res) {
  try {
    if (!tablePaymentsEnabled()) return tablePaymentsComingSoon(res);

    const stripe = getStripe();
    if (!stripe) return res.status(501).json({ message: "Stripe non è configurato sul backend." });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId },
      include: { users: { where: { role: "owner" }, take: 1 } },
    });
    if (!restaurant) return res.status(404).json({ message: "Ristorante non trovato" });

    let accountId = restaurant.stripeConnectAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: String(process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || "IT").toUpperCase(),
        email: restaurant.users?.[0]?.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: restaurant.name,
          product_description: `Ordini e pagamenti al tavolo per ${restaurant.name}`,
        },
        metadata: { restaurantId: restaurant.id, restaurantSlug: restaurant.slug },
      });
      accountId = account.id;
      await persistConnectStatus(restaurant.id, account);
    }

    const clientUrl = getClientUrl();
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${clientUrl}/billing?connect=refresh`,
      return_url: `${clientUrl}/billing?connect=complete`,
      type: "account_onboarding",
    });

    return res.json({ onboardingUrl: accountLink.url });
  } catch (error) {
    console.error("createStripeConnectOnboarding error:", error);
    return res.status(500).json({ message: "Non è stato possibile aprire la configurazione degli incassi." });
  }
}

export async function createStripeConnectDashboard(req, res) {
  try {
    if (!tablePaymentsEnabled()) return tablePaymentsComingSoon(res);

    const stripe = getStripe();
    if (!stripe) return res.status(501).json({ message: "Stripe non è configurato sul backend." });

    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
    if (!restaurant?.stripeConnectAccountId) {
      return res.status(400).json({ message: "Prima collega il conto Stripe del ristorante." });
    }

    const loginLink = await stripe.accounts.createLoginLink(restaurant.stripeConnectAccountId);
    return res.json({ dashboardUrl: loginLink.url });
  } catch (error) {
    console.error("createStripeConnectDashboard error:", error);
    return res.status(500).json({ message: "Non è stato possibile aprire il pannello incassi Stripe." });
  }
}

function centsToMoney(value) {
  const cents = Number(value || 0);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const CHECKOUT_RESERVATION_MS = 31 * 60 * 1000;

function isActivePendingPayment(payment, now = new Date()) {
  if (payment.status !== "pending") return false;
  if (!payment.checkoutExpiresAt) {
    return new Date(payment.createdAt || 0).getTime() >= now.getTime() - 2 * 60 * 60 * 1000;
  }
  return new Date(payment.checkoutExpiresAt).getTime() >= now.getTime();
}

async function releaseExpiredCheckoutReservations(client, orderId, now = new Date()) {
  await client.paymentTransaction.updateMany({
    where: {
      orderId,
      status: "pending",
      OR: [
        { checkoutExpiresAt: { lt: now } },
        {
          checkoutExpiresAt: null,
          createdAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
        },
      ],
    },
    data: { status: "unpaid" },
  });
}

function paymentSplitSummary(order, payments, now = new Date()) {
  const paid = payments.filter((payment) => payment.status === "paid");
  const pending = payments.filter((payment) => isActivePendingPayment(payment, now));
  const paidAmount = paid.reduce((sum, payment) => sum + toMoney(payment.amount), 0);
  const reservedAmount = pending.reduce((sum, payment) => sum + toMoney(payment.amount), 0);
  const paidCovers = paid.reduce((sum, payment) => sum + Number(payment.coversCount || 0), 0);
  const reservedCovers = pending.reduce((sum, payment) => sum + Number(payment.coversCount || 0), 0);
  const guestCount = Math.max(1, Number(order.guestCount || 1));
  const usedIndexes = new Set(
    [...paid, ...pending]
      .filter((payment) => Number(payment.billRevision || 0) === Number(order.billRevision || 1))
      .map((payment) => Number(payment.splitIndex || 0))
      .filter((index) => index > 0)
  );
  const nextShareIndex = Array.from({ length: guestCount }, (_, index) => index + 1)
    .find((index) => !usedIndexes.has(index)) || null;
  const remaining = Math.max(0, toMoney(order.totalAmount) - paidAmount);
  const unreserved = Math.max(0, remaining - reservedAmount);
  const nextShareAmount = nextShareIndex
    ? Math.min(unreserved, equalShareAmount(order.totalAmount, guestCount, nextShareIndex))
    : 0;

  return {
    paidAmount,
    reservedAmount,
    remainingAmount: remaining,
    unreservedAmount: unreserved,
    paidCovers,
    reservedCovers,
    availableCovers: Math.max(0, guestCount - paidCovers - reservedCovers),
    nextShareIndex,
    nextShareAmount,
  };
}

async function reserveCheckoutPayment(orderId, paymentMode) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        await releaseExpiredCheckoutReservations(tx, orderId, now);
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { table: true, restaurant: true, items: true, payments: true },
        });
        if (!order) throw Object.assign(new Error("Ordine non trovato"), { code: "ORDER_NOT_FOUND" });
        if (order.status === "cancelled" || order.closedAt) {
          throw Object.assign(new Error("Ordine non pagabile"), { code: "ORDER_CLOSED" });
        }
        if (!order.billConfiguredAt) {
          throw Object.assign(new Error("Il ristorante deve prima confermare coperti e totale in Cassa."), {
            code: "BILL_NOT_CONFIGURED",
          });
        }

        const split = paymentSplitSummary(order, order.payments, now);
        if (split.remainingAmount <= 0.01 || order.paymentStatus === "paid") {
          throw Object.assign(new Error("Ordine già pagato"), { code: "ALREADY_PAID" });
        }
        if (split.unreservedAmount < 0.5) {
          throw Object.assign(
            new Error("Un altro pagamento è già in corso. Attendi qualche minuto o chiedi assistenza alla cassa."),
            { code: "PAYMENT_RESERVED" }
          );
        }

        const shareMode = paymentMode === "share";
        if (shareMode && (!order.equalSplitEnabled || Number(order.guestCount || 1) <= 1)) {
          throw Object.assign(new Error("La divisione in quote non è attiva per questo conto."), {
            code: "SPLIT_NOT_AVAILABLE",
          });
        }
        if (shareMode && !split.nextShareIndex) {
          throw Object.assign(new Error("Tutte le quote risultano già pagate o in pagamento."), {
            code: "NO_SHARE_AVAILABLE",
          });
        }

        const splitIndex = shareMode ? split.nextShareIndex : null;
        const splitCount = shareMode ? Number(order.guestCount || 1) : null;
        const amount = shareMode
          ? Math.min(split.unreservedAmount, split.nextShareAmount)
          : split.unreservedAmount;
        if (amount < 0.5) {
          throw Object.assign(new Error("La quota residua è inferiore al minimo pagabile online."), {
            code: "AMOUNT_TOO_SMALL",
          });
        }

        const splitKey = shareMode
          ? `${order.id}:${order.billRevision}:share:${splitIndex}`
          : `${order.id}:${order.billRevision}:full`;
        const expiresAt = new Date(now.getTime() + CHECKOUT_RESERVATION_MS);
        const existing = await tx.paymentTransaction.findUnique({ where: { splitKey } });
        if (existing && isActivePendingPayment(existing, now)) {
          throw Object.assign(new Error("Questa quota ha già un pagamento in corso."), {
            code: "PAYMENT_RESERVED",
          });
        }
        if (existing?.status === "paid") {
          throw Object.assign(new Error("Questa quota risulta già pagata."), { code: "ALREADY_PAID" });
        }

        const paymentData = {
          restaurantId: order.restaurantId,
          orderId: order.id,
          provider: "stripe",
          providerSessionId: null,
          providerPaymentIntentId: null,
          connectedAccountId: order.restaurant.stripeConnectAccountId,
          amount,
          currency: String(order.restaurant.currency || "EUR").toUpperCase(),
          status: "pending",
          method: "online",
          splitLabel: shareMode ? `Quota ${splitIndex}/${splitCount}` : "Saldo dal tavolo",
          splitKey,
          splitIndex,
          splitCount,
          coversCount: shareMode ? 1 : split.availableCovers,
          billRevision: order.billRevision,
          checkoutExpiresAt: expiresAt,
          paidAt: null,
        };
        const payment = existing
          ? await tx.paymentTransaction.update({ where: { id: existing.id }, data: paymentData })
          : await tx.paymentTransaction.create({ data: paymentData });

        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: "pending", paymentMethod: "online" },
        });
        return { order, payment, amount, splitIndex, splitCount, expiresAt };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!["P2034", "P2002"].includes(error?.code) || attempt === 2) throw error;
    }
  }

  throw lastError || new Error("Pagamento non prenotabile");
}

async function refreshOrderPaymentStatus(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { payments: true },
  });

  if (!order) return null;

  const paid = order.payments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + toMoney(payment.amount), 0);

  const total = toMoney(order.totalAmount);
  const isPaid = total > 0 && paid + 0.01 >= total;

  return tx.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: isPaid ? "paid" : paid > 0 ? "pending" : order.paymentStatus,
      paymentMethod: isPaid ? "online" : order.paymentMethod,
      paidAt: isPaid ? order.paidAt || new Date() : order.paidAt,
    },
    include: { table: true, payments: true },
  });
}

export async function getPublicPaymentSummary(req, res) {
  try {
    const { token } = req.params;
    const found = await prisma.order.findUnique({
      where: { publicToken: token },
      select: { id: true },
    });
    if (!found) return res.status(404).json({ message: "Ordine non trovato" });
    await releaseExpiredCheckoutReservations(prisma, found.id);
    const order = await prisma.order.findUnique({
      where: { id: found.id },
      include: { payments: { orderBy: { createdAt: "asc" } }, table: true, restaurant: true },
    });
    const split = paymentSplitSummary(order, order.payments);
    const stripeReady = tablePaymentsEnabled() && Boolean(
      order.restaurant?.stripeConnectAccountId &&
      order.restaurant?.stripeConnectChargesEnabled &&
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    );

    return res.json({
      orderId: order.id,
      publicToken: order.publicToken,
      tableName: order.table?.name,
      restaurantName: order.restaurant?.name,
      totalAmount: toMoney(order.totalAmount),
      paidAmount: split.paidAmount,
      reservedAmount: split.reservedAmount,
      remainingAmount: split.remainingAmount,
      paymentStatus: order.paymentStatus,
      guestCount: Number(order.guestCount || 1),
      coverCharge: toMoney(order.coverCharge),
      coverChargePerGuest: order.coverChargePerGuest,
      equalSplitEnabled: order.equalSplitEnabled,
      billConfigured: Boolean(order.billConfiguredAt),
      billLocked: split.paidAmount > 0 || split.reservedAmount > 0,
      paidCovers: split.paidCovers,
      reservedCovers: split.reservedCovers,
      availableCovers: split.availableCovers,
      nextShareAmount: split.nextShareAmount,
      onlinePaymentConfigured: stripeReady,
      onlinePaymentAvailable: stripeReady && Boolean(order.billConfiguredAt),
      requiresGuestConfirmation: stripeReady && !order.billConfiguredAt,
      payments: order.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        splitLabel: payment.splitLabel,
        splitIndex: payment.splitIndex,
        splitCount: payment.splitCount,
        coversCount: payment.coversCount,
        checkoutExpiresAt: payment.checkoutExpiresAt,
        paidAt: payment.paidAt,
      })),
    });
  } catch (error) {
    console.error("getPublicPaymentSummary error:", error);
    return res.status(500).json({ message: "Errore durante recupero pagamenti" });
  }
}

export async function createPublicStripeCheckout(req, res) {
  let reservedPaymentId = null;

  try {
    if (!tablePaymentsEnabled()) return tablePaymentsComingSoon(res);

    const stripe = getStripe();
    if (!stripe) {
      return res.status(501).json({
        message: "Stripe non configurato. Imposta STRIPE_SECRET_KEY nel backend.",
      });
    }

    const { token } = req.params;
    const paymentMode =
      req.body?.paymentMode === "share" || Number(req.body?.splitCount || 1) > 1
        ? "share"
        : "full";

    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      include: { table: true, restaurant: true },
    });

    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (order.status === "cancelled" || order.closedAt) {
      return res.status(400).json({ message: "Ordine non pagabile" });
    }
    if (!order.restaurant?.stripeConnectAccountId || !order.restaurant?.stripeConnectChargesEnabled) {
      return res.status(409).json({
        message: "Il pagamento online non è ancora attivo per questo ristorante. Puoi chiedere il conto al tavolo.",
      });
    }
    if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
      return res.status(503).json({
        message: "Il pagamento online è in configurazione. Per ora puoi chiedere il conto al tavolo.",
      });
    }

    const reservation = await reserveCheckoutPayment(order.id, paymentMode);
    reservedPaymentId = reservation.payment.id;
    const amountCents = Math.round(reservation.amount * 100);
    const currency = String(reservation.order.restaurant?.currency || "EUR").toLowerCase();
    const clientUrl = getClientUrl();
    const successUrl = `${clientUrl}/menu/${encodeURIComponent(reservation.order.restaurant.slug)}/${encodeURIComponent(reservation.order.table.qrToken)}?payment=success&order=${encodeURIComponent(reservation.order.publicToken)}`;
    const cancelUrl = `${clientUrl}/menu/${encodeURIComponent(reservation.order.restaurant.slug)}/${encodeURIComponent(reservation.order.table.qrToken)}?payment=cancelled&order=${encodeURIComponent(reservation.order.publicToken)}`;

    const checkoutPayload = {
      mode: "payment",
      payment_method_types: ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(reservation.expiresAt.getTime() / 1000),
      customer_creation: "if_required",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: `Conto ${reservation.order.restaurant.name} - ${reservation.order.table.name}`,
              description: reservation.splitIndex
                ? `Quota ${reservation.splitIndex}/${reservation.splitCount}`
                : `Saldo ordine ${reservation.order.orderNumber}`,
            },
          },
        },
      ],
      metadata: {
        orderId: reservation.order.id,
        restaurantId: reservation.order.restaurantId,
        publicToken: reservation.order.publicToken,
        paymentTransactionId: reservation.payment.id,
        paymentMode,
        splitCount: String(reservation.splitCount || 1),
        payerIndex: String(reservation.splitIndex || 0),
      },
      payment_intent_data: {
        metadata: {
          orderId: reservation.order.id,
          restaurantId: reservation.order.restaurantId,
          publicToken: reservation.order.publicToken,
          paymentTransactionId: reservation.payment.id,
        },
      },
    };
    const session = await stripe.checkout.sessions.create(checkoutPayload, {
      stripeAccount: reservation.order.restaurant.stripeConnectAccountId,
    });

    await prisma.paymentTransaction.update({
      where: { id: reservation.payment.id },
      data: {
        providerSessionId: session.id,
      },
    });

    await prisma.order.update({
      where: { id: reservation.order.id },
      data: {
        paymentStatus: "pending",
        paymentMethod: "online",
        stripeCheckoutSessionId: session.id,
      },
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: amountCents / 100,
      currency: currency.toUpperCase(),
      paymentMode,
      splitIndex: reservation.splitIndex,
      splitCount: reservation.splitCount,
    });
  } catch (error) {
    if (reservedPaymentId) {
      await prisma.paymentTransaction.updateMany({
        where: { id: reservedPaymentId, status: "pending", providerSessionId: null },
        data: { status: "unpaid", checkoutExpiresAt: null },
      }).catch(() => {});
    }
    console.error("createPublicStripeCheckout error:", error);
    const clientErrors = new Set([
      "ORDER_NOT_FOUND",
      "ORDER_CLOSED",
      "BILL_NOT_CONFIGURED",
      "ALREADY_PAID",
      "PAYMENT_RESERVED",
      "SPLIT_NOT_AVAILABLE",
      "NO_SHARE_AVAILABLE",
      "AMOUNT_TOO_SMALL",
    ]);
    if (clientErrors.has(error?.code)) {
      const status = error.code === "ORDER_NOT_FOUND" ? 404 : error.code === "PAYMENT_RESERVED" ? 409 : 400;
      return res.status(status).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({ message: "Errore durante creazione checkout Stripe" });
  }
}

export async function handleStripeWebhook(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(501).json({ message: "Stripe non configurato" });

  try {
    const signature = req.headers["stripe-signature"];
    const webhookSecrets = [
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    ].filter(Boolean);
    let event;

    if (webhookSecrets.length) {
      let signatureError = null;
      for (const secret of webhookSecrets) {
        try {
          event = stripe.webhooks.constructEvent(req.body, signature, secret);
          break;
        } catch (error) {
          signatureError = error;
        }
      }
      if (!event) throw signatureError || new Error("Firma webhook non valida");
    } else if (process.env.NODE_ENV === "production") {
      return res.status(503).json({ message: "Webhook Stripe non configurato" });
    } else {
      event = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "{}"));
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.mode === "subscription") {
        const synced = await syncSubscriptionFromStripe(session);
        const io = req.app.get("io");
        if (io && synced?.restaurant) {
          safeEmit(io, `restaurant:${synced.restaurant.id}`, "subscription-updated", {
            restaurantId: synced.restaurant.id,
            plan: synced.restaurant.plan,
            status: synced.subscription.status,
          });
        }
      }

      const orderId = session.metadata?.orderId;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

      if (orderId) {
        const updated = await prisma.$transaction(async (tx) => {
          await tx.paymentTransaction.updateMany({
            where: {
              OR: [
                { providerSessionId: session.id },
                ...(session.metadata?.paymentTransactionId
                  ? [{ id: session.metadata.paymentTransactionId }]
                  : []),
              ],
            },
            data: {
              status: "paid",
              providerSessionId: session.id,
              providerPaymentIntentId: paymentIntentId || null,
              amount: session.amount_total ? centsToMoney(session.amount_total) : undefined,
              currency: session.currency ? String(session.currency).toUpperCase() : undefined,
              checkoutExpiresAt: null,
              paidAt: new Date(),
            },
          });

          await tx.order.update({
            where: { id: orderId },
            data: {
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: paymentIntentId || null,
              paymentMethod: "online",
            },
          });

          return refreshOrderPaymentStatus(tx, orderId);
        });

        const io = req.app.get("io");
        if (io && updated) {
          safeEmit(io, `restaurant:${updated.restaurantId}`, "payment-updated", {
            orderId: updated.id,
            restaurantId: updated.restaurantId,
            tableId: updated.tableId,
            tableName: updated.table?.name,
            paymentStatus: updated.paymentStatus,
            paidAt: updated.paidAt,
          });
          safeEmit(io, `restaurant:${updated.restaurantId}`, "table-updated", {
            orderId: updated.id,
            restaurantId: updated.restaurantId,
            tableId: updated.tableId,
            reason: "payment-updated",
          });
        }
      }
    }

    if (event.type === "account.updated") {
      const account = event.data.object;
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [
            { stripeConnectAccountId: account.id },
            ...(account.metadata?.restaurantId ? [{ id: account.metadata.restaurantId }] : []),
          ],
        },
      });
      if (restaurant) {
        await persistConnectStatus(restaurant.id, account);
        const io = req.app.get("io");
        if (io) {
          safeEmit(io, `restaurant:${restaurant.id}`, "connect-updated", {
            restaurantId: restaurant.id,
            ...connectStatus(restaurant, account),
          });
        }
      }
    }


    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (subscriptionId) {
        const synced = await syncSubscriptionFromStripe({ object: "subscription", id: subscriptionId });
        if (event.type === "invoice.payment_failed") {
          await logPaymentProblem({
            restaurantId: synced?.restaurant?.id || invoice.metadata?.restaurantId || null,
            message: "Rinnovo abbonamento Stripe fallito",
            metadata: {
              invoiceId: invoice.id,
              subscriptionId,
              customerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
              amountDue: invoice.amount_due,
              hostedInvoiceUrl: invoice.hosted_invoice_url,
            },
          });
        }
        const io = req.app.get("io");
        if (io && synced?.restaurant) {
          safeEmit(io, `restaurant:${synced.restaurant.id}`, "subscription-updated", {
            restaurantId: synced.restaurant.id,
            plan: synced.restaurant.plan,
            status: synced.subscription.status,
          });
        }
      }
    }

    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const subscription = event.data.object;
      const synced = await syncSubscriptionFromStripe(subscription);
      const io = req.app.get("io");
      if (io && synced?.restaurant) {
        safeEmit(io, `restaurant:${synced.restaurant.id}`, "subscription-updated", {
          restaurantId: synced.restaurant.id,
          plan: synced.restaurant.plan,
          status: synced.subscription.status,
        });
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      await prisma.paymentTransaction.updateMany({
        where: {
          status: "pending",
          OR: [
            { providerSessionId: session.id },
            ...(session.metadata?.paymentTransactionId
              ? [{ id: session.metadata.paymentTransactionId }]
              : []),
          ],
        },
        data: { status: "unpaid", checkoutExpiresAt: null },
      });
      await logPaymentProblem({
        restaurantId: session.metadata?.restaurantId || null,
        message: "Checkout Stripe scaduto",
        metadata: { sessionId: session.id, orderId: session.metadata?.orderId },
      });
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      await prisma.paymentTransaction.updateMany({
        where: {
          status: "pending",
          OR: [
            { providerPaymentIntentId: paymentIntent.id },
            ...(paymentIntent.metadata?.paymentTransactionId
              ? [{ id: paymentIntent.metadata.paymentTransactionId }]
              : []),
          ],
        },
        data: { status: "unpaid", checkoutExpiresAt: null },
      });
      await logPaymentProblem({
        restaurantId: paymentIntent.metadata?.restaurantId || null,
        message: "Pagamento Stripe fallito",
        metadata: { paymentIntentId: paymentIntent.id, lastPaymentError: paymentIntent.last_payment_error },
      });
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntentId) {
        const updatedPayments = await prisma.paymentTransaction.updateMany({
          where: { providerPaymentIntentId: paymentIntentId },
          data: { status: "refunded" },
        });
        if (updatedPayments.count > 0) {
          const payment = await prisma.paymentTransaction.findFirst({ where: { providerPaymentIntentId: paymentIntentId } });
          if (payment?.orderId) {
            const updated = await prisma.order.update({
              where: { id: payment.orderId },
              data: { paymentStatus: "refunded" },
              include: { table: true },
            });
            const io = req.app.get("io");
            if (io) safeEmit(io, `restaurant:${updated.restaurantId}`, "payment-updated", {
              orderId: updated.id,
              restaurantId: updated.restaurantId,
              tableId: updated.tableId,
              paymentStatus: updated.paymentStatus,
            });
          }
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("handleStripeWebhook error:", error);
    await logPaymentProblem({ message: "Webhook Stripe non valido", error });
    return res.status(400).json({ message: `Webhook Stripe non valido: ${error.message}` });
  }
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export async function getPublicReceipt(req, res) {
  try {
    const { token } = req.params;
    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      include: { restaurant: true, table: true, items: true, payments: { orderBy: { createdAt: "desc" } } },
    });
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });

    const paidAmount = order.payments.filter((p) => p.status === "paid").reduce((s, p) => s + toMoney(p.amount), 0);
    const billableItems = order.items.filter((item) => item.status !== "voided" && !item.isComplimentary);
    const subtotal = billableItems.reduce((s, i) => s + toMoney(i.priceSnapshot) * toMoney(i.quantity), 0);
    const covers = coverTotal(order);
    const vatRate = 10;
    const taxable = subtotal / (1 + vatRate / 100);
    const vat = subtotal - taxable;

    const receipt = {
      receiptNumber: `R-${String(order.orderNumber || 1).padStart(5, "0")}`,
      issuedAt: new Date().toISOString(),
      restaurant: { name: order.restaurant?.name, slug: order.restaurant?.slug, currency: order.restaurant?.currency || "EUR" },
      table: order.table ? { name: order.table.name, code: order.table.code } : null,
      order: { id: order.id, publicToken: order.publicToken, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, paidAt: order.paidAt, totalAmount: toMoney(order.totalAmount), discountAmount: toMoney(order.discountAmount), discountPercent: toMoney(order.discountPercent), extraAmount: toMoney(order.extraAmount), guestCount: order.guestCount, coverCharge: toMoney(order.coverCharge), coverChargePerGuest: order.coverChargePerGuest },
      items: billableItems.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity, unitPrice: toMoney(i.priceSnapshot), total: toMoney(i.priceSnapshot) * toMoney(i.quantity), category: i.categorySnapshot, notes: i.notes })),
      totals: { subtotal, covers, discount: toMoney(order.discountAmount), extra: toMoney(order.extraAmount), grandTotal: toMoney(order.totalAmount), paidAmount, remainingAmount: Math.max(0, toMoney(order.totalAmount) - paidAmount), vat: [{ rate: vatRate, net: Number(taxable.toFixed(2)), vat: Number(vat.toFixed(2)), gross: Number(subtotal.toFixed(2)) }] },
      payments: order.payments.map((p) => ({ id: p.id, provider: p.provider, amount: p.amount, currency: p.currency, status: p.status, splitLabel: p.splitLabel, coversCount: p.coversCount, paidAt: p.paidAt })),
      note: "Ricevuta non fiscale di cortesia. Per fattura elettronica integrare i dati fiscali del cliente.",
    };

    const wantsJson = String(req.headers.accept || "").includes("application/json") || req.query.format === "json";
    if (wantsJson) return res.json(receipt);

    const rows = receipt.items.map((item) => {
      const details = [item.category, item.notes].filter(Boolean).map(escapeHtml).join(" · ");
      return `
      <tr><td><b>${escapeHtml(item.name)}</b><small>${details}</small></td><td>${Number(item.quantity)}</td><td>€ ${item.unitPrice.toFixed(2)}</td><td>€ ${item.total.toFixed(2)}</td></tr>
    `;
    }).join("");
    const payments = receipt.payments.length
      ? receipt.payments.map((payment) => `<li>${escapeHtml(payment.splitLabel || "Pagamento")}: € ${toMoney(payment.amount).toFixed(2)} · ${escapeHtml(payment.status)}</li>`).join("")
      : "<li>Nessun pagamento registrato</li>";
    const restaurantName = escapeHtml(receipt.restaurant.name || "Ristorante");
    const tableName = escapeHtml(receipt.table?.name || "-");
    const receiptNumber = escapeHtml(receipt.receiptNumber);
    const issuedAt = escapeHtml(new Date(receipt.issuedAt).toLocaleString("it-IT"));
    const receiptNote = escapeHtml(receipt.note);
    const coverLabel = receipt.order.coverChargePerGuest
      ? `Coperto (${Number(receipt.order.guestCount || 1)} persone)`
      : "Coperto tavolo";
    const coverLine = receipt.totals.covers > 0
      ? `<div class="line"><span>${coverLabel}</span><b>€ ${receipt.totals.covers.toFixed(2)}</b></div>`
      : "";
    const discountLine = receipt.totals.discount > 0
      ? `<div class="line"><span>Sconto</span><b>- € ${receipt.totals.discount.toFixed(2)}</b></div>`
      : "";

    return res.type("html").send(`<!doctype html>
<html lang="it"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Ricevuta ${receiptNumber}</title>
<style>body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}.wrap{max-width:760px;margin:24px auto;padding:20px}.card{background:white;border:1px solid #e2e8f0;border-radius:26px;box-shadow:0 20px 60px rgba(15,23,42,.08);padding:26px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.badge{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;padding:8px 12px;border-radius:999px;font-weight:900}.muted{color:#64748b}h1{margin:6px 0 0;font-size:30px}table{width:100%;border-collapse:collapse;margin-top:22px}td,th{padding:12px;border-bottom:1px solid #e2e8f0;text-align:right}td:first-child,th:first-child{text-align:left}small{display:block;color:#64748b;margin-top:4px}.total{margin-top:20px;background:#0f172a;color:white;border-radius:20px;padding:18px;display:grid;gap:8px}.line{display:flex;justify-content:space-between}.grand{font-size:24px;font-weight:900}.print{margin-top:18px;border:0;border-radius:14px;padding:12px 16px;background:#2563eb;color:white;font-weight:900;cursor:pointer}@media print{body{background:white}.wrap{margin:0;max-width:none}.card{box-shadow:none;border:0}.print{display:none}}</style></head>
<body><div class="wrap"><div class="card"><div class="top"><div><div class="muted">${restaurantName}</div><h1>Ricevuta / preconto</h1><div class="muted">${receiptNumber} · ${issuedAt}</div></div><div class="badge">${receipt.order.paymentStatus === "paid" ? "Pagato" : "Da pagare"}</div></div>
<p><b>Tavolo:</b> ${tableName}</p><table><thead><tr><th>Prodotto</th><th>Qtà</th><th>Prezzo</th><th>Totale</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total"><div class="line"><span>Subtotale</span><b>€ ${receipt.totals.subtotal.toFixed(2)}</b></div>${coverLine}${discountLine}<div class="line"><span>IVA indicativa 10%</span><b>€ ${receipt.totals.vat[0].vat.toFixed(2)}</b></div><div class="line grand"><span>Totale</span><span>€ ${receipt.totals.grandTotal.toFixed(2)}</span></div><div class="line"><span>Pagato</span><b>€ ${receipt.totals.paidAmount.toFixed(2)}</b></div><div class="line"><span>Residuo</span><b>€ ${receipt.totals.remainingAmount.toFixed(2)}</b></div></div>
<h3>Pagamenti</h3><ul>${payments}</ul><p class="muted">${receiptNote}</p><button class="print" onclick="window.print()">Stampa / salva PDF</button></div></div></body></html>`);
  } catch (error) {
    console.error("getPublicReceipt error:", error);
    return res.status(500).json({ message: "Errore durante generazione ricevuta" });
  }
}
