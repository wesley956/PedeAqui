-- iFood order lifecycle command runtime (#940).
-- Provider commands are leased only by the worker responsible for that provider
-- and capability. This prevents a future catalog/logistics/99 worker from
-- consuming another integration's outbox rows.

create or replace function public.integration_claim_outbox_scoped(
  p_limit integer,
  p_worker_id text,
  p_provider text,
  p_capability text,
  p_lease_seconds integer default 120
)
returns setof public.integration_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required';
  end if;
  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'provider is required';
  end if;
  if p_capability is null or btrim(p_capability) = '' then
    raise exception 'capability is required';
  end if;

  return query
  with candidates as (
    select o.id
    from public.integration_outbox o
    where o.provider = p_provider
      and o.capability = p_capability
      and (
        (o.status in ('pending', 'retry') and o.available_at <= now())
        or (
          o.status = 'processing'
          and o.locked_at is not null
          and o.locked_at <= now() - make_interval(secs => greatest(p_lease_seconds, 30))
        )
      )
    order by o.available_at asc, o.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 100))
  )
  update public.integration_outbox o
     set status = 'processing',
         attempts = o.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_error = null,
         last_error_kind = null
    from candidates c
   where o.id = c.id
  returning o.*;
end;
$$;

revoke all on function public.integration_claim_outbox_scoped(integer, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.integration_claim_outbox_scoped(integer, text, text, text, integer)
  to service_role;

comment on function public.integration_claim_outbox_scoped(integer, text, text, text, integer) is
  'Atomically leases due provider commands for one provider/capability pair with stale-lease recovery.';
