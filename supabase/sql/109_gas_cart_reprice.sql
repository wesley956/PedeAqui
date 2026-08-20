-- PedeAqui — reprecificação segmentada de carrinho [364].
-- Mantém o componente de casco sincronizado durante toda revalidação server-side.

create or replace function public.cart_apply_reprice_internal(
  p_store_id uuid, p_token_hash text, p_updates jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cart_id uuid;
  u jsonb;
  m jsonb;
  v_subtotal bigint;
  v_invalid integer;
begin
  if jsonb_typeof(coalesce(p_updates,'[]'::jsonb)) <> 'array' then raise exception 'invalid updates'; end if;
  select id into v_cart_id from public.carts where store_id=p_store_id and token_hash=p_token_hash and status='active' and expires_at>now() for update;
  if v_cart_id is null then raise exception 'cart unavailable'; end if;

  for u in select value from jsonb_array_elements(coalesce(p_updates,'[]'::jsonb)) loop
    update public.cart_items
    set product_name_snapshot = coalesce(u->>'product_name', product_name_snapshot),
        product_image_url_snapshot = case when u ? 'product_image_url' then nullif(u->>'product_image_url','') else product_image_url_snapshot end,
        unit_base_price_cents = coalesce((u->>'unit_base_price_cents')::integer, unit_base_price_cents),
        unit_modifiers_price_cents = coalesce((u->>'unit_modifiers_price_cents')::integer, unit_modifiers_price_cents),
        unit_segment_price_cents = coalesce((u->>'unit_segment_price_cents')::integer, unit_segment_price_cents),
        unit_total_price_cents = coalesce((u->>'unit_total_price_cents')::integer, unit_total_price_cents),
        line_total_cents = coalesce((u->>'line_total_cents')::bigint, line_total_cents),
        validation_status = (u->>'validation_status'),
        price_changed_at = case when coalesce((u->>'price_changed')::boolean,false) then now() else price_changed_at end,
        updated_at = now()
    where id=(u->>'item_id')::uuid and cart_id=v_cart_id;

    if u ? 'unit_segment_price_cents' then
      update public.cart_item_gas_options
      set unit_container_price_cents=(u->>'unit_segment_price_cents')::integer
      where cart_item_id=(u->>'item_id')::uuid;
    end if;

    if u ? 'modifiers' and (u->>'validation_status') = 'valid' then
      delete from public.cart_item_modifiers where cart_item_id=(u->>'item_id')::uuid;
      for m in select value from jsonb_array_elements(u->'modifiers') loop
        insert into public.cart_item_modifiers(
          organization_id, store_id, cart_item_id, modifier_group_id, modifier_id,
          group_name_snapshot, modifier_name_snapshot, unit_price_cents
        )
        select ci.organization_id, ci.store_id, ci.id,
          (m->>'group_id')::uuid,(m->>'modifier_id')::uuid,m->>'group_name',m->>'modifier_name',(m->>'unit_price_cents')::integer
        from public.cart_items ci where ci.id=(u->>'item_id')::uuid and ci.cart_id=v_cart_id;
      end loop;
    end if;
  end loop;

  select coalesce(sum(line_total_cents),0) into v_subtotal from public.cart_items where cart_id=v_cart_id and validation_status='valid';
  select count(*) into v_invalid from public.cart_items where cart_id=v_cart_id and validation_status<>'valid';
  update public.carts set subtotal_cents=v_subtotal,total_cents=greatest(0,v_subtotal-discount_cents+delivery_fee_cents),last_validated_at=now(),updated_at=now() where id=v_cart_id;
  return jsonb_build_object('cart_id',v_cart_id,'subtotal_cents',v_subtotal,'invalid_items',v_invalid);
end; $$;

revoke all on function public.cart_apply_reprice_internal(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.cart_apply_reprice_internal(uuid,text,jsonb) to service_role;
