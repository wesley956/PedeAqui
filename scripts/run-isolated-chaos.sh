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

# Hosted Supabase has pg_cron enabled for the scheduler migrations. Enable the
# same bundled extension explicitly in the disposable local database.
psql "${local_db_url}" -X -v ON_ERROR_STOP=1 \
  -c "create extension if not exists pg_cron with schema extensions" >/dev/null

while IFS= read -r schema_name; do
  schema_file="supabase/sql/${schema_name}"
  echo "ISOLATED_SCHEMA_APPLY=${schema_file}"
  psql "${local_db_url}" -X -v ON_ERROR_STOP=1 -f "${schema_file}" >/dev/null
done < <(find supabase/sql -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort -t_ -k1,1n -k2,2)

# New unpromoted OMNI deltas are not yet represented in supabase/sql. Apply only
# these explicitly so this disposable gate actually validates the same SQL that
# the PR proposes without replaying historical migrations already in the baseline.
readonly isolated_delta_migrations=(
  "20260906044000_omnichannel_integration_core.sql"
  "20260906050000_omnichannel_runtime_claims.sql"
  "20260906054000_omnichannel_canonical_order_import.sql"
  "20260906054500_omnichannel_external_discount_compat.sql"
  "20260906055000_omnichannel_external_order_side_effect_guards.sql"
  "20260906055500_omnichannel_capability_scoped_claims.sql"
  "20260906060000_omnichannel_external_snapshot_pii_minimization.sql"
  "20260906060500_omnichannel_merchant_scoped_identity.sql"
  "20260906061000_omnichannel_external_event_ordering_guard.sql"
  "20260907162000_ifood_auth_onboarding.sql"
)
for migration_name in "${isolated_delta_migrations[@]}"; do
  migration_file="${parked_migrations}/${migration_name}"
  if [[ -f "${migration_file}" ]]; then
    echo "ISOLATED_DELTA_APPLY=${migration_name}"
    psql "${local_db_url}" -X -v ON_ERROR_STOP=1 -f "${migration_file}" >/dev/null
  fi
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
  "supabase/tests/e2e_omnichannel_runtime.sql"
  "supabase/tests/e2e_omnichannel_external_order_import.sql"
  "supabase/tests/e2e_omnichannel_external_order_side_effects.sql"
  "supabase/tests/e2e_omnichannel_capability_claims.sql"
  "supabase/tests/e2e_omnichannel_external_snapshot_pii.sql"
  "supabase/tests/e2e_omnichannel_merchant_identity_replay.sql"
  "supabase/tests/e2e_omnichannel_out_of_order_events.sql"
  "supabase/tests/e2e_ifood_auth_onboarding.sql"
)

for pass in 1 2 3; do
  echo "ISOLATED_CHAOS_PASS=${pass}/3"
  for scenario in "${scenarios[@]}"; do
    echo "ISOLATED_SCENARIO=${scenario}"
    psql "${local_db_url}" -X -v ON_ERROR_STOP=1 -f "${scenario}"
  done
done

echo "ISOLATED_CHAOS_RESULT=passed"
