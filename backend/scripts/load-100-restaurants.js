import fs from "node:fs/promises";

const apiUrl = String(process.env.LOAD_TEST_API_URL || "http://localhost:5000").replace(/\/$/, "");
const fixturesFile = String(process.env.LOAD_TEST_FIXTURES_FILE || "").trim();
const iterations = Math.max(1, Math.min(20, Number(process.env.LOAD_TEST_ITERATIONS || 3)));

if (String(process.env.LOAD_TEST_ALLOW_WRITE || "").toLowerCase() !== "true") {
  console.error("Test annullato: imposta LOAD_TEST_ALLOW_WRITE=true solo su staging con database dedicato.");
  process.exit(2);
}
if (!fixturesFile) {
  console.error("Indica LOAD_TEST_FIXTURES_FILE con almeno 100 ristoranti, tavoli e prodotti di staging.");
  process.exit(2);
}

const fixtures = JSON.parse(await fs.readFile(fixturesFile, "utf8"));
if (!Array.isArray(fixtures) || fixtures.length < 100) {
  throw new Error("Servono almeno 100 fixture distinte.");
}

const tenants = fixtures.slice(0, 100);
const tenantKeys = new Set(tenants.map((item) => item.restaurantSlug));
if (tenantKeys.size !== 100) throw new Error("Le fixture devono appartenere a 100 ristoranti distinti.");

async function call(path, options = {}) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${apiUrl}${path}`, options);
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, ms: performance.now() - startedAt, body };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - startedAt, error: error.message };
  }
}

const readiness = await call("/ready");
if (!readiness.ok) throw new Error(`Backend non pronto: HTTP ${readiness.status}`);

const results = [];
for (let iteration = 0; iteration < iterations; iteration += 1) {
  const batch = await Promise.all(tenants.map((fixture, index) => {
    const requestId = `load100:${Date.now()}:${iteration}:${index}`;
    return call("/orders/public", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
      body: JSON.stringify({
        restaurantSlug: fixture.restaurantSlug,
        tableToken: fixture.tableToken,
        clientRequestId: requestId,
        notes: "Test di carico staging Ordynora",
        items: [{ menuItemId: fixture.menuItemId, quantity: 1, courseNumber: 1 }],
      }),
    });
  }));
  results.push(...batch);
}

const latencies = results.map((result) => result.ms).sort((a, b) => a - b);
const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] || 0;
const failures = results.filter((result) => !result.ok);
const report = {
  ok: failures.length === 0 && percentile(0.95) < 2000,
  tenants: 100,
  requests: results.length,
  failures: failures.length,
  errorRatePercent: Number(((failures.length / results.length) * 100).toFixed(2)),
  latencyMs: {
    p50: Math.round(percentile(0.5)),
    p95: Math.round(percentile(0.95)),
    p99: Math.round(percentile(0.99)),
    max: Math.round(latencies.at(-1) || 0),
  },
  statuses: results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, {}),
  acceptance: "0 errori e p95 sotto 2000 ms, dopo il warm-up, sul piano Render scelto",
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
