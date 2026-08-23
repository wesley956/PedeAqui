-- PedeAqui — perfil operacional configurável por loja [PA-C01-001..015]
-- Defaults preservam integralmente o comportamento legado. Nenhuma loja recebe opt-in no deploy.

insert into public.permissions (key, description) values
  ('delivery.tracking_view', 'Visualizar telemetria de rotas ativas da unidade'),
  ('delivery.tracking_update', 'Compartilhar telemetria durante a própria rota')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'delivery.tracking_view'
where r.key in ('owner', 'manager')
on conflict do nothing;

create or replace function private.grant_route_tracking_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key in ('owner','manager') then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key='delivery.tracking_view' on conflict do nothing;
  elsif new.key='driver' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key='delivery.tracking_update' on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.grant_route_tracking_permissions_for_role() from public,anon,authenticated;
drop trigger if exists roles_grant_route_tracking_permissions on public.roles;
create trigger roles_grant_route_tracking_permissions after insert on public.roles
for each row execute function private.grant_route_tracking_permissions_for_role();

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'delivery.tracking_update'
where r.key = 'driver'
on conflict do nothing;

create table if not exists public.store_operational_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid primary key,
  schema_version integer not null default 1 check (schema_version = 1),
  orders_auto_accept boolean not null default false,
  orders_workflow_mode text not null default 'standard' check (orders_workflow_mode in ('standard','simplified')),
  deliveries_auto_create_when_ready boolean not null default false,
  deliveries_driver_tracking_enabled boolean not null default false,
  deliveries_stationary_alert_minutes integer not null default 15 check (deliveries_stationary_alert_minutes between 5 and 120),
  deliveries_tracking_retention_days integer not null default 7 check (deliveries_tracking_retention_days between 1 and 30),
  growth_campaigns_enabled boolean not null default false,
  campaign_rate_per_minute integer not null default 10 check (campaign_rate_per_minute between 1 and 60),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_operational_settings_store_same_org_fk
    foreign key (organization_id, store_id) references public.stores(organization_id, id) on delete cascade
);

create table if not exists public.driver_route_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  driver_id uuid not null,
  status text not null default 'active' check (status in ('active','ended')),
  location_permission text not null default 'pending' check (location_permission in ('pending','granted','denied','unavailable')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_heartbeat_at timestamptz,
  retention_until timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  ended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_route_sessions_store_same_org_fk
    foreign key (organization_id, store_id) references public.stores(organization_id, id) on delete cascade,
  constraint driver_route_sessions_driver_same_store_fk
    foreign key (organization_id, store_id, driver_id) references public.drivers(organization_id, store_id, id) on delete restrict,
  constraint driver_route_sessions_end_shape check ((status='active' and ended_at is null) or (status='ended' and ended_at is not null)),
  constraint driver_route_sessions_org_store_id_unique unique (organization_id, store_id, id)
);

create unique index if not exists driver_route_sessions_one_active_per_driver
  on public.driver_route_sessions(driver_id) where status='active';
create index if not exists driver_route_sessions_store_active_idx
  on public.driver_route_sessions(organization_id, store_id, status, last_heartbeat_at desc);
create index if not exists driver_route_sessions_retention_idx
  on public.driver_route_sessions(retention_until) where status='ended';

create table if not exists public.driver_route_deliveries (
  organization_id uuid not null,
  store_id uuid not null,
  route_session_id uuid not null,
  delivery_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (route_session_id, delivery_id),
  constraint driver_route_deliveries_session_same_store_fk
    foreign key (organization_id, store_id, route_session_id) references public.driver_route_sessions(organization_id, store_id, id) on delete cascade,
  constraint driver_route_deliveries_delivery_same_store_fk
    foreign key (organization_id, store_id, delivery_id) references public.deliveries(organization_id, store_id, id) on delete restrict
);

