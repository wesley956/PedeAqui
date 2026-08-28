-- PedeAqui — eventos imutáveis para o fallback nativo de alerta.
-- Registra a chegada no momento do INSERT para que uma mudança rápida de status
-- não faça o Print Agent perder o aviso.

create table if not exists public.order_alert_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  display_number bigint,
  occurred_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists order_alert_events_store_id_idx
  on public.order_alert_events (store_id, id);

alter table public.order_alert_events enable row level security;

revoke all on table public.order_alert_events from public, anon, authenticated;
grant select, insert, delete on table public.order_alert_events to service_role;
grant usage, select on sequence public.order_alert_events_id_seq to service_role;

create or replace function public.capture_order_alert_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.order_status = 'pending_confirmation' then
    insert into public.order_alert_events (
      organization_id,
      store_id,
      order_id,
      display_number,
      occurred_at
    ) values (
      new.organization_id,
      new.store_id,
      new.id,
      new.display_number,
      coalesce(new.created_at, now())
    )
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_order_alert_event() from public, anon, authenticated;
grant execute on function public.capture_order_alert_event() to service_role;

drop trigger if exists trg_capture_order_alert_event on public.orders;
create trigger trg_capture_order_alert_event
after insert on public.orders
for each row execute function public.capture_order_alert_event();
