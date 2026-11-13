import test from "node:test";
import assert from "node:assert/strict";
import {
  mappingTechnicalIssue,
  summarizeIntegrationMappings,
} from "../integrations/readiness.js";

const local = {
  menuItems: [
    { id: "menu-1", name: "Margherita", isAvailable: true, virtual: false },
    { id: "__extra__", name: "Extra", virtual: true, optional: true },
  ],
  tables: [{ id: "table-1", name: "Tavolo 1" }],
};

test("Cassa in Cloud requires a product variant even for a simple product", () => {
  const issue = mappingTechnicalIssue("teamsystem_cassa_in_cloud", "menu_item", {
    metadata: { idProduct: "product-1", idDepartment: "department-1", idTax: "tax-1" },
  });
  assert.equal(issue.kind, "incomplete");
  assert.deepEqual(issue.missingFields, ["idProductVariant"]);
});

test("activation readiness rejects mappings that exist but lack provider metadata", () => {
  const summary = summarizeIntegrationMappings({
    provider: "tilby",
    local,
    mappings: [
      {
        entityType: "menu_item",
        localId: "menu-1",
        externalId: "10",
        metadata: { department: { id: 2 }, vatPerc: 10 },
      },
      {
        entityType: "table",
        localId: "table-1",
        externalId: "7",
        metadata: { tableId: 7, tableName: "Tavolo 1" },
      },
    ],
  });
  assert.equal(summary.ready, false);
  assert.equal(summary.menu.mapped, 1);
  assert.equal(summary.tables.mapped, 0);
  assert.equal(summary.missing[0].kind, "incomplete");
  assert.deepEqual(summary.missing[0].missingFields, ["roomId", "roomName"]);
});

test("optional virtual rows do not block a technically complete setup", () => {
  const summary = summarizeIntegrationMappings({
    provider: "teamsystem_cassa_in_cloud",
    local,
    mappings: [
      {
        entityType: "menu_item",
        localId: "menu-1",
        externalId: "variant-1",
        metadata: {
          idProductVariant: "variant-1",
          idDepartment: "department-1",
          idTax: "tax-1",
        },
      },
      {
        entityType: "table",
        localId: "table-1",
        externalId: "table-remote-1",
        metadata: { tableId: "table-remote-1" },
      },
    ],
  });
  assert.equal(summary.ready, true);
  assert.equal(summary.missing.length, 0);
});