create table if not exists public.driver_route_points (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  store_id uuid not null,
  route_session_id uuid not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(8,2) check (accuracy_meters is null or accuracy_meters between 0 and 5000),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  sample_key text not null check (char_length(sample_key) between 8 and 160),
  constraint driver_route_points_session_same_store_fk
    foreign key (organization_id, store_id, route_session_id) references public.driver_route_sessions(organization_id, store_id, id) on delete cascade,
  constraint driver_route_points_session_sample_unique unique (route_session_id, sample_key)
);

create index if not exists driver_route_points_session_time_idx
  on public.driver_route_points(organization_id, store_id, route_session_id, captured_at desc);

create table if not exists public.driver_route_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  route_session_id uuid not null,
  event_type text not null check (event_type in ('route_started','location_unavailable','stationary_started','stationary_cleared','route_ended')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  created_at timestamptz not null default now(),
  constraint driver_route_events_session_same_store_fk
    foreign key (organization_id, store_id, route_session_id) references public.driver_route_sessions(organization_id, store_id, id) on delete cascade
);

create index if not exists driver_route_events_session_idx
  on public.driver_route_events(organization_id, store_id, route_session_id, created_at desc);

create table if not exists public.customer_marketing_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  customer_id uuid not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email')),
  status text not null default 'not_consented' check (status in ('not_consented','consented','opted_out')),
  source text not null default 'unknown' check (source in ('unknown','checkout','manual','import','customer_request','provider_webhook')),
  consented_at timestamptz,
  opted_out_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, customer_id, channel),
  constraint customer_marketing_preferences_store_same_org_fk
    foreign key (organization_id, store_id) references public.stores(organization_id, id) on delete cascade,
  constraint customer_marketing_preferences_customer_same_org_fk
    foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete cascade,
  constraint customer_marketing_preferences_status_time check (
    (status='consented' and consented_at is not null and opted_out_at is null)
    or (status='opted_out' and opted_out_at is not null)
    or status='not_consented'
  )
);

create index if not exists customer_marketing_preferences_eligibility_idx
  on public.customer_marketing_preferences(organization_id, store_id, channel, status, customer_id);

alter table public.campaigns
  add column if not exists template_name text,
  add column if not exists template_language text not null default 'pt_BR',
  add column if not exists content_version integer not null default 1 check (content_version > 0),
  add column if not exists audience_summary jsonb not null default '{}'::jsonb,
  add column if not exists queued_at timestamptz;

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check check (status in ('draft','scheduled','running','completed','partially_failed','canceled'));

alter table public.campaign_recipients drop constraint if exists campaign_recipients_status_check;
alter table public.campaign_recipients
  add constraint campaign_recipients_status_check check (status in (
    'eligible','queued','sending','sent','delivered','read','failed_transient','failed_permanent','skipped_opt_out','skipped_invalid_contact','canceled','pending','processed','skipped','failed'
  ));
alter table public.campaign_recipients
  add column if not exists attempts integer not null default 0 check (attempts between 0 and 20),
  add column if not exists next_attempt_at timestamptz,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists last_error_code text,
  add column if not exists idempotency_key text;

create unique index if not exists campaign_recipients_idempotency_unique
  on public.campaign_recipients(organization_id, idempotency_key) where idempotency_key is not null;
create index if not exists campaign_recipients_worker_idx
  on public.campaign_recipients(status, next_attempt_at, created_at)
  where status in ('queued','failed_transient');

alter table public.store_operational_settings enable row level security;
alter table public.driver_route_sessions enable row level security;
alter table public.driver_route_deliveries enable row level security;
alter table public.driver_route_points enable row level security;
alter table public.driver_route_events enable row level security;
alter table public.customer_marketing_preferences enable row level security;

revoke all on table public.store_operational_settings, public.driver_route_sessions,
  public.driver_route_deliveries, public.driver_route_points, public.driver_route_events,
  public.customer_marketing_preferences from anon, authenticated;

grant select on table public.store_operational_settings to authenticated;
grant select on table public.driver_route_sessions, public.driver_route_deliveries,
  public.driver_route_points, public.driver_route_events to authenticated;
