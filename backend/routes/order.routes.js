import express from "express";
import {
  addOrderExtra,
  addOrderPayment,
  closeOrder,
  createPublicOrder,
  getOrders,
  getServiceOrders,
  getPublicOrderByToken,
  requestPublicBill,
  requestPublicStaff,
  deleteOrder,
  getOrderAudit,
  reopenOrder,
  updateOrderBillSettings,
  updateOrderItem,
  updateOrderStatus,
} from "../controllers/order.controller.js";
import { denyImpersonatedPrivateData, requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireActiveSubscription } from "../middleware/billing.middleware.js";
import { validateExtraPayload, validateOrderStatusPayload, validatePublicOrderPayload } from "../middleware/validate.js";

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
  requireRole(["owner", "admin", "kitchen", "bar"]),
  validateOrderStatusPayload,
  updateOrderStatus
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
  addOrderPayment
);

router.patch(
  "/:id/bill-settings",
  requireAuth,
  denyImpersonatedPrivateData,
  requireActiveSubscription,
  requireRole(["owner", "admin", "cashier"]),
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
  closeOrder
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
