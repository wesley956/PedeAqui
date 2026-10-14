# PedeAqui — VPS homologation (US$20 monthly hard budget)

Status: **configuration draft only; not deployed or load-tested.**

## Constraints and billing gate
- **Do not buy any VPS** until monthly base + mandatory IPv4 + tax + backup + worst-case extra transfer fit within US$20. Infrastructure providers may bill transfer overruns; a quoted US$12 plan is **not** a hard cap.
- Do not alter DNS, Supabase, production environment, webhooks, Meta/PagBank callbacks or the production print agents.
- The baseline uses Node >=22, Next 16, SSR and Server Actions. A static-only host is not equivalent.
- Build memory can exceed runtime memory; build in isolated CI or a larger short-lived builder if necessary, but its cost must be budgeted.

## Isolation rules (mandatory)
1. Use a separate test Supabase project (or test-only data with demonstrated isolation). **Never point a running homologation instance to live database keys.**
2. Create local .env.vps (never commit) from reviewed environment variable **names**. Store secrets only on the server's protected disk or secret manager. Never reuse production credentials for test side effects.
3. Do not invoke /api/internal/order-notifications from a cron during homologation. It can send WhatsApp notifications. Production's one-minute cron remains at Vercel until controlled cutover.
4. Do not register Meta/WhatsApp/PagBank public webhooks against the staging host. Use test endpoints, fake providers and non-production credentials.
5. Do not connect the existing Windows PrintAgent machines to staging. Validate print job claim/ack with a dedicated test agent.
6. Restrict host access to trusted IPs and HTTPS via a reverse proxy. Compose only binds 127.0.0.1:3000; it is **not** a public deployment.
7. /api/health checks essential environment variable presence only; it does not verify database connectivity, message delivery, health of background jobs or print-agent integration.

## Local/isolated smoke test (after environment provisioned)
```sh
docker compose -f compose.vps-homolog.yml build
docker compose -f compose.vps-homolog.yml up -d
docker compose -f compose.vps-homolog.yml ps
curl -fsS http://127.0.0.1:3000/api/health
docker stats --no-stream
docker compose -f compose.vps-homolog.yml logs --tail=100
```

Environment-dependent Next.js compile-time public variables may require dedicated build args/configuration, subject to source audit. The above commands have **not been executed**. This configuration is an initial candidate, not a production-ready release.

## Acceptance gates
- [ ] Final all-in price quoted with **no automatic billable overruns** or externally enforced cap; budget <= US$20.
- [ ] Clean build, boot and restart; test CPU + peak resident memory, including 2 GB VPS with OS overhead.
- [ ] Measure p95 latency, concurrent sessions, orders/minute and request throughput against real workloads.
- [ ] Test cardápio, login, checkout, cash/PIX, mesas, PDV, RLS, images, print agent, order history and stock with synthetic orders.
- [ ] Test safe retry/idempotency of payment and WhatsApp webhooks.
- [ ] Validate cron behavior with exactly one active producer at cutover; no duplicate order messages.
- [ ] Inspect disk usage, log rotation, backups and restore; validate recovery from VM restart.
- [ ] TLS, firewall, DNS TTL, external OAuth callbacks, rollback and offsite backup reviewed.
- [ ] Explicit production approval. No merge or cutover from this draft PR.

## Observations from Vercel and repo
- Vercel runtime log grouping (7-day window checked 2026-10-14) showed `/api/webhooks/whatsapp` as top logged path (337 log records); this count is **not** billable invocation volume.
- Vercel billed activity includes Observability Events, build CPU, Fluid CPU/memory and transfers.
- `vercel.json` schedules `/api/internal/order-notifications` each minute, with `CRON_SECRET`; route processes batches up to 25 notifications.
- Repo webhook uses Node.js crypto and Next.js `after()`; validate task-completion lifecycle on VPS.
- Supabase reference in legacy README may be stale. Validate authoritative active project separately, without exposing secrets.

