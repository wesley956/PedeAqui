// Isolated, synthetic HTTP benchmark. No external connections or live data.
// This deliberately exercises health and a static legal page; NOT checkout/DB throughput.
const targets = [
  { path: '/api/health', expected: 200 },
  { path: '/politica-de-privacidade', expected: 200 },
];
const totalPerTarget = 100;
const concurrency = 10;
const reports = [];
for (const target of targets) {
  const latencies = [];
  let next = 0;
  let failures = 0;
  async function worker() {
    while (next < totalPerTarget) {
      next += 1;
      const started = performance.now();
      try {
        const response = await fetch('http://127.0.0.1:3000' + target.path, {
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        });
        if (response.status !== target.expected) failures += 1;
        await response.arrayBuffer();
      } catch (error) {
        failures += 1;
        console.error('BENCH_REQUEST_FAILED', target.path, String(error));
      }
      latencies.push(performance.now() - started);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  latencies.sort((a, b) => a - b);
  reports.push({
    path: target.path, requests: totalPerTarget, concurrency, failures,
    p95Ms: Math.round(latencies[Math.ceil(latencies.length * 0.95) - 1]),
    maxMs: Math.round(latencies.at(-1)),
  });
}
console.log(JSON.stringify({ kind: 'localhost_nonproduction_microbenchmark',
  reports, limitations: 'Synthetic requests only; no DB, payments, menus, orders, print or WhatsApp.' }));
if (reports.some(r => r.failures > 0 || r.p95Ms > 5000)) process.exit(1);
