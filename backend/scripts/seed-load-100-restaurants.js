import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../lib/prisma.js";

if (String(process.env.LOAD_TEST_ALLOW_SEED || "").toLowerCase() !== "true") {
  console.error("Seed annullato: imposta LOAD_TEST_ALLOW_SEED=true solo su un database staging dedicato.");
  process.exit(2);
}

const outputFile = path.resolve(process.env.LOAD_TEST_FIXTURES_FILE || "./load-test-fixtures.json");
const fixtures = [];

try {
  for (let index = 1; index <= 100; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const slug = `ordynora-load-${suffix}`;
    const restaurant = await prisma.restaurant.upsert({
      where: { slug },
      update: { isActive: true },
      create: { name: `Load Test ${suffix}`, slug, isActive: true, plan: "enterprise" },
    });
    await prisma.saaSSubscription.upsert({
      where: { restaurantId: restaurant.id },
      update: { status: "active", plan: "enterprise", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) },
      create: { restaurantId: restaurant.id, status: "active", plan: "enterprise", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) },
    });
    const table = await prisma.table.upsert({
      where: { restaurantId_code: { restaurantId: restaurant.id, code: "LT1" } },
      update: { isActive: true },
      create: { restaurantId: restaurant.id, name: "Tavolo Load", code: "LT1", seats: 4, isActive: true },
    });
    let menuItem = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name: "Prodotto Load", isDeleted: false },
    });
    if (!menuItem) {
      menuItem = await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          name: "Prodotto Load",
          shortDescription: "Prodotto sintetico per test di carico",
          price: 10,
          category: "Test",
          preparationArea: "kitchen",
          isAvailable: true,
        },
      });
    }
    fixtures.push({ restaurantSlug: slug, tableToken: table.qrToken, menuItemId: menuItem.id });
    if (index % 10 === 0) console.log(`Fixture create: ${index}/100`);
  }
  await fs.writeFile(outputFile, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");
  console.log(`Fixture salvate in ${outputFile}`);
} finally {
  await prisma.$disconnect();
}
