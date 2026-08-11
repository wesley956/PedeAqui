-- PedeAqui — bloco [033]–[035]
-- Endereços de clientes, configuração básica de entrega e taxa por bairro.

insert into public.permissions (key, description) values
  ('delivery.view', 'Visualizar configuração e regiões de entrega'),
  ('delivery.manage', 'Gerenciar configuração e regiões de entrega')
on conflict (key) do update set description = excluded.description;

-- Composite integrity for organization-scoped customer children.
alter table public.customers
  add constraint customers_organization_id_id_unique unique (organization_id, id);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  label text not null default 'Principal' check (char_length(trim(label)) between 2 and 40),
  recipient_name text,
  phone text,
  postal_code text not null check (char_length(regexp_replace(postal_code, '\D', '', 'g')) between 8 and 9),
  street text not null check (char_length(trim(street)) between 2 and 160),
  number text not null check (char_length(trim(number)) between 1 and 30),
  complement text,
  district text not null check (char_length(trim(district)) between 2 and 120),
  city text not null check (char_length(trim(city)) between 2 and 120),
  state text not null check (state ~ '^[A-Z]{2}$'),
  reference text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint customer_addresses_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete cascade
);

create index if not exists customer_addresses_customer_idx
  on public.customer_addresses (organization_id, customer_id)
  where deleted_at is null;
create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (customer_id)
  where is_default = true and deleted_at is null;

create or replace function private.keep_single_default_customer_address()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default = true and new.deleted_at is null then
    update public.customer_addresses
       set is_default = false,
           updated_at = now()
     where organization_id = new.organization_id
       and customer_id = new.customer_id
       and id <> new.id
       and is_default = true
       and deleted_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_single_default_customer_address() from public;

drop trigger if exists customer_addresses_single_default on public.customer_addresses;
create trigger customer_addresses_single_default
before insert or update of is_default, deleted_at
on public.customer_addresses
for each row execute function private.keep_single_default_customer_address();

create table if not exists public.store_delivery_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid primary key,
  enabled boolean not null default true,
  fee_mode text not null default 'neighborhood' check (fee_mode in ('default', 'neighborhood')),
  default_fee_cents integer not null default 0 check (default_fee_cents >= 0),
  free_delivery_over_cents integer check (free_delivery_over_cents is null or free_delivery_over_cents >= 0),
  estimated_min_minutes integer not null default 30 check (estimated_min_minutes between 0 and 1440),
  estimated_max_minutes integer not null default 60 check (estimated_max_minutes between 0 and 1440),
  max_distance_km numeric(7,2) check (max_distance_km is null or max_distance_km > 0),
  require_neighborhood_match boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_delivery_settings_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete cascade,
  constraint store_delivery_settings_eta_range
    check (estimated_min_minutes <= estimated_max_minutes)
);

create table if not exists public.delivery_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  neighborhood_name text not null check (char_length(trim(neighborhood_name)) between 2 and 120),
  neighborhood_key text not null check (char_length(neighborhood_key) between 2 and 180),
  city text not null check (char_length(trim(city)) between 2 and 120),
  state text not null check (state ~ '^[A-Z]{2}$'),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  minimum_order_cents integer check (minimum_order_cents is null or minimum_order_cents >= 0),
  additional_minutes integer not null default 0 check (additional_minutes between 0 and 1440),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint delivery_neighborhoods_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete cascade
);

create unique index if not exists delivery_neighborhoods_store_key_unique
  on public.delivery_neighborhoods (store_id, neighborhood_key)
  where deleted_at is null;
create index if not exists delivery_neighborhoods_quote_idx
  on public.delivery_neighborhoods (store_id, neighborhood_key, active)
  where deleted_at is null;

alter table public.customer_addresses enable row level security;
alter table public.store_delivery_settings enable row level security;
alter table public.delivery_neighborhoods enable row level security;

create policy customer_addresses_view on public.customer_addresses
for select to authenticated
using (private.has_permission(organization_id, null, 'customers.view'));
create policy customer_addresses_insert on public.customer_addresses
for insert to authenticated
with check (private.has_permission(organization_id, null, 'customers.manage'));
create policy customer_addresses_update on public.customer_addresses
for update to authenticated
using (private.has_permission(organization_id, null, 'customers.manage'))
with check (private.has_permission(organization_id, null, 'customers.manage'));
create policy customer_addresses_delete on public.customer_addresses
for delete to authenticated
using (private.has_permission(organization_id, null, 'customers.manage'));

create policy store_delivery_settings_view on public.store_delivery_settings
for select to authenticated
using (private.has_permission(organization_id, store_id, 'delivery.view'));
create policy store_delivery_settings_insert on public.store_delivery_settings
for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'delivery.manage'));
create policy store_delivery_settings_update on public.store_delivery_settings
for update to authenticated
using (private.has_permission(organization_id, store_id, 'delivery.manage'))
with check (private.has_permission(organization_id, store_id, 'delivery.manage'));

create policy delivery_neighborhoods_view on public.delivery_neighborhoods
for select to authenticated
using (private.has_permission(organization_id, store_id, 'delivery.view'));
create policy delivery_neighborhoods_insert on public.delivery_neighborhoods
for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'delivery.manage'));
create policy delivery_neighborhoods_update on public.delivery_neighborhoods
for update to authenticated
using (private.has_permission(organization_id, store_id, 'delivery.manage'))
with check (private.has_permission(organization_id, store_id, 'delivery.manage'));
create policy delivery_neighborhoods_delete on public.delivery_neighborhoods
for delete to authenticated
using (private.has_permission(organization_id, store_id, 'delivery.manage'));

-- Public summary used by the menu. Internal neighborhood rows remain protected.
create or replace function private.get_public_delivery_summary(p_store_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.stores%rowtype;
  ds public.store_delivery_settings%rowtype;
  min_neighborhood_fee integer;
begin
  select * into s
    from public.stores
   where lower(slug) = lower(trim(p_store_slug))
     and status in ('active', 'temporarily_closed')
   limit 1;
  if s.id is null then return null; end if;

  select * into ds
    from public.store_delivery_settings
   where organization_id = s.organization_id and store_id = s.id;

  select min(fee_cents) into min_neighborhood_fee
    from public.delivery_neighborhoods
   where organization_id = s.organization_id
     and store_id = s.id
     and active = true
     and deleted_at is null;

  return jsonb_build_object(
    'enabled', coalesce(ds.enabled, true),
    'fee_mode', coalesce(ds.fee_mode, 'neighborhood'),
    'default_fee_cents', coalesce(ds.default_fee_cents, 0),
    'free_delivery_over_cents', ds.free_delivery_over_cents,
    'estimated_min_minutes', coalesce(ds.estimated_min_minutes, 30),
    'estimated_max_minutes', coalesce(ds.estimated_max_minutes, 60),
    'starting_fee_cents', case
      when coalesce(ds.fee_mode, 'neighborhood') = 'neighborhood'
        then coalesce(min_neighborhood_fee, ds.default_fee_cents, 0)
      else coalesce(ds.default_fee_cents, 0)
    end
  );
end;
$$;

revoke all on function private.get_public_delivery_summary(text) from public;
grant execute on function private.get_public_delivery_summary(text) to anon, authenticated;

create or replace function public.get_public_menu(p_store_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when menu is null then null
    else menu || jsonb_build_object('delivery', private.get_public_delivery_summary(p_store_slug))
  end
  from (select private.get_public_menu(p_store_slug) as menu) q;
$$;

revoke all on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated;
