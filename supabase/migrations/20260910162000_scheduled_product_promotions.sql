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

-- Public menu pricing must not depend on the service-role credential. This function only
-- exposes merchandising fields that are already intended to be visible to menu visitors.
-- Returning inactive/out-of-window schedules is intentional: the application needs to
-- distinguish "no schedule" (legacy static promotional price remains valid) from
-- "schedule exists but is not active now" (normal price must be restored).
create or replace function public.get_public_product_promotions(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pp.id,
        'organization_id', pp.organization_id,
        'store_id', pp.store_id,
        'product_id', pp.product_id,
        'promotional_price_cents', pp.promotional_price_cents,
        'weekdays', pp.weekdays,
        'starts_on', pp.starts_on,
        'ends_on', pp.ends_on,
        'starts_at', pp.starts_at,
        'ends_at', pp.ends_at,
        'label', pp.label,
        'active', pp.active
      ) order by pp.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.product_promotions pp
  join public.stores s
    on s.id = pp.store_id
   and s.organization_id = pp.organization_id
  join public.products p
    on p.id = pp.product_id
   and p.store_id = pp.store_id
   and p.organization_id = pp.organization_id
  where pp.store_id = p_store_id
    and s.status in ('active', 'temporarily_closed')
    and p.deleted_at is null
    and p.active = true;
$$;

revoke all on function public.get_public_product_promotions(uuid) from public;
grant execute on function public.get_public_product_promotions(uuid) to anon, authenticated;
