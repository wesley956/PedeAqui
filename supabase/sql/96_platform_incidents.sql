create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  severity text not null check (severity in ('P0','P1','P2','P3')),
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  category text not null,
  title text not null,
  summary text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  source_kind text not null,
  source_reference text,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  deploy_ref text,
  internal_note text,
  updated_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_incidents_status_severity_idx
  on public.platform_incidents(status, severity, last_seen_at desc);
create index if not exists platform_incidents_org_store_idx
  on public.platform_incidents(organization_id, store_id, last_seen_at desc);
create index if not exists platform_incidents_category_idx
  on public.platform_incidents(category, last_seen_at desc);

alter table public.platform_incidents enable row level security;
revoke all on table public.platform_incidents from anon, authenticated;
grant select, insert, update, delete on table public.platform_incidents to service_role;

comment on table public.platform_incidents is
  'Platform-only incident lifecycle overlay. Raw provider payloads and secrets must never be stored here.';
