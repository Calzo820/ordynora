function boundedInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parsePagination(query = {}, options = {}) {
  const defaultLimit = boundedInteger(options.defaultLimit, 25, { min: 1, max: 250 });
  const maxLimit = boundedInteger(options.maxLimit, 100, { min: defaultLimit, max: 500 });
  const page = boundedInteger(query.page, 1, { min: 1, max: 1_000_000 });
  const limit = boundedInteger(query.limit, defaultLimit, { min: 1, max: maxLimit });

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function paginationMeta({ page, limit, total }) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    page: safePage,
    limit,
    total: safeTotal,
    totalPages,
    hasPrevious: safePage > 1,
    hasNext: safePage < totalPages,
    from: safeTotal === 0 ? 0 : (safePage - 1) * limit + 1,
    to: safeTotal === 0 ? 0 : Math.min(safeTotal, safePage * limit),
  };
}
