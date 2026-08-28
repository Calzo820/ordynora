import assert from "node:assert/strict";
import test from "node:test";
import { paginationMeta, parsePagination } from "../lib/queryPagination.js";
import { buildPlatformRestaurantWhere } from "../controllers/platform.controller.js";

test("pagination applica default e limiti massimi", () => {
  assert.deepEqual(parsePagination({}, { defaultLimit: 25, maxLimit: 100 }), {
    page: 1,
    limit: 25,
    skip: 0,
  });
  assert.deepEqual(parsePagination({ page: "4", limit: "999" }, { defaultLimit: 25, maxLimit: 100 }), {
    page: 4,
    limit: 100,
    skip: 300,
  });
});

test("metadata paginazione non espone pagine impossibili", () => {
  assert.deepEqual(paginationMeta({ page: 8, limit: 25, total: 51 }), {
    page: 3,
    limit: 25,
    total: 51,
    totalPages: 3,
    hasPrevious: true,
    hasNext: false,
    from: 51,
    to: 51,
  });
});

test("filtro piattaforma limita ricerca e piano", () => {
  const where = buildPlatformRestaurantWhere({ q: "Milano", status: "enterprise" });
  assert.equal(where.AND.length, 2);
  assert.equal(where.AND[1].plan, "enterprise");
  assert.equal(where.AND[0].OR[0].name.contains, "Milano");
});
