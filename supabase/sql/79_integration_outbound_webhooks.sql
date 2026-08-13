-- PedeAqui — Milestone 22 [236]–[238]
-- Webhooks outbound duráveis sobre DomainEvents, sem acoplamento a fornecedor específico.

create table public.integration_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  integration_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  signing_secret_ref text not null check (char_length(trim(signing_secret_ref)) between 2 and 240),
  event_types text[] not null check (cardinality(event_types) between 1 and 100),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_webhook_subscriptions_integration_fk foreign key (organization_id,store_id,integration_id)
    references public.integrations(organization_id,store_id,id) on delete cascade,
  constraint integration_webhook_subscriptions_scope_id_unique unique (organization_id,store_id,id)
);
create index integration_webhook_subscriptions_match_idx on public.integration_webhook_subscriptions(organization_id,store_id,active);
create index integration_webhook_subscriptions_integration_idx on public.integration_webhook_subscriptions(organization_id,store_id,integration_id);
create index integration_webhook_subscriptions_created_by_idx on public.integration_webhook_subscriptions(created_by) where created_by is not null;
create index integration_webhook_subscriptions_updated_by_idx on public.integration_webhook_subscriptions(updated_by) where updated_by is not null;

create table public.integration_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  subscription_id uuid not null,
  domain_event_id uuid not null,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending','leased','succeeded','dead')),
  attempts integer not null default 0 check (attempts>=0),
  max_attempts integer not null default 10 check (max_attempts between 1 and 50),
  available_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  leased_by text,
  response_status integer,
  last_error text,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint integration_webhook_deliveries_subscription_fk foreign key (organization_id,store_id,subscription_id)
    references public.integration_webhook_subscriptions(organization_id,store_id,id) on delete cascade,
  constraint integration_webhook_deliveries_event_fk foreign key (domain_event_id)
    references public.domain_events(id) on delete cascade,
  constraint integration_webhook_delivery_unique unique (subscription_id,domain_event_id)
);
create index integration_webhook_deliveries_claim_idx on public.integration_webhook_deliveries(status,available_at,lease_expires_at,created_at) where status in ('pending','leased');
create index integration_webhook_deliveries_subscription_idx on public.integration_webhook_deliveries(organization_id,store_id,subscription_id,created_at desc);
create index integration_webhook_deliveries_event_idx on public.integration_webhook_deliveries(domain_event_id);

alter table public.integration_webhook_subscriptions enable row level security;
alter table public.integration_webhook_deliveries enable row level security;
revoke all on table public.integration_webhook_subscriptions,public.integration_webhook_deliveries from anon,authenticated;
grant select,insert,update,delete on table public.integration_webhook_subscriptions,public.integration_webhook_deliveries to service_role;
create policy integration_webhook_subscriptions_browser_deny on public.integration_webhook_subscriptions for all to anon,authenticated using(false) with check(false);
create policy integration_webhook_deliveries_browser_deny on public.integration_webhook_deliveries for all to anon,authenticated using(false) with check(false);

create or replace function private.enqueue_integration_webhooks()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.integration_webhook_deliveries(organization_id,store_id,subscription_id,domain_event_id,event_type,payload)
  select new.organization_id,new.store_id,s.id,new.id,new.event_type,
    jsonb_build_object('event_id',new.id,'event_type',new.event_type,'entity_type',new.entity_type,'entity_id',new.entity_id,'occurred_at',new.occurred_at,'payload',new.payload)
  from public.integration_webhook_subscriptions s
  where s.organization_id=new.organization_id
    and s.active=true
    and (s.store_id is null or s.store_id is not distinct from new.store_id)
    and new.event_type=any(s.event_types)
  on conflict(subscription_id,domain_event_id) do nothing;
  return new;
end; $$;
revoke all on function private.enqueue_integration_webhooks() from public,anon,authenticated;
drop trigger if exists domain_events_enqueue_integration_webhooks on public.domain_events;
create trigger domain_events_enqueue_integration_webhooks after insert on public.domain_events for each row execute function private.enqueue_integration_webhooks();

create or replace function public.integration_webhook_claim_internal(p_worker_id text,p_limit integer default 20,p_lease_seconds integer default 120)
returns table(delivery public.integration_webhook_deliveries,endpoint_url text,signing_secret_ref text)
language plpgsql security invoker set search_path='' as $$
begin
  if char_length(trim(coalesce(p_worker_id,'')))<2 then raise exception 'worker id is required'; end if;
  if p_limit<1 or p_limit>100 then raise exception 'invalid claim limit'; end if;
  if p_lease_seconds<30 or p_lease_seconds>1800 then raise exception 'invalid lease duration'; end if;
  return query
  with candidates as (
    select d.id from public.integration_webhook_deliveries d
    join public.integration_webhook_subscriptions s on s.id=d.subscription_id and s.active=true
    where ((d.status='pending' and d.available_at<=now()) or (d.status='leased' and d.lease_expires_at<=now())) and d.attempts<d.max_attempts
    order by d.available_at,d.created_at,d.id for update of d skip locked limit p_limit
  ), claimed as (
    update public.integration_webhook_deliveries d set status='leased',attempts=d.attempts+1,leased_at=now(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),leased_by=trim(p_worker_id),updated_at=now()
    from candidates c where d.id=c.id returning d.*
  )
  select c,s.endpoint_url,s.signing_secret_ref from claimed c join public.integration_webhook_subscriptions s on s.id=c.subscription_id;
end; $$;
revoke all on function public.integration_webhook_claim_internal(text,integer,integer) from public,anon,authenticated;
grant execute on function public.integration_webhook_claim_internal(text,integer,integer) to service_role;

create or replace function public.integration_webhook_finish_internal(p_delivery_id uuid,p_worker_id text,p_success boolean,p_response_status integer default null,p_error text default null,p_retry_after_seconds integer default 60)
returns public.integration_webhook_deliveries language plpgsql security invoker set search_path='' as $$
declare v_delivery public.integration_webhook_deliveries%rowtype;
begin
  select * into v_delivery from public.integration_webhook_deliveries where id=p_delivery_id for update;
  if v_delivery.id is null then raise exception 'webhook delivery not found'; end if;
  if v_delivery.status in ('succeeded','dead') then return v_delivery; end if;
  if v_delivery.status<>'leased' or v_delivery.leased_by is distinct from trim(p_worker_id) then raise exception 'webhook delivery lease mismatch'; end if;
  if p_success then
    update public.integration_webhook_deliveries set status='succeeded',response_status=p_response_status,completed_at=now(),lease_expires_at=null,last_error=null,updated_at=now() where id=v_delivery.id returning * into v_delivery;
  elsif v_delivery.attempts>=v_delivery.max_attempts then
    update public.integration_webhook_deliveries set status='dead',response_status=p_response_status,completed_at=now(),lease_expires_at=null,last_error=left(coalesce(p_error,'outbound webhook failed'),2000),updated_at=now() where id=v_delivery.id returning * into v_delivery;
  else
    update public.integration_webhook_deliveries set status='pending',response_status=p_response_status,available_at=now()+make_interval(secs=>greatest(1,p_retry_after_seconds)),lease_expires_at=null,leased_by=null,last_error=left(coalesce(p_error,'outbound webhook failed'),2000),updated_at=now() where id=v_delivery.id returning * into v_delivery;
  end if;
  return v_delivery;
end; $$;
revoke all on function public.integration_webhook_finish_internal(uuid,text,boolean,integer,text,integer) from public,anon,authenticated;
grant execute on function public.integration_webhook_finish_internal(uuid,text,boolean,integer,text,integer) to service_role;
