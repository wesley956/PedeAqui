-- SAAS-06: keep the full promotion schedule server-only and expose only the
-- currently effective, tenant-safe projection required by the public menu.

revoke all on function public.get_public_product_promotions(uuid) from public;
revoke all on function public.get_public_product_promotions(uuid) from anon;
revoke all on function public.get_public_product_promotions(uuid) from authenticated;
grant execute on function public.get_public_product_promotions(uuid) to service_role;

create or replace function public.get_public_active_product_promotions(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', pp.product_id,
        'promotional_price_cents', pp.promotional_price_cents,
        'weekdays', pp.weekdays,
        'starts_on', pp.starts_on,
        'ends_on', pp.ends_on,
        'starts_at', pp.starts_at,
        'ends_at', pp.ends_at,
        'label', pp.label,
        'campaign_name', pp.campaign_name,
        'active', true
      ) order by pp.promotional_price_cents asc, pp.updated_at desc
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
  cross join lateral (
    select now() at time zone s.timezone as local_now
  ) tz
  cross join lateral (
    select
      tz.local_now::date as local_date,
      tz.local_now::time as local_time,
      extract(dow from tz.local_now)::integer as local_dow,
      (pp.starts_at is not null and pp.ends_at is not null and pp.ends_at <= pp.starts_at) as overnight
  ) local_parts
  cross join lateral (
    select (local_parts.overnight and local_parts.local_time < pp.ends_at) as after_midnight
  ) window_parts
  where pp.store_id = p_store_id
    and pp.active = true
    and s.status in ('active', 'temporarily_closed')
    and p.deleted_at is null
    and p.active = true
    and (
      case
        when window_parts.after_midnight then (local_parts.local_dow + 6) % 7
        else local_parts.local_dow
      end
    ) = any(pp.weekdays)
    and (
      pp.starts_on is null
      or (local_parts.local_date - case when window_parts.after_midnight then 1 else 0 end) >= pp.starts_on
    )
    and (
      pp.ends_on is null
      or (local_parts.local_date - case when window_parts.after_midnight then 1 else 0 end) <= pp.ends_on
    )
    and (
      (pp.starts_at is null and pp.ends_at is null)
      or (pp.starts_at is not null and pp.ends_at is null and local_parts.local_time >= pp.starts_at)
      or (pp.starts_at is null and pp.ends_at is not null and local_parts.local_time < pp.ends_at)
      or (
        pp.starts_at is not null
        and pp.ends_at is not null
        and not local_parts.overnight
        and local_parts.local_time >= pp.starts_at
        and local_parts.local_time < pp.ends_at
      )
      or (
        pp.starts_at is not null
        and pp.ends_at is not null
        and local_parts.overnight
        and (local_parts.local_time >= pp.starts_at or local_parts.local_time < pp.ends_at)
      )
    );
$$;

revoke all on function public.get_public_active_product_promotions(uuid) from public;
grant execute on function public.get_public_active_product_promotions(uuid) to anon, authenticated, service_role;
