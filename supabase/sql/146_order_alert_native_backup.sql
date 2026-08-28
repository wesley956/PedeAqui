-- PedeAqui — presença do painel para fallback nativo de alerta de pedidos.
-- O navegador usa esta tabela somente através de rota autenticada do servidor.
-- O Print Agent consulta via service_role para assumir o som quando o painel fecha.

create table if not exists public.order_alert_panel_presence (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  browser_id uuid not null,
  is_active boolean not null default true,
  sound_enabled boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (store_id, browser_id)
);

create index if not exists order_alert_panel_presence_store_seen_idx
  on public.order_alert_panel_presence (store_id, is_active, last_seen_at desc);

create index if not exists order_alert_panel_presence_native_enabled_idx
  on public.order_alert_panel_presence (store_id, sound_enabled, last_seen_at desc);

alter table public.order_alert_panel_presence enable row level security;

revoke all on table public.order_alert_panel_presence from public, anon, authenticated;
grant select, insert, update, delete on table public.order_alert_panel_presence to service_role;
