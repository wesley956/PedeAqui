// Offline-only progressive stress test for a loopback-bound PedeAqui container.
// No orders, database, customer data, payments, external websites or WhatsApp.
// These endpoints exercise the HTTP runtime, NOT actual restaurant workflows.
const base = 'http://127.0.0.1:3000';
const stages = [
  { concurrency: 10, perPath: 500 },
  { concurrency: 40, perPath: 1000 },
  { concurrency: 80, perPath: 2000 },
];
const paths = ['/api/health', '/politica-de-privacidade'];
const timeout = 8000;
const all = [];
const startedAt = performance.now();

for (const stage of stages) {
  for (const path of paths) {
    const durations = [];
    let next = 0, errors = 0, unexpectedStatus = 0;
    const started = performance.now();
    async function worker() {
      for (;;) {
        const requestNumber = next++;
        if (requestNumber >= stage.perPath) break;
        const t0 = performance.now();
        try {
          const r = await fetch(base + path, {
            cache: 'no-store',
            signal: AbortSignal.timeout(timeout),
          });
          await r.arrayBuffer();
          if (r.status !== 200) unexpectedStatus++;
        } catch (e) {
          errors++;
          if (errors <= 3) console.error('STRESS_FAILURE', path, String(e));
        } finally {
          durations.push(performance.now() - t0);
        }
      }
    }
    await Promise.all(Array.from({length: stage.concurrency}, () => worker()));
    durations.sort((a,b) => a-b);
    const elapsed = performance.now() - started;
    const p = quantile => Math.round(durations[Math.min(durations.length - 1, Math.ceil(durations.length * quantile) - 1)]);
    const result = {
      path, concurrency: stage.concurrency, requests: stage.perPath,
      errors, unexpectedStatus, p50Ms: p(.50), p95Ms: p(.95),
      p99Ms: p(.99), maxMs: p(1), elapsedMs: Math.round(elapsed),
      requestsPerSecond: Math.round(stage.perPath * 1000 / elapsed),
    };
    all.push(result);
    console.log('STRESS_STAGE', JSON.stringify(result));
    if (errors > 0 || unexpectedStatus > 0 || result.p95Ms > 3000) {
      console.error('STRESS_GATE_FAILED: offline HTTP stage did not meet acceptance threshold');
      process.exit(1);
    }
  }
}
console.log('STRESS_SUMMARY', JSON.stringify({
  totalRequests: all.reduce((n,x)=>n+x.requests,0),
  totalTimeMs: Math.round(performance.now() - startedAt),
  endpoints: paths,
  note: 'Synthetic loopback HTTP only. Not an estimate of throughput for real orders.',
}));
