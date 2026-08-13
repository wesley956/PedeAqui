-- PedeAqui — Milestone 23 [239]–[253]
-- Planos, entitlements, uso e branding. Catálogo da plataforma é server-only.

insert into public.permissions(key,description) values
  ('subscription.view','Visualizar plano, assinatura e limites da organização'),
  ('branding.view','Visualizar branding e white-label'),
  ('branding.manage','Gerenciar branding e white-label da organização'),
  ('scale.view','Visualizar recursos multiunidade e BI agregado'),
  ('scale.manage','Gerenciar agrupamentos e recursos avançados multiunidade')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p
  on p.key in ('subscription.view','branding.view','branding.manage','scale.view','scale.manage')
where r.key in ('owner','manager') on conflict do nothing;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text,
  active boolean not null default true,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.features (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text,
  value_type text not null default 'boolean' check (value_type in ('boolean','count')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete cascade,
  enabled boolean not null default true,
  limit_value bigint check (limit_value is null or limit_value >= 0),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(plan_id,feature_id)
);
create index plan_features_feature_idx on public.plan_features(feature_id,plan_id);

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null check (status in ('trialing','active','past_due','cancelled','expired')),
  billing_interval text not null default 'month' check (billing_interval in ('month','year','manual')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  ended_at timestamptz,
  billing_provider_key text,
  provider_customer_id text,
  provider_subscription_id text,
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_subscriptions_org_idem_unique unique(organization_id,idempotency_key)
);
create unique index organization_subscriptions_current_idx on public.organization_subscriptions(organization_id)
  where status in ('trialing','active','past_due');
create unique index organization_subscriptions_provider_unique_idx on public.organization_subscriptions(billing_provider_key,provider_subscription_id)
  where billing_provider_key is not null and provider_subscription_id is not null;
create index organization_subscriptions_plan_idx on public.organization_subscriptions(plan_id,status);

create table public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete cascade,
  from_status text,
  to_status text not null check (to_status in ('trialing','active','past_due','cancelled','expired')),
  event_type text not null check (char_length(trim(event_type)) between 2 and 100),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint subscription_history_org_idem_unique unique(organization_id,idempotency_key)
);
create index subscription_history_subscription_idx on public.subscription_history(organization_id,subscription_id,created_at,id);

create table public.feature_usage_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  used bigint not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key(organization_id,feature_id,period_start),
  check (period_end > period_start)
);
create index feature_usage_counters_feature_idx on public.feature_usage_counters(feature_id,period_start);

create table public.feature_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete restrict,
  period_start timestamptz not null,
  quantity bigint not null check (quantity <> 0),
  event_type text not null check (event_type in ('consume','correction')),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  source_type text,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint feature_usage_events_org_idem_unique unique(organization_id,idempotency_key)
);
create index feature_usage_events_counter_idx on public.feature_usage_events(organization_id,feature_id,period_start,created_at,id);
create index feature_usage_events_feature_idx on public.feature_usage_events(feature_id,period_start);

create table public.organization_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  white_label_enabled boolean not null default false,
  product_name text check (product_name is null or char_length(trim(product_name)) between 2 and 80),
  logo_asset_ref text check (logo_asset_ref is null or char_length(trim(logo_asset_ref)) between 2 and 500),
  favicon_asset_ref text check (favicon_asset_ref is null or char_length(trim(favicon_asset_ref)) between 2 and 500),
  primary_color text check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  support_url text check (support_url is null or support_url ~ '^https://'),
  hide_pedeaqui_branding boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organization_branding_updated_by_idx on public.organization_branding(updated_by) where updated_by is not null;

alter table public.plans enable row level security;
alter table public.features enable row level security;
alter table public.plan_features enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.subscription_history enable row level security;
alter table public.feature_usage_counters enable row level security;
alter table public.feature_usage_events enable row level security;
alter table public.organization_branding enable row level security;

revoke all on table public.plans,public.features,public.plan_features,public.organization_subscriptions,public.subscription_history,public.feature_usage_counters,public.feature_usage_events,public.organization_branding from anon,authenticated;
grant select,insert,update,delete on table public.plans,public.features,public.plan_features,public.organization_subscriptions,public.subscription_history,public.feature_usage_counters,public.feature_usage_events,public.organization_branding to service_role;

create policy plans_browser_deny on public.plans for all to anon,authenticated using(false) with check(false);
create policy features_browser_deny on public.features for all to anon,authenticated using(false) with check(false);
create policy plan_features_browser_deny on public.plan_features for all to anon,authenticated using(false) with check(false);
create policy organization_subscriptions_browser_deny on public.organization_subscriptions for all to anon,authenticated using(false) with check(false);
create policy subscription_history_browser_deny on public.subscription_history for all to anon,authenticated using(false) with check(false);
create policy feature_usage_counters_browser_deny on public.feature_usage_counters for all to anon,authenticated using(false) with check(false);
create policy feature_usage_events_browser_deny on public.feature_usage_events for all to anon,authenticated using(false) with check(false);
create policy organization_branding_browser_deny on public.organization_branding for all to anon,authenticated using(false) with check(false);

create or replace function private.prevent_subscription_history_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'subscription history is immutable'; end; $$;
revoke all on function private.prevent_subscription_history_mutation() from public,anon,authenticated;
create trigger subscription_history_immutable before update or delete on public.subscription_history for each row execute function private.prevent_subscription_history_mutation();

create or replace function private.prevent_feature_usage_event_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'feature usage ledger is immutable'; end; $$;
revoke all on function private.prevent_feature_usage_event_mutation() from public,anon,authenticated;
create trigger feature_usage_events_immutable before update or delete on public.feature_usage_events for each row execute function private.prevent_feature_usage_event_mutation();