grant select on table public.customer_marketing_preferences to authenticated;
grant select, insert, update, delete on table public.store_operational_settings,
  public.driver_route_sessions, public.driver_route_deliveries, public.driver_route_points,
  public.driver_route_events, public.customer_marketing_preferences to service_role;

create policy store_operational_settings_view on public.store_operational_settings
for select to authenticated using (
  private.has_permission(organization_id, store_id, 'stores.view')
  or private.has_permission(organization_id, store_id, 'orders.view')
  or private.has_permission(organization_id, store_id, 'delivery.view')
  or private.has_permission(organization_id, store_id, 'growth.view')
);

create policy driver_route_sessions_owner_view on public.driver_route_sessions
for select to authenticated using (
  private.has_permission(organization_id, store_id, 'delivery.tracking_view')
  or exists(select 1 from public.drivers d where d.id=driver_id and d.user_id=(select auth.uid()) and d.active and d.deleted_at is null)
);
create policy driver_route_deliveries_owner_view on public.driver_route_deliveries
for select to authenticated using (
  private.has_permission(organization_id, store_id, 'delivery.tracking_view')
  or exists(select 1 from public.driver_route_sessions s join public.drivers d on d.id=s.driver_id where s.id=route_session_id and d.user_id=(select auth.uid()) and d.active and d.deleted_at is null)
);
create policy driver_route_points_owner_view on public.driver_route_points
for select to authenticated using (private.has_permission(organization_id, store_id, 'delivery.tracking_view'));
create policy driver_route_events_owner_view on public.driver_route_events
for select to authenticated using (
  private.has_permission(organization_id, store_id, 'delivery.tracking_view')
  or exists(select 1 from public.driver_route_sessions s join public.drivers d on d.id=s.driver_id where s.id=route_session_id and d.user_id=(select auth.uid()) and d.active and d.deleted_at is null)
);
create policy customer_marketing_preferences_view on public.customer_marketing_preferences
for select to authenticated using (
  private.has_permission(organization_id, store_id, 'growth.campaigns')
  or private.has_permission(organization_id, store_id, 'customers.manage')
);

create or replace function private.store_module_enabled(p_organization_id uuid, p_store_id uuid, p_module_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select sm.enabled from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key=p_module_key), true)
$$;
revoke all on function private.store_module_enabled(uuid,uuid,text) from public, anon, authenticated;

