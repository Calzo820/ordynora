import express from "express";
import {
  createMenuItem,
  deleteMenuItem,
  getMenuItems,
  importMenuItems,
  getMenuStockHistory,
  getPublicMenu,
  updateMenuStock,
  updateMenuItem,
} from "../controllers/menu.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireActiveSubscription } from "../middleware/billing.middleware.js";

const router = express.Router();

router.get("/", requireAuth, requireActiveSubscription, requireRole(["owner", "admin"]), getMenuItems);
router.post("/", requireAuth, requireActiveSubscription, requireRole(["owner", "admin"]), createMenuItem);
router.post("/import", requireAuth, requireActiveSubscription, requireRole(["owner", "admin"]), importMenuItems);
router.get("/:id/stock", requireAuth, requireActiveSubscription, requireRole(["owner", "admin"]), getMenuStockHistory);
router.post("/:id/stock", requireAuth, requireActiveSubscription, requireRole(["owner", "admin"]), updateMenuStock);
router.patch("/:id", requireAuth, requireActiveSubscription, requireRole(["owner", "admin"]), updateMenuItem);
router.delete("/:id", requireAuth, requireActiveSubscription, requireRole(["owner", "admin"]), deleteMenuItem);

router.get("/public/:slug", getPublicMenu);

export default router;
