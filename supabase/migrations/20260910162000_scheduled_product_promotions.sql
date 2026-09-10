create table if not exists public.product_promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  product_id uuid not null,
  promotional_price_cents integer not null check (promotional_price_cents >= 0),
  weekdays smallint[] not null,
  starts_on date,
  ends_on date,
  starts_at time,
  ends_at time,
  label text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_promotions_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint product_promotions_product_same_store_fk foreign key (organization_id, store_id, product_id)
    references public.products (organization_id, store_id, id) on delete cascade,
  constraint product_promotions_product_unique unique (organization_id, store_id, product_id),
  constraint product_promotions_weekdays_not_empty check (cardinality(weekdays) > 0),
  constraint product_promotions_weekdays_valid check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint product_promotions_date_range check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint product_promotions_label_length check (label is null or char_length(label) <= 48)
);

create index if not exists product_promotions_store_active_idx
  on public.product_promotions (store_id, active, product_id);

alter table public.product_promotions enable row level security;

create policy "product_promotions_view" on public.product_promotions for select to authenticated
using (private.has_permission(organization_id, store_id, 'products.view'));

create policy "product_promotions_create" on public.product_promotions for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'products.edit'));

create policy "product_promotions_edit" on public.product_promotions for update to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'))
with check (private.has_permission(organization_id, store_id, 'products.edit'));

create policy "product_promotions_delete" on public.product_promotions for delete to authenticated
using (private.has_permission(organization_id, store_id, 'products.edit'));

revoke all on table public.product_promotions from anon;
