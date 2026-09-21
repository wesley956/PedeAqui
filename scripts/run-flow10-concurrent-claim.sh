#!/usr/bin/env bash
set -Eeuo pipefail

readonly database_url="${1:?database URL is required}"
readonly pass_number="${2:?pass number is required}"
readonly run_token="$(date +%s)-${RANDOM}-${pass_number}"
readonly fixture_slug="flow10-concurrency-${run_token}"
readonly worker_a="flow10-worker-a-${run_token}"
readonly worker_b="flow10-worker-b-${run_token}"
readonly temporary_root="$(mktemp -d)"

cleanup() {
  find "${temporary_root}" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

psql "${database_url}" -X -v ON_ERROR_STOP=1 \
  -v fixture_slug="${fixture_slug}" \
  -f supabase/tests/e2e_order_notification_concurrent_claim_setup.sql

claim_jobs() {
  local worker_id="$1"
  local output_file="$2"
  psql "${database_url}" -X -v ON_ERROR_STOP=1 -At \
    -c "begin; select id from public.order_notification_claim_internal('${worker_id}',10); select pg_sleep(2); commit;" \
    >"${output_file}"
}

claim_jobs "${worker_a}" "${temporary_root}/worker-a.log" &
readonly worker_a_pid=$!
claim_jobs "${worker_b}" "${temporary_root}/worker-b.log" &
readonly worker_b_pid=$!

wait "${worker_a_pid}"
wait "${worker_b_pid}"

echo "FLOW10_CONCURRENT_WORKER_A_CLAIMS=$(grep -Ec '^[0-9a-f-]{36}$' "${temporary_root}/worker-a.log")"
echo "FLOW10_CONCURRENT_WORKER_B_CLAIMS=$(grep -Ec '^[0-9a-f-]{36}$' "${temporary_root}/worker-b.log")"

psql "${database_url}" -X -v ON_ERROR_STOP=1 \
  -v fixture_slug="${fixture_slug}" \
  -v worker_a="${worker_a}" \
  -v worker_b="${worker_b}" \
  -f supabase/tests/e2e_order_notification_concurrent_claim_verify.sql
