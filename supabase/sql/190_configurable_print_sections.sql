-- Organização configurável do pedido em seções, com categorias de bebida explícitas.

alter table public.store_print_preferences
  add column if not exists item_layout text not null default 'continuous',
  add column if not exists order_section_title text not null default 'PEDIDO',
  add column if not exists drinks_section_title text not null default 'BEBIDAS',
  add column if not exists drink_category_ids uuid[] not null default '{}';

alter table public.store_print_preferences
  drop constraint if exists store_print_preferences_item_layout_check,
  drop constraint if exists store_print_preferences_order_section_title_check,
  drop constraint if exists store_print_preferences_drinks_section_title_check;

alter table public.store_print_preferences
  add constraint store_print_preferences_item_layout_check
    check (item_layout in ('continuous', 'sections')),
  add constraint store_print_preferences_order_section_title_check
    check (char_length(trim(order_section_title)) between 1 and 40),
  add constraint store_print_preferences_drinks_section_title_check
    check (char_length(trim(drinks_section_title)) between 1 and 40);

-- A categoria é fotografada no payload. Assim o cupom continua correto mesmo
-- se o cardápio for reorganizado depois que o pedido foi confirmado.
create or replace function private.print_order_items_payload(p_order_id uuid, p_station_id uuid, p_filter_station boolean)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_item_id', oi.id,
      'product_id', oi.product_id,
      'category_id', p.category_id,
      'category_name', c.name,
      'name', oi.product_name_snapshot,
      'quantity', oi.quantity,
      'note', oi.note,
      'unit_total_cents', oi.unit_total_price_cents,
      'line_total_cents', oi.line_total_cents,
      'modifiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'group', oim.group_name_snapshot,
          'name', oim.modifier_name_snapshot,
          'unit_price_cents', oim.unit_price_cents,
          'quantity', oim.quantity
        ) order by oim.created_at)
        from public.order_item_modifiers oim
        where oim.order_item_id = oi.id
      ), '[]'::jsonb)
    ) order by oi.created_at
  ), '[]'::jsonb)
  from public.order_items oi
  left join public.products p
    on p.id = oi.product_id and p.organization_id = oi.organization_id and p.store_id = oi.store_id
  left join public.categories c
    on c.id = p.category_id and c.organization_id = oi.organization_id and c.store_id = oi.store_id
  where oi.order_id = p_order_id
    and (
      not p_filter_station
      or exists (
        select 1 from public.product_production_stations pps
        where pps.organization_id = oi.organization_id
          and pps.store_id = oi.store_id
          and pps.product_id = oi.product_id
          and pps.station_id = p_station_id
      )
    );
$$;

revoke all on function private.print_order_items_payload(uuid,uuid,boolean) from public, anon, authenticated;