create or replace function public.set_store_operational_settings_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_settings jsonb,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id text
) returns public.store_operational_settings
language plpgsql security invoker set search_path='' as $$
declare v_before public.store_operational_settings%rowtype; v_after public.store_operational_settings%rowtype;
begin
  if p_actor_user_id is null then raise exception 'settings actor is required'; end if;
  if not exists(select 1 from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id) then raise exception 'store not found'; end if;
  if jsonb_typeof(coalesce(p_settings,'{}'::jsonb)) <> 'object' then raise exception 'settings must be an object'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'settings reason is required'; end if;
  if char_length(trim(coalesce(p_request_id,''))) not between 3 and 120 then raise exception 'settings request id is required'; end if;
  if (coalesce((p_settings->>'orders_workflow_mode'),'standard') not in ('standard','simplified')) then raise exception 'invalid workflow mode'; end if;
  if coalesce((p_settings->>'orders_workflow_mode'),'standard')='simplified' and not coalesce((p_settings->>'orders_auto_accept')::boolean,false) then raise exception 'simplified workflow requires auto accept'; end if;
  if coalesce((p_settings->>'deliveries_driver_tracking_enabled')::boolean,false)
    and (not private.store_module_enabled(p_organization_id,p_store_id,'deliveries') or not private.store_module_enabled(p_organization_id,p_store_id,'driver')) then
    raise exception 'driver tracking requires deliveries and driver modules';
  end if;
  if coalesce((p_settings->>'growth_campaigns_enabled')::boolean,false)
    and (not private.store_module_enabled(p_organization_id,p_store_id,'growth') or not private.store_module_enabled(p_organization_id,p_store_id,'customers') or not private.store_module_enabled(p_organization_id,p_store_id,'conversations')) then
    raise exception 'campaigns require growth, customers and conversations modules';
  end if;

  select * into v_before from public.store_operational_settings where store_id=p_store_id for update;
  insert into public.store_operational_settings(
    organization_id,store_id,orders_auto_accept,orders_workflow_mode,deliveries_auto_create_when_ready,
    deliveries_driver_tracking_enabled,deliveries_stationary_alert_minutes,deliveries_tracking_retention_days,
    growth_campaigns_enabled,campaign_rate_per_minute,updated_by,updated_at
  ) values (
    p_organization_id,p_store_id,
    coalesce((p_settings->>'orders_auto_accept')::boolean,false),coalesce(p_settings->>'orders_workflow_mode','standard'),
    coalesce((p_settings->>'deliveries_auto_create_when_ready')::boolean,false),
    coalesce((p_settings->>'deliveries_driver_tracking_enabled')::boolean,false),
    coalesce((p_settings->>'deliveries_stationary_alert_minutes')::integer,15),
    coalesce((p_settings->>'deliveries_tracking_retention_days')::integer,7),
    coalesce((p_settings->>'growth_campaigns_enabled')::boolean,false),
    coalesce((p_settings->>'campaign_rate_per_minute')::integer,10),p_actor_user_id,now()
  ) on conflict(store_id) do update set
    orders_auto_accept=excluded.orders_auto_accept,orders_workflow_mode=excluded.orders_workflow_mode,
    deliveries_auto_create_when_ready=excluded.deliveries_auto_create_when_ready,
    deliveries_driver_tracking_enabled=excluded.deliveries_driver_tracking_enabled,
    deliveries_stationary_alert_minutes=excluded.deliveries_stationary_alert_minutes,
    deliveries_tracking_retention_days=excluded.deliveries_tracking_retention_days,
    growth_campaigns_enabled=excluded.growth_campaigns_enabled,campaign_rate_per_minute=excluded.campaign_rate_per_minute,
    updated_by=excluded.updated_by,updated_at=now()
  returning * into v_after;

  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
  values(p_organization_id,p_store_id,p_actor_user_id,'platform.store_operational_settings_updated','store_operational_settings',p_store_id,
    case when v_before.store_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after)||jsonb_build_object('reason',trim(p_reason)),trim(p_request_id));
  return v_after;
