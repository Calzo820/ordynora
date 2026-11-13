-- A display status on Order/TableSession is not a mutex: enqueuing a newer
-- revision may change it while an HTTP request is in flight. Serialize the
-- actual jobs instead, including across multiple backend instances.
-- Existing duplicate leases are fenced off and retried after the old lease
-- window. Provider identifiers stay deterministic for reconciliation.
BEGIN;
LOCK TABLE "PosIntegrationJob" IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "integrationId", "entityType", "entityId"
    ORDER BY "lockedAt" ASC NULLS LAST, "createdAt" ASC, "id" ASC
  ) AS lease_rank
  FROM "PosIntegrationJob"
  WHERE "status" = 'processing' AND "entityType" IS NOT NULL AND "entityId" IS NOT NULL
)
UPDATE "PosIntegrationJob" AS job
SET "status" = 'retrying',
    "nextAttemptAt" = GREATEST(NOW(), COALESCE(job."lockedAt", NOW()) + INTERVAL '2 minutes'),
    "lockedAt" = NULL,
    "lockToken" = NULL,
    "lastError" = 'Invio concorrente recuperato durante aggiornamento V15',
    "updatedAt" = NOW()
FROM ranked
WHERE job."id" = ranked."id" AND ranked.lease_rank > 1;

CREATE UNIQUE INDEX "PosIntegrationJob_one_processing_entity"
ON "PosIntegrationJob" ("integrationId", "entityType", "entityId")
WHERE "status" = 'processing' AND "entityType" IS NOT NULL AND "entityId" IS NOT NULL;

COMMIT;
