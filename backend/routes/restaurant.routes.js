import express from "express";
import {
  createRestaurantForSuperAdmin,
  deleteMyRestaurantAccount,
  exportMyRestaurantData,
  getMyRestaurant,
  impersonateRestaurantForSuperAdmin,
  updateMyRestaurant,
  updateRestaurantForSuperAdmin,
} from "../controllers/restaurant.controller.js";
import { listPlatformRestaurants } from "../controllers/platform.controller.js";
import { denyImpersonatedPrivateData, requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/super-admin", requireAuth, listPlatformRestaurants);
router.post("/super-admin", requireAuth, createRestaurantForSuperAdmin);
router.patch("/super-admin/:restaurantId", requireAuth, updateRestaurantForSuperAdmin);
router.post("/super-admin/:restaurantId/impersonate", requireAuth, impersonateRestaurantForSuperAdmin);

router.get("/me", requireAuth, getMyRestaurant);
router.patch("/me", requireAuth, requireRole(["owner", "admin"]), updateMyRestaurant);
router.get("/me/export", requireAuth, denyImpersonatedPrivateData, requireRole(["owner"]), exportMyRestaurantData);
router.delete("/me", requireAuth, denyImpersonatedPrivateData, requireRole(["owner"]), deleteMyRestaurantAccount);

export default router;
