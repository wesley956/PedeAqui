-- PedeAqui Intelligence Core — #1060 / INT-09
-- Additive channel extension only. Existing coupons.allowed_channels rows are intentionally untouched.

create or replace function public.growth_customer_benefits_internal(
  p_store_id uuid,
  p_customer_id uuid,
  p_contact_id uuid,
  p_channel text default 'digital_menu',
  p_subtotal_cents bigint default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_store public.stores%rowtype;
  v_customer public.customers%rowtype;
  v_settings public.store_growth_settings%rowtype;
  v_coupon public.coupons%rowtype;
  v_resolved jsonb;
  v_coupons jsonb := '[]'::jsonb;
  v_cashback bigint := 0;
  v_points bigint := 0;
begin
  if p_channel not in ('digital_menu','whatsapp','pdv','counter','waiter','table_qr','manual') then
    raise exception 'invalid benefit channel';
  end if;
  if p_subtotal_cents is not null and p_subtotal_cents < 0 then
    raise exception 'invalid subtotal';
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id and status = 'active';
  if v_store.id is null then
    raise exception 'store unavailable';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
    and organization_id = v_store.organization_id
    and deleted_at is null;
  if v_customer.id is null then
    raise exception 'customer unavailable for store organization';
  end if;

  if not exists(
    select 1
    from public.contacts ct
    where ct.id = p_contact_id
      and ct.organization_id = v_store.organization_id
      and ct.store_id = v_store.id
      and ct.customer_id = v_customer.id
  ) then
    raise exception 'conversation contact is not linked to customer';
  end if;

  if not private.store_module_enabled(v_store.organization_id, v_store.id, 'growth') then
    return jsonb_build_object(
      'identified', true,
      'available', false,
      'reason', 'growth_disabled',
      'coupons', '[]'::jsonb
    );
  end if;

  select * into v_settings
  from public.store_growth_settings
  where organization_id = v_store.organization_id
    and store_id = v_store.id;

  if coalesce(v_settings.cashback_enabled, false) then
    v_cashback := private.cashback_available_balance(
      v_store.organization_id,
      v_store.id,
      v_customer.id,
      now()
    );
  end if;

  if coalesce(v_settings.loyalty_enabled, false) then
    select coalesce(balance_points, 0) into v_points
    from public.loyalty_accounts
    where organization_id = v_store.organization_id
      and store_id = v_store.id
      and customer_id = v_customer.id;
  end if;

  for v_coupon in
    select c.*
    from public.coupons c
    where c.organization_id = v_store.organization_id
      and c.store_id = v_store.id
      and c.deleted_at is null
      and c.active
      and c.valid_from <= now()
      and (c.valid_until is null or c.valid_until > now())
      and p_channel = any(c.allowed_channels)
    order by c.valid_until nulls last, c.created_at, c.id
  loop
    begin
      -- Reuse the checkout resolver. This query never reserves or consumes a benefit.
      v_resolved := private.resolve_growth_benefits(
        v_store.organization_id,
        v_store.id,
        v_customer.id,
        p_channel,
        coalesce(p_subtotal_cents, v_coupon.minimum_order_cents),
        v_coupon.id,
        null,
        0,
        0
      );

      v_coupons := v_coupons || jsonb_build_array(jsonb_build_object(
        'id', v_coupon.id,
        'code', v_coupon.code,
        'name', v_coupon.name,
        'discount_type', v_coupon.discount_type,
        'fixed_discount_cents', v_coupon.fixed_discount_cents,
        'percentage_bps', v_coupon.percentage_bps,
        'max_discount_cents', v_coupon.max_discount_cents,
        'minimum_order_cents', v_coupon.minimum_order_cents,
        'valid_until', v_coupon.valid_until,
        'eligible_for_subtotal', p_subtotal_cents is not null,
        'discount_cents', case
          when p_subtotal_cents is null then null
          else (v_resolved->>'coupon_discount_cents')::bigint
        end
      ));
    exception when others then
      continue;
    end;
  end loop;

  return jsonb_build_object(
    'identified', true,
    'available', true,
    'customer_id', v_customer.id,
    'cashback_enabled', coalesce(v_settings.cashback_enabled, false),
    'cashback_balance_cents', coalesce(v_cashback, 0),
    'loyalty_enabled', coalesce(v_settings.loyalty_enabled, false),
    'loyalty_balance_points', coalesce(v_points, 0),
    'loyalty_redeem_cents_per_point', coalesce(v_settings.loyalty_redeem_cents_per_point, 1),
    'coupons', v_coupons,
    'evaluated_at', now()
  );
end $$;

revoke all on function public.growth_customer_benefits_internal(uuid,uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.growth_customer_benefits_internal(uuid,uuid,uuid,text,bigint) to service_role;

comment on function public.growth_customer_benefits_internal(uuid,uuid,uuid,text,bigint) is
  'Read-only canonical Growth benefits resolver by channel. INT-09 adds whatsapp without backfilling legacy coupon channels.';
