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
supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor
psql "$db" -X -q -v ON_ERROR_STOP=1 -c "create extension if not exists pg_cron with schema extensions" >/dev/null

while IFS= read -r f; do
  psql "$db" -X -q -v ON_ERROR_STOP=1 -f "supabase/sql/$f" >/dev/null || { echo "SCHEMA_FAIL $f"; exit 1; }
done < <(find supabase/sql -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort -t_ -k1,1n -k2,2)

# Deltas de produção ainda não incorporados ao schema canônico: aplica cada um isolado; os que já existem falham e são ignorados.
applied=0; skipped=0
for f in $(ls "${parked}/migrations" | LC_ALL=C sort); do
  if psql "$db" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "${parked}/migrations/$f" >/dev/null 2>&1; then applied=$((applied+1)); else skipped=$((skipped+1)); fi
done
echo "MIGRATIONS_REPLAY applied=${applied} skipped=${skipped}"

eval "$(supabase status -o env | sed 's/^/export LOCAL_/')"
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
npm run build > mobile-audit-out/build.log 2>&1 || { tail -80 mobile-audit-out/build.log; exit 1; }
nohup npm run start -- --hostname 127.0.0.1 --port 3000 > mobile-audit-out/app.log 2>&1 &
for i in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:3000/login && break; sleep 2; done

PANEL_BASE="http://127.0.0.1:3000" PUBLIC_BASE="https://pedeaqui.pp.ua" node scripts/mobile-audit/audit.mjs 2>&1 | tee mobile-audit-out/audit.log
grep -iE "error|warn" mobile-audit-out/app.log | head -200 > mobile-audit-out/app-errors.log || true
