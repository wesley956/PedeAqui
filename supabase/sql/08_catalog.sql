-- Catalog schema specification. Do not apply to the legacy Supabase project named Cruz.
-- This file will be promoted into a real migration when the new product database is provisioned.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(name) between 2 and 80),
  description text,
  image_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint categories_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint categories_org_store_id_unique unique (organization_id, store_id, id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  category_id uuid,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  image_url text,
  price_cents integer not null check (price_cents >= 0),
  promotional_price_cents integer check (promotional_price_cents is null or promotional_price_cents >= 0),
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  sku text,
  barcode text,
  preparation_time_minutes integer not null default 0 check (preparation_time_minutes between 0 and 1440),
  active boolean not null default true,
  availability text not null default 'available' check (availability in ('available', 'sold_out', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint products_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint products_category_same_store_fk foreign key (organization_id, store_id, category_id)
    references public.categories (organization_id, store_id, id) on delete set null,
  constraint products_org_store_id_unique unique (organization_id, store_id, id),
  constraint products_promo_not_above_regular check (promotional_price_cents is null or promotional_price_cents <= price_cents)
);

create unique index if not exists products_sku_store_unique
  on public.products (organization_id, store_id, lower(sku))
  where sku is not null and deleted_at is null;

create unique index if not exists products_barcode_store_unique
  on public.products (organization_id, store_id, barcode)
  where barcode is not null and deleted_at is null;

create table if not exists public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(name) between 2 and 100),
  description text,
  min_selection integer not null default 0 check (min_selection >= 0),
  max_selection integer not null default 1 check (max_selection >= 1),
  required boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint modifier_groups_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint modifier_groups_org_store_id_unique unique (organization_id, store_id, id),
  constraint modifier_groups_selection_range check (min_selection <= max_selection),
  constraint modifier_groups_required_min check (not required or min_selection >= 1)
);

create table if not exists public.modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  modifier_group_id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  price_cents integer not null default 0 check (price_cents >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint modifiers_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint modifiers_group_same_store_fk foreign key (organization_id, store_id, modifier_group_id)
    references public.modifier_groups (organization_id, store_id, id) on delete cascade,
  constraint modifiers_org_store_id_unique unique (organization_id, store_id, id)
);

create table if not exists public.product_modifier_groups (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  product_id uuid not null,
  modifier_group_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (product_id, modifier_group_id),
  constraint product_modifier_groups_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint product_modifier_groups_product_same_store_fk foreign key (organization_id, store_id, product_id)
    references public.products (organization_id, store_id, id) on delete cascade,
  constraint product_modifier_groups_group_same_store_fk foreign key (organization_id, store_id, modifier_group_id)
    references public.modifier_groups (organization_id, store_id, id) on delete cascade
);

create index if not exists categories_store_sort_idx on public.categories (store_id, sort_order) where deleted_at is null;
create index if not exists products_store_category_idx on public.products (store_id, category_id) where deleted_at is null;
create index if not exists products_store_availability_idx on public.products (store_id, availability) where deleted_at is null;
create index if not exists modifier_groups_store_sort_idx on public.modifier_groups (store_id, sort_order) where deleted_at is null;
create index if not exists modifiers_group_sort_idx on public.modifiers (modifier_group_id, sort_order) where deleted_at is null;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.product_modifier_groups enable row level security;

create policy "categories_view" on public.categories for select to authenticated
using (private.has_permission(organization_id, store_id, 'products.view'));
create policy "categories_create" on public.categories for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'products.create'));
create policy "categories_edit" on public.categories for update to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'))
with check (private.has_permission(organization_id, store_id, 'products.edit'));
create policy "categories_delete" on public.categories for delete to authenticated
using (private.has_permission(organization_id, store_id, 'products.delete'));

create policy "products_view" on public.products for select to authenticated
using (private.has_permission(organization_id, store_id, 'products.view'));
create policy "products_create" on public.products for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'products.create'));
create policy "products_edit" on public.products for update to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'))
with check (private.has_permission(organization_id, store_id, 'products.edit'));
create policy "products_delete" on public.products for delete to authenticated
using (private.has_permission(organization_id, store_id, 'products.delete'));

create policy "modifier_groups_view" on public.modifier_groups for select to authenticated
using (private.has_permission(organization_id, store_id, 'products.view'));
create policy "modifier_groups_create" on public.modifier_groups for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'products.create'));
create policy "modifier_groups_edit" on public.modifier_groups for update to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'))
with check (private.has_permission(organization_id, store_id, 'products.edit'));
create policy "modifier_groups_delete" on public.modifier_groups for delete to authenticated
using (private.has_permission(organization_id, store_id, 'products.delete'));

create policy "modifiers_view" on public.modifiers for select to authenticated
using (private.has_permission(organization_id, store_id, 'products.view'));
create policy "modifiers_create" on public.modifiers for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'products.create'));
create policy "modifiers_edit" on public.modifiers for update to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'))
with check (private.has_permission(organization_id, store_id, 'products.edit'));
create policy "modifiers_delete" on public.modifiers for delete to authenticated
using (private.has_permission(organization_id, store_id, 'products.delete'));

create policy "product_modifier_groups_view" on public.product_modifier_groups for select to authenticated
using (private.has_permission(organization_id, store_id, 'products.view'));
create policy "product_modifier_groups_create" on public.product_modifier_groups for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'products.edit'));
create policy "product_modifier_groups_edit" on public.product_modifier_groups for update to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'))
with check (private.has_permission(organization_id, store_id, 'products.edit'));
create policy "product_modifier_groups_delete" on public.product_modifier_groups for delete to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'));