end $$;
revoke all on function public.set_store_operational_settings_internal(uuid,uuid,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_store_operational_settings_internal(uuid,uuid,jsonb,uuid,text,text) to service_role;

create or replace function private.apply_store_order_automations()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_settings public.store_operational_settings%rowtype;
begin
  select * into v_settings from public.store_operational_settings s where s.store_id=new.store_id and s.organization_id=new.organization_id;
  if v_settings.store_id is null then return new; end if;
  if v_settings.orders_auto_accept and new.order_status='pending_confirmation'
    and private.store_module_enabled(new.organization_id,new.store_id,'orders') then
    perform public.order_transition_internal(new.id,'order','confirmed','Aceite automático pela configuração da unidade',null,'automation');
  end if;
  if v_settings.deliveries_auto_create_when_ready and new.fulfillment_type='delivery'
    and new.order_status='confirmed' and new.production_status in ('ready','not_required')
    and new.fulfillment_status='pending' and private.store_module_enabled(new.organization_id,new.store_id,'deliveries') then
    perform public.order_transition_internal(new.id,'fulfillment','awaiting_assignment','Projeção automática para Entregas',null,'automation');
    perform private.delivery_ensure(new.id,null);
  end if;
  return new;
end $$;
revoke all on function private.apply_store_order_automations() from public,anon,authenticated;
drop trigger if exists orders_apply_store_automations on public.orders;
create constraint trigger orders_apply_store_automations
after insert or update of order_status,production_status,fulfillment_status on public.orders
deferrable initially deferred for each row execute function private.apply_store_order_automations();

create or replace function public.driver_route_start_internal(p_delivery_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_delivery public.deliveries%rowtype; v_driver public.drivers%rowtype; v_settings public.store_operational_settings%rowtype; v_session public.driver_route_sessions%rowtype;
begin
  if p_actor_user_id is null then raise exception 'route actor is required'; end if;
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if v_delivery.id is null or v_delivery.driver_id is null then raise exception 'delivery not found or unassigned'; end if;
  select * into v_driver from public.drivers where id=v_delivery.driver_id and user_id=p_actor_user_id and active and deleted_at is null;
  if v_driver.id is null then raise exception 'delivery is not assigned to current driver'; end if;
  select * into v_settings from public.store_operational_settings where store_id=v_delivery.store_id;
  if not coalesce(v_settings.deliveries_driver_tracking_enabled,false) or not private.store_module_enabled(v_delivery.organization_id,v_delivery.store_id,'driver') then raise exception 'driver tracking is disabled'; end if;
  select * into v_session from public.driver_route_sessions where driver_id=v_driver.id and status='active' for update;
  if v_session.id is null then
    insert into public.driver_route_sessions(organization_id,store_id,driver_id,retention_until,created_by)
    values(v_delivery.organization_id,v_delivery.store_id,v_driver.id,now()+make_interval(days=>v_settings.deliveries_tracking_retention_days),p_actor_user_id)
    returning * into v_session;
    insert into public.driver_route_events(organization_id,store_id,route_session_id,event_type)
    values(v_session.organization_id,v_session.store_id,v_session.id,'route_started');
  end if;
  insert into public.driver_route_deliveries(organization_id,store_id,route_session_id,delivery_id)
  values(v_session.organization_id,v_session.store_id,v_session.id,v_delivery.id) on conflict do nothing;
  return jsonb_build_object('session_id',v_session.id,'status',v_session.status,'tracking_enabled',true);
end $$;
revoke all on function public.driver_route_start_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.driver_route_start_internal(uuid,uuid) to service_role;

create or replace function public.driver_route_heartbeat_internal(
  p_route_session_id uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,p_captured_at timestamptz,p_sample_key text,p_permission text,p_actor_user_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_session public.driver_route_sessions%rowtype; v_driver public.drivers%rowtype; v_settings public.store_operational_settings%rowtype; v_last timestamptz;
begin
  if p_actor_user_id is null then raise exception 'heartbeat actor is required'; end if;
  if p_permission not in ('granted','denied','unavailable') then raise exception 'invalid location permission'; end if;
  select * into v_session from public.driver_route_sessions where id=p_route_session_id for update;
  if v_session.id is null or v_session.status<>'active' then raise exception 'route session is not active'; end if;
  select * into v_driver from public.drivers where id=v_session.driver_id and user_id=p_actor_user_id and active and deleted_at is null;
  if v_driver.id is null then raise exception 'route session does not belong to current driver'; end if;
  select * into v_settings from public.store_operational_settings where store_id=v_session.store_id;
  if not coalesce(v_settings.deliveries_driver_tracking_enabled,false) then raise exception 'driver tracking is disabled'; end if;
  if p_captured_at is null or p_captured_at < now()-interval '10 minutes' or p_captured_at > now()+interval '2 minutes' then raise exception 'invalid capture timestamp'; end if;
  if char_length(trim(coalesce(p_sample_key,''))) not between 8 and 160 then raise exception 'invalid sample key'; end if;
  select max(received_at) into v_last from public.driver_route_points where route_session_id=v_session.id;
  if v_last is not null and v_last > now()-interval '10 seconds' then raise exception 'heartbeat rate limit exceeded'; end if;
  update public.driver_route_sessions set location_permission=p_permission,last_heartbeat_at=now(),updated_at=now() where id=v_session.id;
  if p_permission='granted' then
    if p_latitude is null or p_longitude is null or p_accuracy_meters is null or p_accuracy_meters>1000 then raise exception 'invalid location sample'; end if;
    insert into public.driver_route_points(organization_id,store_id,route_session_id,latitude,longitude,accuracy_meters,captured_at,sample_key)
    values(v_session.organization_id,v_session.store_id,v_session.id,p_latitude,p_longitude,p_accuracy_meters,p_captured_at,trim(p_sample_key))
    on conflict(route_session_id,sample_key) do nothing;
  else
    insert into public.driver_route_events(organization_id,store_id,route_session_id,event_type,details)
    values(v_session.organization_id,v_session.store_id,v_session.id,'location_unavailable',jsonb_build_object('permission',p_permission));
  end if;
  return jsonb_build_object('session_id',v_session.id,'accepted',true,'permission',p_permission);
end $$;
revoke all on function public.driver_route_heartbeat_internal(uuid,numeric,numeric,numeric,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.driver_route_heartbeat_internal(uuid,numeric,numeric,numeric,timestamptz,text,text,uuid) to service_role;

create or replace function public.driver_route_end_internal(p_route_session_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_session public.driver_route_sessions%rowtype; v_driver public.drivers%rowtype;
begin
  select * into v_session from public.driver_route_sessions where id=p_route_session_id for update;
  if v_session.id is null then raise exception 'route session not found'; end if;
  if v_session.status='ended' then return jsonb_build_object('session_id',v_session.id,'changed',false); end if;
  select * into v_driver from public.drivers where id=v_session.driver_id;
  if v_driver.user_id<>p_actor_user_id and not private.has_permission(v_session.organization_id,v_session.store_id,'delivery.manage') then raise exception 'route session cannot be ended by actor'; end if;
  update public.driver_route_sessions set status='ended',ended_at=now(),ended_by=p_actor_user_id,updated_at=now() where id=v_session.id;
  insert into public.driver_route_events(organization_id,store_id,route_session_id,event_type)
  values(v_session.organization_id,v_session.store_id,v_session.id,'route_ended');
  return jsonb_build_object('session_id',v_session.id,'changed',true);
end $$;
revoke all on function public.driver_route_end_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.driver_route_end_internal(uuid,uuid) to service_role;

create or replace function public.customer_marketing_preference_internal(
  p_store_id uuid,p_customer_id uuid,p_channel text,p_status text,p_source text,p_actor_user_id uuid
) returns public.customer_marketing_preferences language plpgsql security invoker set search_path='' as $$
declare v_store public.stores%rowtype; v_result public.customer_marketing_preferences%rowtype;
begin
  select * into v_store from public.stores where id=p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;
  if not exists(select 1 from public.customers c where c.id=p_customer_id and c.organization_id=v_store.organization_id and c.deleted_at is null) then raise exception 'customer not found'; end if;
  if p_channel not in ('whatsapp','email') or p_status not in ('not_consented','consented','opted_out') or p_source not in ('unknown','checkout','manual','import','customer_request','provider_webhook') then raise exception 'invalid marketing preference'; end if;
  insert into public.customer_marketing_preferences(organization_id,store_id,customer_id,channel,status,source,consented_at,opted_out_at,updated_by)
  values(v_store.organization_id,v_store.id,p_customer_id,p_channel,p_status,p_source,
    case when p_status='consented' then now() else null end,case when p_status='opted_out' then now() else null end,p_actor_user_id)
  on conflict(store_id,customer_id,channel) do update set status=excluded.status,source=excluded.source,
    consented_at=case when excluded.status='consented' then now() else public.customer_marketing_preferences.consented_at end,
    opted_out_at=case when excluded.status='opted_out' then now() else null end,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_result;
  return v_result;
end $$;
revoke all on function public.customer_marketing_preference_internal(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.customer_marketing_preference_internal(uuid,uuid,text,text,text,uuid) to service_role;

create or replace function public.campaign_enqueue_internal(p_campaign_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_campaign public.campaigns%rowtype; v_settings public.store_operational_settings%rowtype; v_eligible integer:=0; v_excluded integer:=0;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'campaign is not queueable'; end if;
  if v_campaign.channel<>'whatsapp' or nullif(trim(v_campaign.template_name),'') is null then raise exception 'approved WhatsApp template is required'; end if;
  select * into v_settings from public.store_operational_settings where store_id=v_campaign.store_id;
  if not coalesce(v_settings.growth_campaigns_enabled,false) or not private.store_module_enabled(v_campaign.organization_id,v_campaign.store_id,'growth') then raise exception 'campaigns are disabled'; end if;
  perform public.growth_prepare_campaign_internal(v_campaign.id,p_actor_user_id);
  update public.campaign_recipients cr set
    status=case when not exists(select 1 from public.orders o where o.organization_id=v_campaign.organization_id and o.store_id=v_campaign.store_id and o.customer_id=c.id) then 'skipped_invalid_contact' when p.status='consented' and c.phone_normalized is not null then 'queued' when p.status='opted_out' then 'skipped_opt_out' else 'skipped_invalid_contact' end,
    reason=case when not exists(select 1 from public.orders o where o.organization_id=v_campaign.organization_id and o.store_id=v_campaign.store_id and o.customer_id=c.id) then 'Cliente fora do escopo da unidade' when p.status='opted_out' then 'Cliente solicitou opt-out' when p.status is distinct from 'consented' then 'Consentimento promocional ausente' when c.phone_normalized is null then 'Telefone inválido ou ausente' else null end,
    phone_snapshot=case when p.status='consented' then c.phone_normalized else null end,
    idempotency_key='campaign:'||v_campaign.id::text||':customer:'||cr.customer_id::text||':v'||v_campaign.content_version::text,
    next_attempt_at=case when p.status='consented' and c.phone_normalized is not null then now() else null end,
    processed_at=case when p.status='consented' and c.phone_normalized is not null then null else now() end
  from public.customers c
  left join public.customer_marketing_preferences p on p.organization_id=v_campaign.organization_id and p.store_id=v_campaign.store_id and p.customer_id=c.id and p.channel='whatsapp'
  where cr.campaign_id=v_campaign.id and c.id=cr.customer_id and c.organization_id=v_campaign.organization_id;
  select count(*) filter(where status='queued'),count(*) filter(where status like 'skipped_%') into v_eligible,v_excluded from public.campaign_recipients where campaign_id=v_campaign.id;
  update public.campaigns set status='running',started_at=coalesce(started_at,now()),queued_at=now(),audience_summary=jsonb_build_object('eligible',v_eligible,'excluded',v_excluded),updated_by=p_actor_user_id,updated_at=now() where id=v_campaign.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_campaign.organization_id,v_campaign.store_id,p_actor_user_id,'growth.campaign_enqueued','campaign',v_campaign.id,jsonb_build_object('eligible',v_eligible,'excluded',v_excluded,'template_name',v_campaign.template_name));
  return jsonb_build_object('campaign_id',v_campaign.id,'eligible',v_eligible,'excluded',v_excluded,'status','running');
end $$;
revoke all on function public.campaign_enqueue_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.campaign_enqueue_internal(uuid,uuid) to service_role;

create or replace function public.campaign_claim_internal(p_worker_id text,p_limit integer)
returns setof public.campaign_recipients language plpgsql security invoker set search_path='' as $$
begin
  if char_length(trim(coalesce(p_worker_id,''))) not between 8 and 180 then raise exception 'invalid worker id'; end if;
  if p_limit not between 1 and 100 then raise exception 'invalid claim limit'; end if;
  return query with ranked as (
    select cr.id,cr.store_id,
      row_number() over(partition by cr.store_id order by cr.next_attempt_at nulls first,cr.created_at) as store_position,
      greatest(s.campaign_rate_per_minute-(select count(*) from public.campaign_recipients sent where sent.store_id=cr.store_id and sent.status in ('sent','delivered','read') and sent.processed_at>=now()-interval '1 minute'),0) as available_slots
    from public.campaign_recipients cr
    join public.store_operational_settings s on s.store_id=cr.store_id and s.growth_campaigns_enabled
    where cr.status in ('queued','failed_transient') and coalesce(cr.next_attempt_at,now())<=now()
      and (cr.lease_expires_at is null or cr.lease_expires_at<now())
  ), candidates as (
    select cr.id from public.campaign_recipients cr join ranked r on r.id=cr.id
    where r.store_position<=r.available_slots
    order by cr.next_attempt_at nulls first,cr.created_at for update of cr skip locked limit p_limit
  ) update public.campaign_recipients cr set status='sending',attempts=attempts+1,lease_owner=trim(p_worker_id),lease_expires_at=now()+interval '2 minutes'
    from candidates x where cr.id=x.id returning cr.*;
end $$;
revoke all on function public.campaign_claim_internal(text,integer) from public,anon,authenticated;
grant execute on function public.campaign_claim_internal(text,integer) to service_role;

create or replace function public.campaign_finish_internal(
  p_recipient_id uuid,p_worker_id text,p_status text,p_provider_message_id text,p_error_code text,p_reason text,p_retry_after_seconds integer
) returns void language plpgsql security invoker set search_path='' as $$
declare v_row public.campaign_recipients%rowtype; v_remaining integer;
begin
  if p_status not in ('sent','delivered','read','failed_transient','failed_permanent','skipped_opt_out','skipped_invalid_contact') then raise exception 'invalid campaign recipient result'; end if;
  select * into v_row from public.campaign_recipients where id=p_recipient_id for update;
  if v_row.id is null or v_row.lease_owner is distinct from trim(p_worker_id) then raise exception 'campaign recipient lease mismatch'; end if;
  update public.campaign_recipients set status=p_status,provider_message_id=p_provider_message_id,last_error_code=p_error_code,reason=left(p_reason,500),
    next_attempt_at=case when p_status='failed_transient' and attempts<5 then now()+make_interval(secs=>greatest(coalesce(p_retry_after_seconds,60),30)) else null end,
    processed_at=case when p_status in ('failed_transient') and attempts<5 then null else now() end,lease_owner=null,lease_expires_at=null where id=v_row.id;
  if p_status='failed_transient' and v_row.attempts>=5 then update public.campaign_recipients set status='failed_permanent',processed_at=now() where id=v_row.id; end if;
  select count(*) into v_remaining from public.campaign_recipients where campaign_id=v_row.campaign_id and status in ('queued','sending','failed_transient');
  if v_remaining=0 then
    update public.campaigns c set status=case when exists(select 1 from public.campaign_recipients x where x.campaign_id=c.id and x.status='failed_permanent') then 'partially_failed' else 'completed' end,completed_at=now(),updated_at=now() where c.id=v_row.campaign_id;
  end if;
end $$;
revoke all on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) to service_role;

create or replace function public.cleanup_driver_route_points_internal(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  delete from public.driver_route_sessions where status='ended' and retention_until<p_now;
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke all on function public.cleanup_driver_route_points_internal(timestamptz) from public,anon,authenticated;
grant execute on function public.cleanup_driver_route_points_internal(timestamptz) to service_role;

-- Fechar a sessão de rota é um efeito auxiliar: nunca desfaz uma entrega concluída.
create or replace function private.end_route_after_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.delivered_at is not null and old.delivered_at is null then
    with ended as (
      update public.driver_route_sessions s set status='ended',ended_at=now(),ended_by=null,updated_at=now()
      where s.status='active' and exists(select 1 from public.driver_route_deliveries rd where rd.route_session_id=s.id and rd.delivery_id=new.id)
      returning s.organization_id,s.store_id,s.id
    ) insert into public.driver_route_events(organization_id,store_id,route_session_id,event_type)
      select organization_id,store_id,id,'route_ended' from ended;
  end if;
  return new;
end $$;
revoke all on function private.end_route_after_delivery() from public,anon,authenticated;
drop trigger if exists deliveries_end_route_after_completion on public.deliveries;
create trigger deliveries_end_route_after_completion after update of delivered_at on public.deliveries
for each row execute function private.end_route_after_delivery();

notify pgrst, 'reload schema';
