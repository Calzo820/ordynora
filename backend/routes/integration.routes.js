import { Router } from "express";
import {
  configureIntegration,
  disconnectCurrentIntegration,
  getCurrentIntegration,
  listIntegrations,
  testCurrentIntegration,
  updateOperationMode,
} from "../controllers/integration.controller.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { denyImpersonatedPrivateData, requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();
const ownerOrAdmin = [requireAuth, requireRole(["owner", "admin"]), denyImpersonatedPrivateData];

router.get("/", ...ownerOrAdmin, listIntegrations);
router.get("/catalog", ...ownerOrAdmin, listIntegrations);
router.get("/current", ...ownerOrAdmin, getCurrentIntegration);
router.patch("/mode", ...ownerOrAdmin, updateOperationMode);
router.post("/current", ...ownerOrAdmin, configureIntegration);
router.post(
  "/current/test",
  createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10, keyPrefix: "pos-integration-test" }),
  ...ownerOrAdmin,
  testCurrentIntegration
);
router.delete("/current", ...ownerOrAdmin, disconnectCurrentIntegration);

export default router;
