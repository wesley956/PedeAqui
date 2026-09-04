#!/usr/bin/env bash
set -Eeuo pipefail

# Issue #830: disposable Supabase staging for controlled failure/retry tests.
# This script is intentionally local-only: it never links to or queries a hosted project.

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly local_db_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
readonly temporary_root="$(mktemp -d)"
readonly parked_migrations="${temporary_root}/migrations"
readonly parked_config="${temporary_root}/config.toml"

cleanup() {
  supabase stop --no-backup >/dev/null 2>&1 || true
  if [[ -d "${parked_migrations}" ]]; then
    mkdir -p "${project_root}/supabase"
    mv "${parked_migrations}" "${project_root}/supabase/migrations"
  fi
  if [[ -f "${parked_config}" ]]; then
    rm -f "${project_root}/supabase/config.toml"
    mv "${parked_config}" "${project_root}/supabase/config.toml"
  else
    rm -f "${project_root}/supabase/config.toml"
  fi
  rm -rf "${temporary_root}"
}
trap cleanup EXIT

command -v supabase >/dev/null || { echo "Supabase CLI is required." >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required." >&2; exit 1; }

cd "${project_root}"

# The dated files in supabase/migrations are production deltas already represented
# by the append-only canonical schema in supabase/sql. Parking them prevents a
# second application while the disposable database is bootstrapped.
if [[ -d supabase/migrations ]]; then
  mv supabase/migrations "${parked_migrations}"
fi
if [[ -f supabase/config.toml ]]; then
  mv supabase/config.toml "${parked_config}"
fi

supabase init --force
supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor

for schema_file in $(find supabase/sql -maxdepth 1 -type f -name '*.sql' -print | LC_ALL=C sort); do
  echo "ISOLATED_SCHEMA_APPLY=${schema_file}"
  psql "${local_db_url}" -X -v ON_ERROR_STOP=1 -f "${schema_file}" >/dev/null
done

# Prove that the disposable database survives a controlled infrastructure restart.
supabase stop
supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor
psql "${local_db_url}" -X -v ON_ERROR_STOP=1 -c "select 1" >/dev/null

readonly scenarios=(
  "supabase/tests/e2e_menu_to_kitchen.sql"
  "supabase/tests/e2e_cash_register.sql"
  "supabase/tests/e2e_pdv_to_kitchen.sql"
  "supabase/tests/quality_rls_isolation.sql"
)

for pass in 1 2 3; do
  echo "ISOLATED_CHAOS_PASS=${pass}/3"
  for scenario in "${scenarios[@]}"; do
    echo "ISOLATED_SCENARIO=${scenario}"
    psql "${local_db_url}" -X -v ON_ERROR_STOP=1 -f "${scenario}"
  done
done

echo "ISOLATED_CHAOS_RESULT=passed"
