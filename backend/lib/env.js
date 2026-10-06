import { loadEnvironment } from "./loadEnv.js";

const REQUIRED_IN_PRODUCTION = ["JWT_SECRET", "DATABASE_URL", "CLIENT_URL", "CORS_ORIGIN"];
const BILLING_MINIMUM = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

export function validateEnvironment() {
  loadEnvironment({ silent: false });

  const isProduction = process.env.NODE_ENV === "production";
  const missingRequired = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  const missingBilling = BILLING_MINIMUM.filter((key) => !process.env[key]);
  if (!process.env.STRIPE_PRICE_STARTER && !process.env.STRIPE_PRICE_MONTHLY) missingBilling.push("STRIPE_PRICE_STARTER o STRIPE_PRICE_MONTHLY");

  if (isProduction && missingRequired.length > 0) {
    throw new Error(`Variabili ambiente mancanti in produzione: ${missingRequired.join(", ")}`);
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || ["postgres123", "dev-secret-change-me"].includes(process.env.JWT_SECRET)) {
    throw new Error("JWT_SECRET assente o troppo debole: usa una stringa casuale di almeno 32 caratteri.");
  }

  if (missingBilling.length > 0) {
    console.warn(`Avviso Ordynora billing: mancano ${missingBilling.join(", ")}. Stripe resta in modalità test/trial locale finché non sono configurate.`);
  } else {
    console.log("Ordynora billing: Stripe base configurato. Verifica tutti i price ID dalla pagina Billing.");
  }

  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    console.warn("Avviso Ordynora integrazioni: INTEGRATION_ENCRYPTION_KEY non configurata. Le chiavi API dei gestionali non potranno essere salvate.");
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    paymentsEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookEnabled: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    connectWebhookEnabled: Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
    emailEnabled: Boolean(process.env.BREVO_API_KEY),
    monitorEnabled: Boolean(process.env.MONITOR_WEBHOOK_URL),
    encryptedBackupEnabled: String(process.env.BACKUP_ENABLED || "").toLowerCase() === "true" && Boolean(process.env.BACKUP_ENCRYPTION_KEY),
    subscriptionsEnabled: Boolean(process.env.STRIPE_SECRET_KEY && (process.env.STRIPE_PRICE_STARTER || process.env.STRIPE_PRICE_MONTHLY)),
    starterPlanEnabled: Boolean(process.env.STRIPE_PRICE_STARTER || process.env.STRIPE_PRICE_MONTHLY),
    growthPlanEnabled: Boolean(process.env.STRIPE_PRICE_GROWTH || process.env.STRIPE_PRICE_QUARTERLY),
    semiannualPlanEnabled: Boolean(process.env.STRIPE_PRICE_SEMIANNUAL),
    enterprisePlanEnabled: Boolean(process.env.STRIPE_PRICE_ENTERPRISE || process.env.STRIPE_PRICE_YEARLY),
    integrationsEncryptionEnabled: Boolean(process.env.INTEGRATION_ENCRYPTION_KEY),
  };
}
