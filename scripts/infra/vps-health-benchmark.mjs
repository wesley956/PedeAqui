// Non-production local HTTP microbenchmark. Does NOT model real customers or DB load.
// Run only against a network-isolated homologation container.
const url = 'http://127.0.0.1:3000/api/health';
const total = 100;
const concurrency = 10;
const latencies = [];
let next = 0;
let failures = 0;
async function worker() {
  while (next < total) {
    next += 1;
    const started = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (response.status !== 200) failures += 1;
      await response.arrayBuffer();
    } catch (error) {
      failures += 1;
      console.error('BENCH_REQUEST_FAILED', String(error));
    }
    latencies.push(performance.now() - started);
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
latencies.sort((a, b) => a - b);
const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
console.log(JSON.stringify({
  test: 'isolated_health_endpoint_only',
  total, concurrency, failures,
  p95Ms: Math.round(p95),
  maxMs: Math.round(latencies.at(-1)),
  warning: 'synthetic localhost health test; no DB/checkout/printing/load equivalence',
}));
if (failures > 0 || p95 > 3000) process.exit(1);
