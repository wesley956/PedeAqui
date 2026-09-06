-- Omnichannel integration runtime hardening (#936).
-- Adds atomic worker leases, retry/dead-letter states and audited manual replay.

alter table public.integration_events
  drop constraint if exists integration_events_status_check;
update public.integration_events set status = 'retry' where status = 'failed';
alter table public.integration_events
  add constraint integration_events_status_check
  check (status in ('pending', 'processing', 'processed', 'ignored', 'retry', 'dead_letter'));
alter table public.integration_events
  add column if not exists last_error_kind text,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

alter table public.integration_outbox
  drop constraint if exists integration_outbox_status_check;
update public.integration_outbox set status = 'retry' where status = 'failed';
alter table public.integration_outbox
  add constraint integration_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'confirmed', 'retry', 'dead_letter'));
alter table public.integration_outbox
  add column if not exists last_error_kind text,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

drop index if exists public.integration_events_pending_idx;
create index integration_events_pending_idx
  on public.integration_events(status, available_at, received_at)
  where status in ('pending', 'retry', 'processing');

drop index if exists public.integration_outbox_pending_idx;
create index integration_outbox_pending_idx
  on public.integration_outbox(status, available_at, created_at)
  where status in ('pending', 'retry', 'processing');

create or replace function public.integration_claim_events(
  p_limit integer,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.integration_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required';
  end if;

  return query
  with candidates as (
    select e.id
    from public.integration_events e
    where (
      (e.status in ('pending', 'retry') and e.available_at <= now())
      or (
        e.status = 'processing'
        and e.locked_at is not null
        and e.locked_at <= now() - make_interval(secs => greatest(p_lease_seconds, 30))
      )
    )
    order by e.available_at asc, e.received_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 100))
  )
  update public.integration_events e
     set status = 'processing',
         attempts = e.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_error = null,
         last_error_kind = null
    from candidates c
   where e.id = c.id
  returning e.*;
end;
$$;

create or replace function public.integration_finish_event(
  p_event_id uuid,
  p_worker_id text,
  p_status text,
  p_error_kind text default null,
  p_error text default null,
  p_available_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated uuid;
begin
  if p_status not in ('processed', 'ignored', 'retry', 'dead_letter') then
    raise exception 'invalid event terminal status: %', p_status;
  end if;

  update public.integration_events
     set status = p_status,
         processed_at = case when p_status in ('processed', 'ignored') then now() else null end,
         available_at = case
           when p_status = 'retry' then coalesce(p_available_at, now())
           else available_at
         end,
         last_error_kind = p_error_kind,
         last_error = left(p_error, 2000),
         locked_at = null,
         locked_by = null
   where id = p_event_id
     and status = 'processing'
     and locked_by = p_worker_id
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

create or replace function public.integration_claim_outbox(
  p_limit integer,
  p_worker_id text,
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

  return query
  with candidates as (
    select o.id
    from public.integration_outbox o
    where (
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

create or replace function public.integration_finish_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_status text,
  p_error_kind text default null,
  p_error text default null,
  p_available_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated uuid;
begin
  if p_status not in ('sent', 'confirmed', 'retry', 'dead_letter') then
    raise exception 'invalid outbox terminal status: %', p_status;
  end if;

  update public.integration_outbox
     set status = p_status,
         sent_at = case when p_status in ('sent', 'confirmed') then coalesce(sent_at, now()) else sent_at end,
         confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
         available_at = case
           when p_status = 'retry' then coalesce(p_available_at, now())
           else available_at
         end,
         last_error_kind = p_error_kind,
         last_error = left(p_error, 2000),
         locked_at = null,
         locked_by = null
   where id = p_outbox_id
     and status = 'processing'
     and locked_by = p_worker_id
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

create or replace function public.integration_reprocess_event(
  p_event_id uuid,
  p_actor_user_id uuid default null,
  p_correlation_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.integration_events%rowtype;
begin
  update public.integration_events
     set status = 'pending',
         available_at = now(),
         processed_at = null,
         last_error_kind = null,
         last_error = null,
         locked_at = null,
         locked_by = null
   where id = p_event_id
     and status in ('retry', 'dead_letter', 'ignored')
  returning * into v_event;

  if not found then
    return false;
  end if;

  insert into public.integration_audit_log (
    organization_id,
    store_id,
    integration_account_id,
    actor_user_id,
    provider,
    capability,
    action,
    source,
    correlation_id,
    metadata
  ) values (
    v_event.organization_id,
    v_event.store_id,
    v_event.integration_account_id,
    p_actor_user_id,
    v_event.provider,
    v_event.capability,
    'event_reprocessed',
    case when p_actor_user_id is null then 'reconciliation' else 'admin' end,
    p_correlation_id,
    jsonb_build_object('event_id', v_event.id, 'external_event_id', v_event.external_event_id)
  );

  return true;
end;
$$;

revoke all on function public.integration_claim_events(integer, text, integer) from public, anon, authenticated;
revoke all on function public.integration_finish_event(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.integration_claim_outbox(integer, text, integer) from public, anon, authenticated;
revoke all on function public.integration_finish_outbox(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.integration_reprocess_event(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.integration_claim_events(integer, text, integer) to service_role;
grant execute on function public.integration_finish_event(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.integration_claim_outbox(integer, text, integer) to service_role;
grant execute on function public.integration_finish_outbox(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.integration_reprocess_event(uuid, uuid, text) to service_role;

comment on function public.integration_claim_events(integer, text, integer) is
  'Atomically leases due inbox events with FOR UPDATE SKIP LOCKED. Stale leases are reclaimable.';
comment on function public.integration_claim_outbox(integer, text, integer) is
  'Atomically leases due provider commands with FOR UPDATE SKIP LOCKED. Reuses persisted idempotency keys across retries.';
comment on function public.integration_reprocess_event(uuid, uuid, text) is
  'Audited manual/reconciliation replay. Does not bypass server-side authorization.';