## Audit addendum — 2026-10-14
- The repository has **no** `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` or Bun lockfile in the default branch. Initial `npm ci` Docker build would fail. Draft Dockerfile now runs `npm install` solely to enable experimentation; before production, generate/review a committed lockfile and switch to `npm ci`.
- Current DigitalOcean Basic 2 GiB/1 vCPU is advertised at $12/month with 2,000 GiB included; 2 GiB/2 vCPUs is $18/month. Outbound excess is $0.01/GiB, and spend alerts **do not stop usage or charges**. These are not hard-bounded monthly totals.
- Hetzner European CX33 pricing after June 15, 2026 is advertised at $9.99/month **excluding IPv4 and taxes**, with more RAM/vCPUs than the 2 GiB DigitalOcean candidate. Verify CPU shared-resource performance, actual region latency, network limits and legal tax/addons before selecting; quoted base costs alone are insufficient.
- No local Docker engine, remote VPS, representative traffic data, or isolated test database has been provisioned as part of this change; **no performance or successful container build is claimed**.
- Existing `/api/health` only checks environment key presence; do not treat it as real readiness or full system health. Check Supabase access and dependencies separately.
- Protect testing from production side effects. The staging Compose is loopback-bound and has **no cron schedule**. When ultimately switching hosts, ensure Vercel cron is disabled before enabling the new scheduler.

## Heavy synthetic HTTP test verified — GitHub run 38525400698 (2026-10-14)
Run completed with **success**. Container configured with a 1.5 GiB memory limit and 0.9 vCPU. No external network, database, payment or WhatsApp services were exercised.

| Concurrency | Endpoint | Requests | HTTP / network errors | p95 | Requests/sec |
| --- | --- | ---: | ---: | ---: | ---: |
| 10 | /api/health | 500 | 0 | 95ms | 215 |
| 10 | /politica-de-privacidade | 500 | 0 | 88ms | 201 |
| 40 | /api/health | 1,000 | 0 | 214ms | 279 |
| 40 | /politica-de-privacidade | 1,000 | 0 | 268ms | 232 |
| 80 | /api/health | 2,000 | 0 | 342ms | 345 |
| 80 | /politica-de-privacidade | 2,000 | 0 | 398ms | 263 |

Aggregate 7,000 requests completed in ~26.1 seconds across six sequential stages; this is **not** sustained full-store transaction throughput. `docker stats` showed **151.3 MiB** before the staged stress and **192.9 MiB** after. These are snapshots, *not peak resident memory*; the reported CPU snapshots (~0.01%) were taken after the load and should not be treated as CPU utilization during stress. CI runner hardware and localhost latency do not model real VPS networking.

### Next real integration load gate — NOT YET RUN
1. Use a dedicated Supabase test project with separate organization/store IDs, login accounts, storage and RLS. No live data copy without anonymization and authorization.
2. Disable all real side effects: WhatsApp, PagBank/other payment webhooks, production fiscal endpoints, production emails, real printers, scheduled jobs and other third parties. Use mocks or sandbox credentials.
3. Provision an isolated test host and record CPU/RAM *peaks* every 1s, process restarts/OOM, database connections and request traces. Configure staging host name and TLS only after ensuring sandbox isolation.
4. Reproduce operational flows with synthetic stores: menu/category search, cart add/update/delete, delivery/pickup, cash change, order submission, PDV payment, order status transitions, KDS, table and dispatch operations, print enqueue/claim/ack via a synthetic PrintAgent.
5. Progressive throughput tests at 5/10/25/50 simultaneous workflows with controlled ramp-up and capped order volume. Capture per-flow failures, duplicated orders, unexpected charges, p50/p95/p99, peak process memory, worker queue lag and DB utilization.
6. Use a clear safety stop: any external side effect, real customer data modification, unbounded queue, high error rate, unexpected duplicate, or resource exhaustion pauses the test automatically. Do not interpret simple endpoint metrics as proof that the above flows passed.
7. Validate restore, provider contract and billing hard-cap protection before any switch. Preserve Vercel until explicit production cutover approval.

**Deployment remains blocked** pending real integration proof, all-in price and user approval.

## Domain-rule stress gate (created 2026-10-14; result pending)
- New `tests/vps-domain-stress.test.ts` exercises 150,000 deterministic CPU-only validations: 50k successful delivery/pickup checkout reviews, 50k rejection cases (inadequate cash/change, closed store, invalid delivery quote), and 50k order/payment/production transition checks.
- Workflow adds `npx vitest run tests/vps-domain-stress.test.ts` as a blocking gate before build. Current GitHub Actions run: #38526243953, pending at last check.
- **Scope**: no database write, no queues, no real checkout HTTP requests, no third-party services. This confirms correctness under many calls to pure rules, NOT multi-restaurant load, latency or transactional safety.
- Hard production gate remains an isolated Supabase environment with synthetic stores, payment sandboxes, fake WhatsApp and fake print agents; require explicit spend and resource approval to provision any test infrastructure.

