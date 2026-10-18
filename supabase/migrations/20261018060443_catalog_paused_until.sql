-- Esgotado "só hoje": produto ou sabor pausado pode ter hora para voltar sozinho (normalmente 00:00 do dia seguinte,
-- no fuso da loja). Null = fica pausado até alguém reativar.
alter table public.products add column if not exists paused_until timestamptz;
alter table public.modifiers add column if not exists paused_until timestamptz;

-- Ao reativar por qualquer caminho (tela, edição, importação), o agendamento perde o sentido e é limpo.
create or replace function private.clear_product_paused_until()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.availability = 'available' then new.paused_until := null; end if;
  return new;
end $$;

create or replace function private.clear_modifier_paused_until()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.active then new.paused_until := null; end if;
  return new;
end $$;

revoke all on function private.clear_product_paused_until() from public, anon, authenticated;
revoke all on function private.clear_modifier_paused_until() from public, anon, authenticated;

create or replace trigger products_clear_paused_until before update of availability, paused_until on public.products
  for each row execute function private.clear_product_paused_until();

create or replace trigger modifiers_clear_paused_until before update of active, paused_until on public.modifiers
  for each row execute function private.clear_modifier_paused_until();

-- Reativa o que passou da hora. Só mexe em itens ainda pausados e não removidos.
create or replace function private.reactivate_scheduled_catalog_items()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_products integer;
  v_modifiers integer;
begin
  update public.products
     set availability = 'available', active = true, paused_until = null, updated_at = now()
   where paused_until is not null and paused_until <= now()
     and availability = 'sold_out' and deleted_at is null;
  get diagnostics v_products = row_count;

  update public.modifiers
     set active = true, paused_until = null, updated_at = now()
   where paused_until is not null and paused_until <= now()
     and not active and deleted_at is null;
  get diagnostics v_modifiers = row_count;

  return jsonb_build_object('products', v_products, 'modifiers', v_modifiers);
end $$;

revoke all on function private.reactivate_scheduled_catalog_items() from public, anon, authenticated;

create index if not exists products_paused_until_idx on public.products (paused_until) where paused_until is not null and deleted_at is null;
create index if not exists modifiers_paused_until_idx on public.modifiers (paused_until) where paused_until is not null and deleted_at is null;

-- cron.schedule com nome atualiza o job se ele já existir.
select cron.schedule('pedeaqui-catalog-reactivation', '*/5 * * * *', 'select private.reactivate_scheduled_catalog_items();');
