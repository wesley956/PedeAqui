-- PedeAqui — PA-PUBLIC-UX-009 / #784
-- Consolida a estrutura genérica de divisão igual de opções do cardápio.
-- Não contém dados específicos de restaurante, produto, slug ou UUID.

alter table public.modifier_groups
  add column if not exists distribution_total integer;

alter table public.modifier_groups
  drop constraint if exists modifier_groups_selection_mode_check;

alter table public.modifier_groups
  add constraint modifier_groups_selection_mode_check
  check (
    selection_mode = any (
      array[
        'distinct_choices'::text,
        'quantity_per_option'::text,
        'equal_split_options'::text
      ]
    )
  );

alter table public.modifier_groups
  drop constraint if exists modifier_groups_distribution_total_check;

alter table public.modifier_groups
  add constraint modifier_groups_distribution_total_check
  check (
    (selection_mode = 'equal_split_options' and distribution_total between 1 and 100)
    or
    (selection_mode <> 'equal_split_options' and distribution_total is null)
  );

-- A leitura pública expõe explicitamente o modo do grupo e o total a distribuir.
create or replace function private.get_public_product(p_store_slug text, p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.stores%rowtype;
  p public.products%rowtype;
  settings jsonb;
  hours jsonb;
  groups_json jsonb;
begin
  select * into s
  from public.stores
  where lower(slug) = lower(trim(p_store_slug))
    and status in ('active', 'temporarily_closed')
  limit 1;
  if s.id is null then return null; end if;

  select jsonb_build_object(
    'active', coalesce(ms.active, true),
    'accepting_orders', coalesce(ms.accepting_orders, true),
    'pause_reason', ms.pause_reason
  ) into settings
  from (select 1) x
  left join public.store_menu_settings ms on ms.store_id = s.id;
  if coalesce((settings->>'active')::boolean, true) = false then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday', h.weekday,
    'opens_at', to_char(h.opens_at, 'HH24:MI'),
    'closes_at', to_char(h.closes_at, 'HH24:MI'),
    'closes_next_day', h.closes_next_day
  ) order by h.weekday, h.sort_order, h.opens_at), '[]'::jsonb)
  into hours
  from public.store_hours h
  where h.store_id = s.id and h.active = true;

  select * into p
  from public.products
  where id = p_product_id
    and organization_id = s.organization_id
    and store_id = s.id
    and active = true
    and availability <> 'inactive'
    and deleted_at is null;
  if p.id is null then return null; end if;

  select coalesce(jsonb_agg(group_obj order by group_sort, group_name), '[]'::jsonb)
  into groups_json
  from (
    select pmg.sort_order group_sort, g.name group_name,
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'description', g.description,
        'min_selection', g.min_selection,
        'max_selection', g.max_selection,
        'required', g.required,
        'selection_mode', coalesce(g.selection_mode, 'distinct_choices'),
        'distribution_total', g.distribution_total,
        'modifiers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id,
            'name', m.name,
            'price_cents', m.price_cents
          ) order by m.sort_order, m.name)
          from public.modifiers m
          where m.modifier_group_id = g.id
            and m.organization_id = s.organization_id
            and m.store_id = s.id
            and m.active = true
            and m.deleted_at is null
        ), '[]'::jsonb)
      ) group_obj
    from public.product_modifier_groups pmg
    join public.modifier_groups g
      on g.id = pmg.modifier_group_id
      and g.organization_id = pmg.organization_id
      and g.store_id = pmg.store_id
    where pmg.product_id = p.id
      and pmg.organization_id = s.organization_id
      and pmg.store_id = s.id
      and g.active = true
      and g.deleted_at is null
  ) q;

  return jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'slug', s.slug,
      'status', s.status,
      'timezone', s.timezone,
      'business_type', coalesce(s.business_type, 'restaurant')
    ),
    'settings', settings,
    'hours', hours,
    'product', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'image_url', p.image_url,
      'price_cents', p.price_cents,
      'promotional_price_cents', p.promotional_price_cents,
      'preparation_time_minutes', p.preparation_time_minutes,
      'availability', p.availability,
      'modifier_groups', groups_json
    )
  );
end;
$$;
