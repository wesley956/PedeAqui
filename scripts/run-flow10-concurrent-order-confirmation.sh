#!/usr/bin/env bash
set -Eeuo pipefail

readonly database_url="${1:?database URL is required}"
readonly pass_number="${2:?pass number is required}"
readonly run_token="$(date +%s)-${RANDOM}-${pass_number}"
readonly fixture_slug="flow10-close-message-${run_token}"
readonly cart_token="$(printf '%s' "${fixture_slug}:cart" | md5sum | cut -d' ' -f1)$(printf '%s' "${fixture_slug}:cart-b" | md5sum | cut -d' ' -f1)"
readonly access_token="$(printf '%s' "${fixture_slug}:access" | md5sum | cut -d' ' -f1)$(printf '%s' "${fixture_slug}:access-b" | md5sum | cut -d' ' -f1)"
readonly temporary_root="$(mktemp -d)"

cleanup() {
  find "${temporary_root}" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

psql "${database_url}" -X -v ON_ERROR_STOP=1 \
  -v fixture_slug="${fixture_slug}" \
  -f supabase/tests/e2e_flow10_close_message_order_setup.sql

readonly store_id="$(psql "${database_url}" -X -v ON_ERROR_STOP=1 -At \
  -c "select id from public.stores where slug='${fixture_slug}'")"

confirm_order() {
  local output_file="$1"
  psql "${database_url}" -X -v ON_ERROR_STOP=1 -At \
    -c "begin; select public.create_order_from_checkout_internal('${store_id}','${cart_token}','${access_token}','whatsapp'); select pg_sleep(2); commit;" \
    >"${output_file}"
}

confirm_order "${temporary_root}/confirmation-a.log" &
readonly confirmation_a_pid=$!
confirm_order "${temporary_root}/confirmation-b.log" &
readonly confirmation_b_pid=$!

wait "${confirmation_a_pid}"
wait "${confirmation_b_pid}"

readonly created_count="$(grep -hEc '"created"[[:space:]]*:[[:space:]]*true' "${temporary_root}"/*.log | awk '{sum += $1} END {print sum + 0}')"
readonly replay_count="$(grep -hEc '"created"[[:space:]]*:[[:space:]]*false' "${temporary_root}"/*.log | awk '{sum += $1} END {print sum + 0}')"
if [[ "${created_count}" -ne 1 || "${replay_count}" -ne 1 ]]; then
  echo "Expected one created result and one replay result; got created=${created_count}, replay=${replay_count}." >&2
  exit 1
fi

mapfile -t order_ids < <(grep -hoE '"order_id"[[:space:]]*:[[:space:]]*"[0-9a-f-]{36}"' "${temporary_root}"/*.log | grep -oE '[0-9a-f-]{36}')
if [[ "${#order_ids[@]}" -ne 2 || "${order_ids[0]}" != "${order_ids[1]}" ]]; then
  echo "Concurrent confirmations did not converge to the same order id." >&2
  exit 1
fi

echo "FLOW10_CLOSE_MESSAGE_CREATED_RESULTS=${created_count}"
echo "FLOW10_CLOSE_MESSAGE_REPLAY_RESULTS=${replay_count}"
echo "FLOW10_CLOSE_MESSAGE_ORDER_ID=${order_ids[0]}"

psql "${database_url}" -X -v ON_ERROR_STOP=1 \
  -v fixture_slug="${fixture_slug}" \
  -f supabase/tests/e2e_flow10_close_message_order_verify.sql
