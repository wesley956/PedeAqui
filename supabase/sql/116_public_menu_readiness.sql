-- PedeAqui — prontidão comercial PA-DIAG-021 a PA-DIAG-025.
-- Ordenação explícita de produtos e contexto operacional no cardápio público.

alter table public.products
  add column if not exists sort_order integer not null default 0 check (sort_order >= 0);

create index if not exists products_store_category_sort_idx
  on public.products (store_id, category_id, sort_order, name)
  where deleted_at is null;

create or replace function private.get_public_menu(p_store_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.stores%rowtype;
  settings jsonb;
  hours jsonb;
  categories_json jsonb;
  uncategorized_products jsonb;
begin
  select * into s
  from public.stores
  where lower(slug) = lower(trim(p_store_slug))
    and status in ('active', 'temporarily_closed')
  limit 1;
  if s.id is null then return null; end if;

  select jsonb_build_object(
    'theme', coalesce(ms.theme, 'pedeaqui'),
    'primary_color', coalesce(ms.primary_color, '#FF6B00'),
    'logo_url', coalesce(ms.logo_url, s.logo_url),
    'cover_url', coalesce(ms.cover_url, s.cover_url),
    'show_search', coalesce(ms.show_search, true),
    'show_categories', coalesce(ms.show_categories, true),
    'show_product_images', coalesce(ms.show_product_images, true),
    'allow_pickup', coalesce(ms.allow_pickup, true),
    'allow_delivery', coalesce(ms.allow_delivery, true),
    'minimum_order_cents', coalesce(ms.minimum_order_cents, 0),
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

  select coalesce(jsonb_agg(category_obj order by category_sort, category_name), '[]'::jsonb)
  into categories_json
  from (
    select c.sort_order category_sort, c.name category_name,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'image_url', c.image_url,
        'products', (
          select jsonb_agg(jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'description', p.description,
            'image_url', p.image_url,
            'price_cents', p.price_cents,
            'promotional_price_cents', p.promotional_price_cents,
            'preparation_time_minutes', p.preparation_time_minutes,
            'availability', p.availability
          ) order by p.sort_order, p.name)
          from public.products p
          where p.organization_id = s.organization_id
            and p.store_id = s.id
            and p.category_id = c.id
            and p.active = true
            and p.availability <> 'inactive'
            and p.deleted_at is null
        )
      ) category_obj
    from public.categories c
    where c.organization_id = s.organization_id
      and c.store_id = s.id
      and c.active = true
      and c.deleted_at is null
      and exists (
        select 1
        from public.products p
        where p.organization_id = s.organization_id
          and p.store_id = s.id
          and p.category_id = c.id
          and p.active = true
          and p.availability <> 'inactive'
          and p.deleted_at is null
      )
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'image_url', p.image_url,
    'price_cents', p.price_cents,
    'promotional_price_cents', p.promotional_price_cents,
    'preparation_time_minutes', p.preparation_time_minutes,
    'availability', p.availability
  ) order by p.sort_order, p.name), '[]'::jsonb)
  into uncategorized_products
  from public.products p
  where p.organization_id = s.organization_id
    and p.store_id = s.id
    and p.category_id is null
    and p.active = true
    and p.availability <> 'inactive'
    and p.deleted_at is null;

  if jsonb_array_length(uncategorized_products) > 0 then
    categories_json := categories_json || jsonb_build_array(jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000000000',
      'name', 'Outros',
      'description', null,
      'image_url', null,
      'products', uncategorized_products
    ));
  end if;

  return jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'slug', s.slug,
      'phone', s.phone,
      'city', s.city,
      'state', s.state,
      'timezone', s.timezone,
      'status', s.status,
      'business_type', coalesce(s.business_type, 'restaurant')
    ),
    'settings', settings,
    'hours', hours,
    'categories', categories_json
  );
end;
$$;

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
