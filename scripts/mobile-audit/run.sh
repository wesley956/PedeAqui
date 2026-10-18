#!/usr/bin/env bash
# Auditoria mobile: Supabase local descartável + build de produção local + Playwright.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
readonly db="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
mkdir -p mobile-audit-out

parked="$(mktemp -d)"
mv supabase/migrations "${parked}/migrations"
[[ -f supabase/config.toml ]] && mv supabase/config.toml "${parked}/config.toml"
supabase init --force >/dev/null
supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor >/dev/null 2>&1
psql "$db" -X -q -v ON_ERROR_STOP=1 -c "create extension if not exists pg_cron with schema extensions" >/dev/null

while IFS= read -r f; do
  psql "$db" -X -q -v ON_ERROR_STOP=1 -f "supabase/sql/$f" >/dev/null 2>&1 || { echo "SCHEMA_FAIL $f"; exit 1; }
done < <(find supabase/sql -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort -t_ -k1,1n -k2,2)

# Mesmos deltas de produção que o teste isolado reaplica (os demais já estão no schema canônico;
# reaplicar todos sobrescreveria funções novas com versões antigas).
for f in 20260910162000_scheduled_product_promotions.sql 20260911180613_promotion_campaigns_v2.sql 20260912003740_whatsapp_direct_orders.sql 20260912051915_whatsapp_bot_presentation_settings.sql 20260915155500_int11_order_creation_channel.sql 20260916150000_wpp04_inbox_pagination.sql 20260917214500_wpp07_atomic_human_claim.sql 20260924064200_saas_06_private_promotion_schedule_rpc.sql; do
  psql "$db" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "${parked}/migrations/$f" >/dev/null 2>&1 || echo "MIGRATION_SKIPPED $f"
done

eval "$(supabase status -o env 2>/dev/null | sed 's/^/export LOCAL_/')"
export LOCAL_SUPABASE_URL="${LOCAL_API_URL}"
export LOCAL_ANON_KEY="${LOCAL_ANON_KEY:-${LOCAL_PUBLISHABLE_KEY:-}}"
export LOCAL_SERVICE_KEY="${LOCAL_SERVICE_ROLE_KEY:-${LOCAL_SECRET_KEY:-}}"
export AUDIT_EMAIL="dono.teste@example.com"
export AUDIT_PASSWORD="Auditoria-Mobile-2026"

ids="$(node scripts/mobile-audit/seed.mjs)"
echo "SEED_IDS ${ids}"
org="$(node -e "console.log(JSON.parse(process.argv[1]).org)" "$ids")"
store="$(node -e "console.log(JSON.parse(process.argv[1]).store)" "$ids")"
usr="$(node -e "console.log(JSON.parse(process.argv[1]).user)" "$ids")"
psql "$db" -X -v ON_ERROR_STOP=1 -v org="$org" -v store="$store" -v usr="$usr" -f scripts/mobile-audit/seed.sql 2>&1 | tee mobile-audit-out/seed.log

export NEXT_PUBLIC_SUPABASE_URL="${LOCAL_SUPABASE_URL}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${LOCAL_ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${LOCAL_SERVICE_KEY}"
export APP_URL="http://127.0.0.1:3000"
export LOGIN_GUARD_SECRET="mobile-audit-local-only"
# Só nesta cópia do CI: a política de segurança libera o Supabase local (http/ws em 127.0.0.1).
sed -i 's|"connect-src '"'"'self'"'"' https: wss:"|"connect-src '"'"'self'"'"' https: wss: http://127.0.0.1:54321 ws://127.0.0.1:54321"|' next.config.ts
grep -q "ws://127.0.0.1:54321" next.config.ts || { echo "CSP_PATCH_FAILED"; exit 1; }
npm run build > mobile-audit-out/build.log 2>&1 || { tail -80 mobile-audit-out/build.log; exit 1; }
nohup npm run start -- --hostname 127.0.0.1 --port 3000 > mobile-audit-out/app.log 2>&1 &
for i in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:3000/login && break; sleep 2; done

PANEL_BASE="http://127.0.0.1:3000" PUBLIC_BASE="https://pedeaqui.pp.ua" node scripts/mobile-audit/audit.mjs 2>&1 | tee mobile-audit-out/audit.log
grep -iE "error|warn" mobile-audit-out/app.log | head -200 > mobile-audit-out/app-errors.log || true

# Fotos que apontam para o projeto antigo do Supabase: o servidor ainda responde?
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 20 "https://zsbsczjhiujnhdznrzck.supabase.co/storage/v1/object/public/catalog-media/6f282251-4f23-4a27-877d-d4a61220269c/a7ee30dc-3bad-4ebd-9fcc-c71cdc76574b/product/06bd939e-814f-40df-af1e-45aa18e8969e.webp" > mobile-audit-out/old-image-check.txt 2>&1 || true
