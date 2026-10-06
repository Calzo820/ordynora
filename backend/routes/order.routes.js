import express from "express";
import {
  addOrderExtra,
  addOrderPayment,
  closeOrder,
  closeOrderOperationally,
  createPublicOrder,
  getOrders,
  getServiceOrders,
  getPublicOrderByToken,
  requestPublicBill,
  requestPublicStaff,
  deleteOrder,
  getOrderAudit,
  reopenOrder,
  releaseOrderCourse,
  updateOrderBillSettings,
  updateOrderItem,
  updateOrderStatus,
} from "../controllers/order.controller.js";
import { denyImpersonatedPrivateData, requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireActiveSubscription } from "../middleware/billing.middleware.js";
import { validateExtraPayload, validateOrderStatusPayload, validatePublicOrderPayload } from "../middleware/validate.js";
import prisma from "../lib/prisma.js";
import { requireFullRestaurantMode } from "../lib/restaurantMode.js";

const router = express.Router();

router.post("/public", validatePublicOrderPayload, createPublicOrder);
router.get("/public/:token", getPublicOrderByToken);
router.post("/public/:token/request-bill", requestPublicBill);
router.post("/public/:token/call-staff", requestPublicStaff);

router.get("/", requireAuth, denyImpersonatedPrivateData, requireActiveSubscription, requireRole(["owner", "admin"]), getOrders);
router.get("/kitchen/list", requireAuth, denyImpersonatedPrivateData, requireActiveSubscription, requireRole(["owner", "admin", "kitchen", "bar"]), getServiceOrders);

router.patch(
  "/:id/status",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "kitchen", "bar", "waiter"]),
  validateOrderStatusPayload,
  updateOrderStatus
);

router.post(
  "/:id/courses/:courseNumber/release",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "waiter"]),
  releaseOrderCourse
);

router.post(
  "/:id/extra",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
  validateExtraPayload,
  addOrderExtra
);

router.post(
  "/:id/payments",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
  requireFullRestaurantMode(prisma, "La registrazione dei pagamenti"),
  addOrderPayment
);

router.patch(
  "/:id/bill-settings",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
  requireFullRestaurantMode(prisma, "La configurazione del conto"),
  updateOrderBillSettings
);

router.patch(
  "/:id/items/:itemId",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
  updateOrderItem
);

router.post(
  "/:id/close",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
  requireFullRestaurantMode(prisma, "La chiusura con pagamento Ordynora"),
  closeOrder
);

router.post(
  "/:id/complete-service",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier", "waiter"]),
  closeOrderOperationally
);

router.post(
  "/:id/reopen",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner"]),
  reopenOrder
);

router.get(
  "/:id/audit",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
  getOrderAudit
);

router.delete(
  "/:id",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin"]),
  deleteOrder
);

export default router;
