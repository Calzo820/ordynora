import express from "express";
import {
  closeCashDay,
  getCashSummary,
  listCashClosures,
  reopenCashDay,
} from "../controllers/cash.controller.js";
import {
  denyImpersonatedPrivateData,
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";
import { requireActiveSubscription } from "../middleware/billing.middleware.js";
import prisma from "../lib/prisma.js";
import { requireFullRestaurantMode } from "../lib/restaurantMode.js";

const router = express.Router();
const cashAccess = [
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
  requireFullRestaurantMode(prisma, "La cassa Ordynora"),
];

router.get("/summary", ...cashAccess, getCashSummary);
router.get("/closures", ...cashAccess, listCashClosures);
router.post("/closures", ...cashAccess, closeCashDay);
router.post(
  "/closures/:id/reopen",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner"]),
  requireFullRestaurantMode(prisma, "La chiusura giornaliera"),
  reopenCashDay
);

export default router;
