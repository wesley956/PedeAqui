-- Existing stores retain scheduling until explicitly disabled by their operator.
alter table public.store_menu_settings
  add column if not exists allow_scheduling boolean not null default true;

-- Enforce the same policy for stale pages, direct requests and order snapshots.
create or replace function private.enforce_store_checkout_scheduling()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.scheduled_for is not null and exists (
    select 1 from public.store_menu_settings s
    where s.store_id=new.store_id and s.organization_id=new.organization_id
      and not s.allow_scheduling
  ) then
    raise exception 'Esta loja recebe somente pedidos para agora.';
  end if;
  return new;
end $$;
revoke all on function private.enforce_store_checkout_scheduling() from public,anon,authenticated;

create trigger checkout_sessions_enforce_store_scheduling
  before insert or update of scheduled_for on public.checkout_sessions
  for each row execute function private.enforce_store_checkout_scheduling();
-- Runs after orders_checkout_schedule_snapshot, which copies the checkout value.
create trigger orders_z_enforce_store_scheduling
  before insert on public.orders
  for each row execute function private.enforce_store_checkout_scheduling();
