-- PedeAqui — hardening do carrinho Growth.
-- Revalida benefícios depois de qualquer repricing/alteração do carrinho.

create or replace function public.growth_refresh_cart_benefits_internal(
  p_store_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cart public.carts%rowtype;
  v_growth jsonb;
  v_discount bigint;
  v_total bigint;
  v_reason text;
begin
  select * into v_cart
  from public.carts
  where store_id=p_store_id and token_hash=p_token_hash and status='active' and expires_at>now()
  for update;
  if v_cart.id is null then raise exception 'cart unavailable'; end if;

  if v_cart.coupon_id is null
     and v_cart.cashback_redeem_requested_cents=0
     and v_cart.loyalty_redeem_requested_points=0 then
    v_total:=greatest(0,v_cart.subtotal_cents+v_cart.delivery_fee_cents);
    update public.carts set discount_cents=0,coupon_discount_cents=0,cashback_discount_cents=0,loyalty_discount_cents=0,
      total_cents=v_total,updated_at=case when total_cents is distinct from v_total or discount_cents<>0 then now() else updated_at end
    where id=v_cart.id;
    return jsonb_build_object('cart_id',v_cart.id,'valid',true,'cleared',false,'discount_cents',0,'total_cents',v_total);
  end if;

  begin
    v_growth:=private.resolve_growth_benefits(
      v_cart.organization_id,v_cart.store_id,v_cart.customer_id,'digital_menu',v_cart.subtotal_cents,
      v_cart.coupon_id,v_cart.coupon_code_snapshot,v_cart.cashback_redeem_requested_cents,v_cart.loyalty_redeem_requested_points
    );
    v_discount:=(v_growth->>'discount_cents')::bigint;
    v_total:=greatest(0,v_cart.subtotal_cents-v_discount+v_cart.delivery_fee_cents);
    update public.carts set
      coupon_id=nullif(v_growth->>'coupon_id','')::uuid,
      coupon_code_snapshot=nullif(v_growth->>'coupon_code',''),
      coupon_discount_cents=(v_growth->>'coupon_discount_cents')::bigint,
      cashback_discount_cents=(v_growth->>'cashback_discount_cents')::bigint,
      loyalty_discount_cents=(v_growth->>'loyalty_discount_cents')::bigint,
      discount_cents=v_discount,total_cents=v_total,
      updated_at=case when discount_cents is distinct from v_discount or total_cents is distinct from v_total then now() else updated_at end
    where id=v_cart.id;
    return v_growth||jsonb_build_object('cart_id',v_cart.id,'valid',true,'cleared',false,'total_cents',v_total);
  exception when others then
    v_reason:=left(sqlerrm,240);
    v_total:=greatest(0,v_cart.subtotal_cents+v_cart.delivery_fee_cents);
    update public.carts set
      coupon_id=null,coupon_code_snapshot=null,coupon_discount_cents=0,
      cashback_redeem_requested_cents=0,cashback_discount_cents=0,
      loyalty_redeem_requested_points=0,loyalty_discount_cents=0,
      discount_cents=0,total_cents=v_total,updated_at=now()
    where id=v_cart.id;
    return jsonb_build_object('cart_id',v_cart.id,'valid',false,'cleared',true,'reason',v_reason,'discount_cents',0,'total_cents',v_total);
  end;
end;
$$;
revoke all on function public.growth_refresh_cart_benefits_internal(uuid,text) from public,anon,authenticated;
grant execute on function public.growth_refresh_cart_benefits_internal(uuid,text) to service_role;
