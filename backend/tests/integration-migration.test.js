import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("V15 exclusive-job migration runs on PostgreSQL in memory", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TYPE "IntegrationJobStatus" AS ENUM ('pending', 'processing', 'retrying', 'succeeded', 'blocked', 'failed');
      CREATE TABLE "PosIntegrationJob" (
        "id" TEXT PRIMARY KEY, "integrationId" TEXT NOT NULL, "entityType" TEXT, "entityId" TEXT,
        "status" "IntegrationJobStatus" NOT NULL, "lockedAt" TIMESTAMPTZ, "lockToken" TEXT,
        "nextAttemptAt" TIMESTAMPTZ, "lastError" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO "PosIntegrationJob" ("id", "integrationId", "entityType", "entityId", "status", "lockedAt", "lockToken")
      VALUES ('first', 'pos-1', 'table_session', 'session-1', 'processing', NOW() - INTERVAL '1 minute', 'lease-first'),
             ('duplicate', 'pos-1', 'table_session', 'session-1', 'processing', NOW(), 'lease-duplicate'),
             ('other-restaurant', 'pos-2', 'table_session', 'session-1', 'processing', NOW(), 'lease-other');
    `);
    const migration = await readFile(new URL("../prisma/migrations/20261106120000_integration_exclusive_jobs/migration.sql", import.meta.url), "utf8");
    await db.exec(migration);

    await t.test("the oldest lease is preserved and only duplicates are fenced off", async () => {
      const { rows } = await db.query('SELECT * FROM "PosIntegrationJob" ORDER BY "id"');
      const first = rows.find((row) => row.id === "first");
      const duplicate = rows.find((row) => row.id === "duplicate");
      assert.equal(first.status, "processing");
      assert.equal(first.lockToken, "lease-first");
      assert.equal(duplicate.status, "retrying");
      assert.equal(duplicate.lockToken, null);
      assert.equal(duplicate.lockedAt, null);
      assert.ok(new Date(duplicate.nextAttemptAt) > new Date());
      assert.equal(rows.find((row) => row.id === "other-restaurant").status, "processing");
    });

    await t.test("PostgreSQL rejects a second processing job for the same entity", async () => {
      await assert.rejects(() => db.query('UPDATE "PosIntegrationJob" SET "status" = $1 WHERE "id" = $2', ["processing", "duplicate"]),
        (error) => error.code === "23505");
    });

    await t.test("completing the first lease allows the next revision", async () => {
      await db.query('UPDATE "PosIntegrationJob" SET "status" = $1 WHERE "id" = $2', ["succeeded", "first"]);
      await db.query('UPDATE "PosIntegrationJob" SET "status" = $1 WHERE "id" = $2', ["processing", "duplicate"]);
      const { rows } = await db.query('SELECT "id" FROM "PosIntegrationJob" WHERE "integrationId" = $1 AND "status" = $2', ["pos-1", "processing"]);
      assert.deepEqual(rows, [{ id: "duplicate" }]);
    });
  } finally {
    await db.close();
  }
});
