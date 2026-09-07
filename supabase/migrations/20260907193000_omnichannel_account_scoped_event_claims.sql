-- PedeAqui OMNI #939 — provider workers may only lease events for exact
-- (integration_account_id, store_id) scopes that the caller has already resolved
-- as connected + capability-enabled. The existing general-purpose
-- capability-scoped RPC remains unchanged.

create or replace function public.integration_claim_events_scoped(
  p_limit integer,
  p_worker_id text,
  p_integration_account_ids uuid[],
  p_store_ids uuid[],
  p_lease_seconds integer default 120,
  p_capabilities text[] default null
)
returns setof public.integration_events
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_worker_id is null or pg_catalog.btrim(p_worker_id) = '' then
    raise exception 'worker id is required';
  end if;

  -- Fail closed. A missing/empty or mismatched allowlist must never degrade into
  -- "all accounts" or a cross-product of independently allowed ids.
  if p_integration_account_ids is null
     or p_store_ids is null
     or pg_catalog.cardinality(p_integration_account_ids) = 0
     or pg_catalog.cardinality(p_integration_account_ids) <> pg_catalog.cardinality(p_store_ids)
     or exists (
       select 1
       from pg_catalog.unnest(p_integration_account_ids, p_store_ids)
         as allowed_scope(account_id, store_id)
       where account_id is null or store_id is null
     ) then
    raise exception 'integration account/store allowlist is required and must contain matching pairs';
  end if;

  if p_capabilities is not null and exists (
    select 1
    from pg_catalog.unnest(p_capabilities) as filtered_capability(value)
    where value is null or pg_catalog.btrim(value) = ''
  ) then
    raise exception 'capability filter contains an empty value';
  end if;

  return query
  with allowed_scopes as (
    select account_id, store_id
    from pg_catalog.unnest(p_integration_account_ids, p_store_ids)
      as allowed_scope(account_id, store_id)
  ),
  candidates as (
    select e.id
    from public.integration_events e
    where exists (
      select 1
      from allowed_scopes allowed
      where allowed.account_id = e.integration_account_id
        and allowed.store_id = e.store_id
    )
      and (
        (e.status in ('pending', 'retry') and e.available_at <= pg_catalog.now())
        or (
          e.status = 'processing'
          and e.locked_at is not null
          and e.locked_at <= pg_catalog.now()
            - pg_catalog.make_interval(secs => pg_catalog.greatest(p_lease_seconds, 30))
        )
      )
      and (p_capabilities is null or e.capability = any(p_capabilities))
    order by e.available_at asc, e.received_at asc
    for update skip locked
    limit pg_catalog.greatest(1, pg_catalog.least(pg_catalog.coalesce(p_limit, 1), 100))
  )
  update public.integration_events e
     set status = 'processing',
         attempts = e.attempts + 1,
         locked_at = pg_catalog.now(),
         locked_by = p_worker_id,
         last_error = null,
         last_error_kind = null
    from candidates c
   where e.id = c.id
  returning e.*;
end;
$$;

create index if not exists integration_events_account_store_capability_pending_idx
  on public.integration_events(integration_account_id, store_id, capability, status, available_at, received_at)
  where status in ('pending', 'retry', 'processing');

revoke all on function public.integration_claim_events_scoped(integer, text, uuid[], uuid[], integer, text[])
  from public, anon, authenticated;
grant execute on function public.integration_claim_events_scoped(integer, text, uuid[], uuid[], integer, text[])
  to service_role;

comment on function public.integration_claim_events_scoped(integer, text, uuid[], uuid[], integer, text[]) is
  'Atomically leases due inbox events only for explicit account/store pairs, with optional capability isolation. Empty or mismatched allowlists fail closed; execution is service-role only.';
