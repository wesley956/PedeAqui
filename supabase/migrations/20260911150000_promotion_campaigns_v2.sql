alter table public.product_promotions
  add column if not exists promotion_group_id uuid,
  add column if not exists campaign_name text;

update public.product_promotions
set promotion_group_id = gen_random_uuid()
where promotion_group_id is null;

alter table public.product_promotions
  alter column promotion_group_id set default gen_random_uuid(),
  alter column promotion_group_id set not null;

alter table public.product_promotions
  drop constraint if exists product_promotions_product_unique;

alter table public.product_promotions
  drop constraint if exists product_promotions_campaign_name_length;

alter table public.product_promotions
  add constraint product_promotions_campaign_name_length
  check (campaign_name is null or char_length(campaign_name) <= 80);

create index if not exists product_promotions_store_product_active_idx
  on public.product_promotions (store_id, product_id, active);

create index if not exists product_promotions_group_idx
  on public.product_promotions (organization_id, store_id, promotion_group_id);

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
        'promotion_group_id', pp.promotion_group_id,
        'campaign_name', pp.campaign_name,
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
