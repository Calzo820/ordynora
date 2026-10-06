export const RESTAURANT_MODES = Object.freeze({
  FULL: "full",
  INTEGRATED: "integrated",
});

export function normalizeRestaurantMode(value) {
  return value === RESTAURANT_MODES.INTEGRATED
    ? RESTAURANT_MODES.INTEGRATED
    : RESTAURANT_MODES.FULL;
}

export function restaurantCapabilities(mode) {
  const operationMode = normalizeRestaurantMode(mode);
  const integrated = operationMode === RESTAURANT_MODES.INTEGRATED;
  return {
    operationMode,
    operationalFlow: true,
    tableMap: true,
    reservations: true,
    qrOrdering: true,
    kitchen: true,
    bar: true,
    courses: true,
    internalCashDesk: !integrated,
    internalPayments: !integrated,
    tableOnlinePayments: !integrated,
    cashClosure: !integrated,
    internalReceipt: !integrated,
    financialAnalytics: !integrated,
    externalSettlement: integrated,
  };
}

export async function getRestaurantMode(client, restaurantId) {
  if (!restaurantId) return RESTAURANT_MODES.FULL;
  const restaurant = await client.restaurant.findUnique({
    where: { id: restaurantId },
    select: { operationMode: true },
  });
  return normalizeRestaurantMode(restaurant?.operationMode);
}

export function integratedModeError(feature = "Questa funzione") {
  const error = new Error(`${feature} è gestita dal gestionale collegato.`);
  error.code = "EXTERNAL_POS_OWNS_FEATURE";
  error.statusCode = 409;
  return error;
}

export function sendIntegratedModeError(res, feature) {
  const error = integratedModeError(feature);
  return res.status(error.statusCode).json({
    code: error.code,
    message: error.message,
    operationMode: RESTAURANT_MODES.INTEGRATED,
    nextAction: "Completa il servizio da Sala e registra pagamento e documento fiscale nel gestionale collegato.",
  });
}

export function requireFullRestaurantMode(prisma, feature) {
  return async function fullRestaurantModeMiddleware(req, res, next) {
    try {
      const mode = await getRestaurantMode(prisma, req.user?.restaurantId);
      if (mode === RESTAURANT_MODES.INTEGRATED) {
        return sendIntegratedModeError(res, feature);
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
