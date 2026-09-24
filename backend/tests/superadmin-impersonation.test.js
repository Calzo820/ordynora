import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthenticatedUser } from "../middleware/auth.middleware.js";

const platformUser = {
  id: "platform-user",
  email: "support@ordynora.com",
  restaurantId: "platform-restaurant",
  role: "owner",
  isActive: true,
};

const supportTokenUser = {
  userId: "platform-user",
  platformUserId: "platform-user",
  email: "support@ordynora.com",
  restaurantId: "customer-restaurant",
  role: "owner",
  isSuperAdmin: false,
  impersonating: true,
};

test("a valid support token keeps the selected customer restaurant", async () => {
  const authenticated = await resolveAuthenticatedUser(supportTokenUser, {
    findUser: async () => platformUser,
    superAdminEmails: ["SUPPORT@ORDYNORA.COM"],
  });

  assert.equal(authenticated.restaurantId, "customer-restaurant");
  assert.equal(authenticated.role, "owner");
  assert.equal(authenticated.impersonating, true);
  assert.equal(authenticated.isSuperAdmin, false);
});

test("support access is rejected when the platform account is no longer authorized", async () => {
  const authenticated = await resolveAuthenticatedUser(supportTokenUser, {
    findUser: async () => platformUser,
    superAdminEmails: ["different@ordynora.com"],
  });

  assert.equal(authenticated, null);
});

test("support access is rejected when platform identity claims do not match", async () => {
  const authenticated = await resolveAuthenticatedUser(
    { ...supportTokenUser, platformUserId: "another-user" },
    {
      findUser: async () => platformUser,
      superAdminEmails: ["support@ordynora.com"],
    }
  );

  assert.equal(authenticated, null);
});

test("regular users still cannot switch tenant through the token", async () => {
  const authenticated = await resolveAuthenticatedUser(
    {
      userId: "owner-1",
      email: "owner@example.com",
      restaurantId: "restaurant-b",
      role: "owner",
      isSuperAdmin: false,
      impersonating: false,
    },
    {
      findUser: async () => ({
        id: "owner-1",
        email: "owner@example.com",
        restaurantId: "restaurant-a",
        role: "owner",
        isActive: true,
      }),
      superAdminEmails: [],
    }
  );

  assert.equal(authenticated, null);
});
