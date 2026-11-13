import { Router } from "express";
import {
  configureIntegration,
  disconnectCurrentIntegration,
  autoMapIntegration,
  getCurrentIntegration,
  getIntegrationWorkspace,
  importProviderCatalog,
  listIntegrationJobs,
  listIntegrations,
  retryIntegrationJob,
  saveIntegrationMappings,
  setIntegrationSyncMode,
  syncEligibleOrders,
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
router.get(
  "/current/workspace",
  createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 20, keyPrefix: "pos-integration-workspace" }),
  ...ownerOrAdmin,
  getIntegrationWorkspace
);
router.put(
  "/current/mappings",
  createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 20, keyPrefix: "pos-integration-mapping" }),
  ...ownerOrAdmin,
  saveIntegrationMappings
);
router.post(
  "/current/mappings/auto",
  createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 10, keyPrefix: "pos-integration-auto-map" }),
  ...ownerOrAdmin,
  autoMapIntegration
);
router.post(
  "/current/import",
  createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: "pos-integration-import" }),
  ...ownerOrAdmin,
  importProviderCatalog
);
router.patch("/current/sync-mode", ...ownerOrAdmin, setIntegrationSyncMode);
router.post("/current/sync", ...ownerOrAdmin, syncEligibleOrders);
router.get("/current/jobs", ...ownerOrAdmin, listIntegrationJobs);
router.post("/current/jobs/:jobId/retry", ...ownerOrAdmin, retryIntegrationJob);
router.delete("/current", ...ownerOrAdmin, disconnectCurrentIntegration);

export default router;
