-- PedeAqui — bloco [025]–[032]
-- Configuração de cardápio, horários, pausa operacional, projeções públicas e clientes.

create unique index if not exists stores_public_slug_unique
  on public.stores (lower(slug));

create table if not exists public.store_menu_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid primary key,
  theme text not null default 'pedeaqui',
  primary_color text not null default '#FF6B00' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text,
  cover_url text,
  show_search boolean not null default true,
  show_categories boolean not null default true,
  show_product_images boolean not null default true,
  allow_pickup boolean not null default true,
  allow_delivery boolean not null default true,
  minimum_order_cents integer not null default 0 check (minimum_order_cents >= 0),
  active boolean not null default true,
  accepting_orders boolean not null default true,
  pause_reason text,
  paused_at timestamptz,
  paused_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_menu_settings_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint store_menu_settings_pause_consistency check (
    (accepting_orders = true and paused_at is null)
    or accepting_orders = false
  )
);

create table if not exists public.store_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  closes_next_day boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_hours_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint store_hours_nonzero_interval check (opens_at <> closes_at),
  unique (store_id, weekday, opens_at, closes_at, closes_next_day)
);

create index if not exists store_hours_lookup_idx
  on public.store_hours (store_id, weekday, active, sort_order);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text,
  phone_normalized text,
  email text,
  birth_date date,
  orders_count integer not null default 0 check (orders_count >= 0),
  total_spent_cents bigint not null default 0 check (total_spent_cents >= 0),
  average_ticket_cents integer not null default 0 check (average_ticket_cents >= 0),
  last_order_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists customers_phone_org_unique
  on public.customers (organization_id, phone_normalized)
  where phone_normalized is not null and deleted_at is null;
create index if not exists customers_org_name_idx
  on public.customers (organization_id, name)
  where deleted_at is null;

alter table public.store_menu_settings enable row level security;
alter table public.store_hours enable row level security;
alter table public.customers enable row level security;

create policy store_menu_settings_view on public.store_menu_settings
for select to authenticated
using (private.can_access_store(organization_id, store_id));
create policy store_menu_settings_insert on public.store_menu_settings
for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'stores.manage'));
create policy store_menu_settings_update on public.store_menu_settings
for update to authenticated
using (private.has_permission(organization_id, store_id, 'stores.manage'))
with check (private.has_permission(organization_id, store_id, 'stores.manage'));

create policy store_hours_view on public.store_hours
for select to authenticated
using (private.can_access_store(organization_id, store_id));
create policy store_hours_insert on public.store_hours
for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'stores.manage'));
create policy store_hours_update on public.store_hours
for update to authenticated
using (private.has_permission(organization_id, store_id, 'stores.manage'))
with check (private.has_permission(organization_id, store_id, 'stores.manage'));
create policy store_hours_delete on public.store_hours
for delete to authenticated
using (private.has_permission(organization_id, store_id, 'stores.manage'));

create policy customers_view on public.customers
for select to authenticated
using (private.has_permission(organization_id, null, 'customers.view'));
create policy customers_insert on public.customers
for insert to authenticated
with check (private.has_permission(organization_id, null, 'customers.manage'));
create policy customers_update on public.customers
for update to authenticated
using (private.has_permission(organization_id, null, 'customers.manage'))
with check (private.has_permission(organization_id, null, 'customers.manage'));
create policy customers_delete on public.customers
for delete to authenticated
using (private.has_permission(organization_id, null, 'customers.manage'));

-- Public menu projection. Never grants anonymous SELECT on internal catalog tables.
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
begin
  select * into s
  from public.stores
  where lower(slug) = lower(trim(p_store_slug))
    and status in ('active', 'temporarily_closed')
  limit 1;

  if s.id is null then
    return null;
  end if;

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

  if coalesce((settings->>'active')::boolean, true) = false then
    return null;
  end if;

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
    select c.sort_order as category_sort, c.name as category_name,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'image_url', c.image_url,
        'products', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'description', p.description,
            'image_url', p.image_url,
            'price_cents', p.price_cents,
            'promotional_price_cents', p.promotional_price_cents,
            'preparation_time_minutes', p.preparation_time_minutes,
            'availability', p.availability
          ) order by p.name)
          from public.products p
          where p.organization_id = s.organization_id
            and p.store_id = s.id
            and p.category_id = c.id
            and p.active = true
            and p.availability <> 'inactive'
            and p.deleted_at is null
        ), '[]'::jsonb)
      ) as category_obj
    from public.categories c
    where c.organization_id = s.organization_id
      and c.store_id = s.id
      and c.active = true
      and c.deleted_at is null
  ) q;

  return jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'slug', s.slug,
      'phone', s.phone,
      'city', s.city,
      'state', s.state,
      'timezone', s.timezone,
      'status', s.status
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
  settings_active boolean;
  groups_json jsonb;
begin
  select * into s from public.stores
  where lower(slug) = lower(trim(p_store_slug))
    and status in ('active', 'temporarily_closed')
  limit 1;
  if s.id is null then return null; end if;

  select coalesce(ms.active, true) into settings_active
  from (select 1) x left join public.store_menu_settings ms on ms.store_id = s.id;
  if settings_active = false then return null; end if;

  select * into p from public.products
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
    select pmg.sort_order as group_sort, g.name as group_name,
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
      ) as group_obj
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
    'store', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status),
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

revoke all on function private.get_public_menu(text) from public;
revoke all on function private.get_public_product(text, uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.get_public_menu(text) to anon, authenticated;
grant execute on function private.get_public_product(text, uuid) to anon, authenticated;

create or replace function public.get_public_menu(p_store_slug text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_public_menu(p_store_slug); $$;
create or replace function public.get_public_product(p_store_slug text, p_product_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_public_product(p_store_slug, p_product_id); $$;

revoke all on function public.get_public_menu(text) from public;
revoke all on function public.get_public_product(text, uuid) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated;
grant execute on function public.get_public_product(text, uuid) to anon, authenticated;