## Performance acceptance — 2026-10-14
Priority: speed for customer menu, checkout, PDV and order status, not merely ability to boot. The existing 7k-request localhost result (up to 398 ms p95, 80 concurrent) is a nonproduction HTTP microbenchmark and should **not** be used to predict user-facing latency across the internet or database round-trips.

- The VPS workflow now samples `docker stats` each second during synthetic stress and reports maximum **sampled** RAM and CPU percentages. It stops when sampled memory reaches 90% of the 1.5 GiB container limit or benchmark fails. Measurements do not capture sub-second peaks or VMs' host resources.
- New workflow run #38527368899; results pending at the time this file was committed.
- For operational acceptance, capture and compare **the same** representative browser, mobile and PDV workflows against Vercel and candidate VPS, with regional RTT and test-only Supabase. Record p50/p95/p99, endpoint TTFB, actual action confirmation times, server RAM peaks, DB roundtrips, queues and failures.
- Suggested **provisional** targets (not measured): p95 menu <=1.5s, PDV/status <=1s, checkout <=2s, no material regression against current production equivalent. Agree targets using real baselines before approving cutover.
- Do not launch heavy requests against production, payment providers, WhatsApp, or live customer Supabase. Separate budget for any staging project/server.

## Measured CPU and RAM during stress — final CI verification 2026-10-14

GitHub Actions run **38527416990** completed **success**. All validation stages passed, including 150k pure checkout/order-state checks, repeated multi-store contract suites 3x, Next build, Docker build, boot, 200-request microbenchmark, and a 7,000-request staged synthetic HTTP benchmark. Image size **750,212,081 bytes**.

Boundaries: Docker cgroup restricted to **0.9 CPU** and **1.5 GiB RAM**; network disabled; no real DB, Pix, WhatsApp, production browser, kitchen printer or internet RTT. Performance cannot be extrapolated into a production capacity claim.

| Concurrent | HTTP health p95 | Public static page p95 | Errors |
| --- | ---: | ---: | ---: |
| 10 | 106ms | 92ms | 0 |
| 40 | 259ms | 289ms | 0 |
| 80 | 377ms | 414ms | 0 |

Aggregate: 7k sequential-stage requests, ~27.0 seconds, **0 errors**.

**Peak sampled during load** (1-second collection intervals): RAM **17.65%** of 1.5GiB cap (~271MiB at sampled maximum), Docker CPU **93.47%** (close to one CPU core; this is Docker CPU% not percentage of the 0.9 limit), with **10 samples**. These sampled percentages do not catch sub-second spikes. One-vCPU VPS is **not production-approved** on this evidence: CPU may be a bottleneck when adding Supabase network RTT and real order processing.

### Infrastructure candidate decision (as of 2026-10-14)
- DigitalOcean Basic 2 GiB/1 vCPU: $12/mo base, 2,000 GiB transfer allowance; leaves $8 before taxes, backup or overage. Less desirable for CPU-heavy operation.
- DigitalOcean Basic 2 GiB/2 vCPU: $18/mo base, 3,000 GiB transfer; leaves just $2 margin before extras. Not a safe all-in <$20 guarantee.
- Hetzner CX33 Europe: $9.99/mo base after June 15 2026 price update, excluding IPv4 and tax; more CPU and RAM, but latency to São Paulo Supabase and clients remains unmeasured. Also not hard-capped against traffic overages.
- Supplier cloud cost alerts are **not spend caps**. Need commercial quote or external enforced control for the non-negotiable $20 all-in budget. Double-running with Vercel adds migration-month costs.
- No actual VPS, separate Supabase database or test customer journey is provisioned, so a production migration is **NOT approved**. Next gate must involve authorized account provisioning (potential cost), sandbox keys, live-like order/PDV/print/WhatsApp mocks, comparison of p95 and CPU peak versus the Vercel control, and tested rollback.

**Recommendation: do not cut over yet.** This document closes the reproducible CI + offline stress investigation; it does **not** close the hosting migration.
