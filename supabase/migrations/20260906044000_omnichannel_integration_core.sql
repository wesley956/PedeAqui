-- Omnichannel integration core (#936).
-- These tables are private infrastructure: browser roles never read provider payloads,
-- credentials, inbox/outbox jobs or reconciliation metadata directly.

create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('ifood', '99food', '99entrega')),
  external_account_id text,
  status text not null default 'disconnected'
    check (status in ('connected', 'attention', 'action_required', 'unavailable', 'disconnected')),
  secret_reference text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index if not exists integration_accounts_external_uidx
  on public.integration_accounts(organization_id, provider, external_account_id)
  where external_account_id is not null;

create table if not exists public.integration_merchants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  integration_account_id uuid not null,
  provider text not null check (provider in ('ifood', '99food', '99entrega')),
  external_merchant_id text not null,
  display_name text,
  capabilities jsonb not null default '{
    "ifood_orders": false,
    "ifood_catalog": false,
    "ifood_shipping": false,
    "99food_orders": false,
    "99food_menu": false,
    "99food_logistics": false,
    "99entrega": false
  }'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_merchants_store_scope_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint integration_merchants_account_scope_fk foreign key (organization_id, integration_account_id)
    references public.integration_accounts(organization_id, id) on delete cascade,
  unique (integration_account_id, external_merchant_id),
  unique (organization_id, store_id, provider),
  unique (organization_id, store_id, id)
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  integration_account_id uuid not null,
  provider text not null check (provider in ('ifood', '99food', '99entrega')),
  capability text not null,
  external_event_id text not null,
  event_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'ignored', 'failed')),
  payload jsonb not null,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  constraint integration_events_store_scope_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint integration_events_account_scope_fk foreign key (organization_id, integration_account_id)
    references public.integration_accounts(organization_id, id) on delete cascade,
  unique (integration_account_id, external_event_id)
);

create index if not exists integration_events_pending_idx
  on public.integration_events(status, available_at, received_at)
  where status in ('pending', 'failed');
create index if not exists integration_events_store_time_idx
  on public.integration_events(store_id, received_at desc);

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  order_id uuid,
  integration_account_id uuid not null,
  provider text not null check (provider in ('ifood', '99food', '99entrega')),
  capability text not null,
  operation text not null,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'confirmed', 'failed', 'dead_letter')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  confirmed_at timestamptz,
  last_error text,
  constraint integration_outbox_store_scope_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint integration_outbox_order_scope_fk foreign key (organization_id, store_id, order_id)
    references public.orders(organization_id, store_id, id) on delete cascade,
  constraint integration_outbox_account_scope_fk foreign key (organization_id, integration_account_id)
    references public.integration_accounts(organization_id, id) on delete cascade,
  unique (integration_account_id, idempotency_key)
);

create index if not exists integration_outbox_pending_idx
  on public.integration_outbox(status, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists integration_outbox_order_idx
  on public.integration_outbox(order_id, created_at desc)
  where order_id is not null;

create table if not exists public.external_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  order_id uuid not null,
  integration_account_id uuid not null,
  integration_merchant_id uuid,
  provider text not null check (provider in ('ifood', '99food')),
  external_order_id text not null,
  payment_owner text not null check (payment_owner in ('pedeaqui', 'provider', 'merchant')),
  logistics_owner text,
  external_status text,
  external_revision text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'retry', 'attention')),
  last_external_event_id text,
  last_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_orders_store_scope_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint external_orders_order_scope_fk foreign key (organization_id, store_id, order_id)
    references public.orders(organization_id, store_id, id) on delete cascade,
  constraint external_orders_account_scope_fk foreign key (organization_id, integration_account_id)
    references public.integration_accounts(organization_id, id) on delete cascade,
  constraint external_orders_merchant_scope_fk foreign key (organization_id, store_id, integration_merchant_id)
    references public.integration_merchants(organization_id, store_id, id) on delete set null (integration_merchant_id),
  unique (integration_account_id, external_order_id),
  unique (organization_id, store_id, order_id)
);

create index if not exists external_orders_sync_idx
  on public.external_orders(sync_status, updated_at)
  where sync_status in ('pending', 'retry', 'attention');

create table if not exists public.integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid,
  integration_account_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider text,
  capability text,
  action text not null,
  source text not null check (source in ('user_action', 'server', 'worker', 'reconciliation', 'admin', 'migration')),
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint integration_audit_store_scope_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint integration_audit_account_scope_fk foreign key (organization_id, integration_account_id)
    references public.integration_accounts(organization_id, id) on delete set null (integration_account_id)
);

create index if not exists integration_audit_store_time_idx
  on public.integration_audit_log(store_id, created_at desc);

-- Private-by-default. Integration workers use service_role; no browser role receives table grants.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'integration_accounts',
    'integration_merchants',
    'integration_events',
    'integration_outbox',
    'external_orders',
    'integration_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

comment on table public.integration_events is
  'Durable provider inbox. A provider event is acknowledged only after durable ingestion/processing policy allows it.';
comment on table public.integration_outbox is
  'Durable idempotent provider command queue. Provider HTTP is never executed from UI components.';
comment on table public.external_orders is
  'Link between canonical PedeAqui orders and external sales-channel identity/sync state.';
