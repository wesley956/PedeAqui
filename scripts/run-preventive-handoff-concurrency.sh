#!/usr/bin/env bash
set -Eeuo pipefail

# Never accept a hosted database for these disposable fixtures.
readonly database_url="${1:?local database URL required}"
[[ "${database_url}" == 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' ]] || { echo 'local disposable DB required' >&2; exit 1; }
readonly pass_number="${2:?pass number required}"
readonly temporary_root="$(mktemp -d)"
readonly preventive="select public.conversation_preventive_handoff_internal('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000061','supplier_contact');"
readonly human="select public.conversation_transition_internal('f8000000-0000-4000-8000-000000000041','human','f8888888-8888-4888-8888-888888888888','technical concurrent assume',null,'panel');"

clear_fixture() {
  psql "${database_url}" -X -q -v ON_ERROR_STOP=1 -c "delete from public.organizations where id='f8000000-0000-4000-8000-000000000001'; delete from auth.users where id='f8888888-8888-4888-8888-888888888888';" >/dev/null
}
cleanup() {
  if [[ -n "${first_pid:-}" ]]; then wait "${first_pid}" 2>/dev/null || true; fi
  if [[ -n "${second_pid:-}" ]]; then wait "${second_pid}" 2>/dev/null || true; fi
  clear_fixture
  rm -rf "${temporary_root}"
}
trap cleanup EXIT

wait_for_database_event() {
  local name="$1" event_type="$2" event="$3" seen
  for attempt in {1..100}; do
    seen="$(psql "${database_url}" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='${event_type}' and wait_event='${event}';")"
    if [[ "${seen}" == '1' ]]; then return; fi
    sleep 0.05
  done
  echo "database synchronization failed: ${name} ${event_type}/${event}" >&2
  exit 1
}

for scenario in human_first preventive_first duplicate; do
  clear_fixture
  psql "${database_url}" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/e2e_preventive_handoff_concurrent_setup.sql >/dev/null
  first_sql="${preventive}"; second_sql="${human}"; expected_state=human; expected_history=2
  if [[ "${scenario}" == human_first ]]; then first_sql="${human}"; second_sql="${preventive}"; expected_history=1; fi
  if [[ "${scenario}" == duplicate ]]; then second_sql="${preventive}"; expected_state=waiting_agent; expected_history=1; fi
  first_name="preventive-first-${pass_number}-${scenario}"
  second_name="preventive-second-${pass_number}-${scenario}"
  PGAPPNAME="${first_name}" psql "${database_url}" -X -q -v ON_ERROR_STOP=1 -c "begin; ${first_sql} select pg_sleep(8); commit;" >"${temporary_root}/first.log" 2>&1 &
  first_pid=$!
  # PgSleep proves the first function already acquired and retained the row lock.
  wait_for_database_event "${first_name}" Timeout PgSleep
  PGAPPNAME="${second_name}" psql "${database_url}" -X -q -v ON_ERROR_STOP=1 -c "${second_sql}" >"${temporary_root}/second.log" 2>&1 &
  second_pid=$!
  # Prove real lock contention rather than two coincidentally serial calls.
  wait_for_database_event "${second_name}" Lock transactionid
  wait "${first_pid}"; first_pid=''
  wait "${second_pid}"; second_pid=''
  psql "${database_url}" -X -q -v ON_ERROR_STOP=1 -c "do \$\$ declare c public.conversations%rowtype; n int; begin
    select * into c from public.conversations where id='f8000000-0000-4000-8000-000000000041';
    if c.status <> '${expected_state}' then raise exception 'wrong final state'; end if;
    if c.status='human' and c.assigned_user_id is distinct from 'f8888888-8888-4888-8888-888888888888'::uuid then raise exception 'human owner lost'; end if;
    if c.human_attention_requested_at is not null or c.human_attention_reason_code is not null then raise exception 'unrequested attention'; end if;
    select count(*) into n from public.conversation_state_history where conversation_id=c.id;
    if n <> ${expected_history} then raise exception 'unexpected duplicate transition'; end if;
    if not exists(select 1 from public.automation_sessions where conversation_id=c.id and state='active' and step='order_payment' and context->>'cartToken'='technical-draft') then raise exception 'draft lost'; end if;
    if exists(select 1 from public.messages where conversation_id=c.id and direction='outbound') then raise exception 'unexpected auto reply'; end if;
  end; \$\$;"
  echo "PREVENTIVE_CONCURRENCY_PASS=${pass_number}:${scenario}:lock-observed:owner-draft-attention-safe"
done
