-- Product-experience telemetry is intentionally isolated from domain_events:
-- it may expire, is never authoritative, and must never block restaurant work.
create table if not exists public.product_experience_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  order_id uuid,
  event_name text not null check (event_name ~ '^px\.[a-z0-9_]+\.[a-z0-9_]+$'),
  schema_version smallint not null default 1 check (schema_version between 1 and 100),
  source text not null check (source in ('client','server','derived')),
  outcome text check (outcome is null or outcome in ('success','failure','abandoned','recovered','unknown')),
  duration_ms bigint check (duration_ms is null or duration_ms between 0 and 86400000),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 4096
  ),
  occurred_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now(),
  check (expires_at > occurred_at),
  constraint product_experience_events_store_scope_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint product_experience_events_order_scope_fk foreign key (organization_id, store_id, order_id)
    references public.orders(organization_id, store_id, id) on delete set null (order_id)
);

create index if not exists product_experience_events_store_time_idx
  on public.product_experience_events(store_id, occurred_at desc);
create index if not exists product_experience_events_org_time_idx
  on public.product_experience_events(organization_id, occurred_at desc);
create index if not exists product_experience_events_name_time_idx
  on public.product_experience_events(event_name, occurred_at desc);
create index if not exists product_experience_events_order_idx
  on public.product_experience_events(order_id, occurred_at)
  where order_id is not null;
create index if not exists product_experience_events_expiry_idx
  on public.product_experience_events(expires_at);

alter table public.product_experience_events enable row level security;
revoke all on table public.product_experience_events from public, anon, authenticated;
grant select, insert, delete on table public.product_experience_events to service_role;

create policy product_experience_events_browser_deny
  on public.product_experience_events for all to anon, authenticated
  using (false) with check (false);

comment on table public.product_experience_events is
  'Non-authoritative, privacy-minimized product telemetry. Failure or absence must never affect operations.';
