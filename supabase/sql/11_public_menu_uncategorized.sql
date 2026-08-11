-- Produtos sem categoria continuam visíveis no cardápio público em uma seção virtual "Outros".

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
  from (select 1) x left join public.store_menu_settings ms on ms.store_id = s.id;
  if coalesce((settings->>'active')::boolean, true) = false then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday', h.weekday,
    'opens_at', to_char(h.opens_at, 'HH24:MI'),
    'closes_at', to_char(h.closes_at, 'HH24:MI'),
    'closes_next_day', h.closes_next_day
  ) order by h.weekday, h.sort_order, h.opens_at), '[]'::jsonb)
  into hours
  from public.store_hours h where h.store_id = s.id and h.active = true;

  select coalesce(jsonb_agg(category_obj order by category_sort, category_name), '[]'::jsonb)
  into categories_json
  from (
    select c.sort_order category_sort, c.name category_name,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'image_url', c.image_url,
        'products', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id, 'name', p.name, 'description', p.description, 'image_url', p.image_url,
            'price_cents', p.price_cents, 'promotional_price_cents', p.promotional_price_cents,
            'preparation_time_minutes', p.preparation_time_minutes, 'availability', p.availability
          ) order by p.name)
          from public.products p
          where p.organization_id = s.organization_id and p.store_id = s.id and p.category_id = c.id
            and p.active = true and p.availability <> 'inactive' and p.deleted_at is null
        ), '[]'::jsonb)
      ) category_obj
    from public.categories c
    where c.organization_id = s.organization_id and c.store_id = s.id
      and c.active = true and c.deleted_at is null
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description, 'image_url', p.image_url,
    'price_cents', p.price_cents, 'promotional_price_cents', p.promotional_price_cents,
    'preparation_time_minutes', p.preparation_time_minutes, 'availability', p.availability
  ) order by p.name), '[]'::jsonb)
  into uncategorized_products
  from public.products p
  where p.organization_id = s.organization_id and p.store_id = s.id and p.category_id is null
    and p.active = true and p.availability <> 'inactive' and p.deleted_at is null;

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
    'store', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'phone', s.phone,
      'city', s.city, 'state', s.state, 'timezone', s.timezone, 'status', s.status),
    'settings', settings,
    'hours', hours,
    'categories', categories_json
  );
end;
$$;
