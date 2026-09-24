create or replace function public.automation_sessions_expire_stale_internal(
  p_limit integer default 200,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_limit integer;
  v_candidates integer := 0;
  v_expired integer := 0;
begin
  v_limit := least(greatest(coalesce(p_limit, 200), 1), 1000);

  select count(*)
    into v_candidates
  from (
    select s.id
    from public.automation_sessions s
    where s.state = 'active'
      and s.expires_at is not null
      and s.expires_at < now()
    order by s.expires_at asc, s.id asc
    limit v_limit
  ) candidates;

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'dry_run', true,
      'candidates', v_candidates,
      'expired', 0,
      'limit', v_limit
    );
  end if;

  with stale as (
    select s.id
    from public.automation_sessions s
    where s.state = 'active'
      and s.expires_at is not null
      and s.expires_at < now()
    order by s.expires_at asc, s.id asc
    limit v_limit
    for update skip locked
  )
  update public.automation_sessions target
     set state = 'expired',
         version = target.version + 1,
         updated_at = now()
    from stale
   where target.id = stale.id
     and target.state = 'active'
     and target.expires_at is not null
     and target.expires_at < now();

  get diagnostics v_expired = row_count;

  return jsonb_build_object(
    'dry_run', false,
    'candidates', v_candidates,
    'expired', v_expired,
    'limit', v_limit
  );
end;
$function$;

revoke all on function public.automation_sessions_expire_stale_internal(integer, boolean) from public;
revoke all on function public.automation_sessions_expire_stale_internal(integer, boolean) from anon;
revoke all on function public.automation_sessions_expire_stale_internal(integer, boolean) from authenticated;
grant execute on function public.automation_sessions_expire_stale_internal(integer, boolean) to service_role;

comment on function public.automation_sessions_expire_stale_internal(integer, boolean) is
  'INT-EVOL-02 bounded/idempotent hygiene for automation sessions whose expires_at is already in the past. Dry-run is the default; never deletes conversations, messages, orders, or session context.';
