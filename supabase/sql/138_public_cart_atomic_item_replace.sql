-- PedeAqui — PA-PUBLIC-UX-005 / #754
-- Edição pública de uma montagem existente sem duplicar a linha do carrinho.
-- A função reutiliza os RPCs autoritativos de inclusão e, dentro da mesma
-- transação, remove a linha anterior somente após a nova montagem ser válida.

create or replace function public.cart_replace_item_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_token_hash text,
  p_existing_item_id uuid,
  p_expires_at timestamptz,
  p_product_id uuid,
  p_product_name text,
  p_product_image_url text,
  p_unit_base_price_cents integer,
  p_quantity integer,
  p_note text,
  p_modifiers jsonb,
  p_sale_mode text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart_id uuid;
  v_existing_product_id uuid;
  v_result jsonb;
  v_new_item_id uuid;
  v_new_cart_id uuid;
  v_subtotal bigint;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid cart token hash'; end if;

  select c.id, ci.product_id
    into v_cart_id, v_existing_product_id
  from public.carts c
  join public.cart_items ci
    on ci.cart_id = c.id
   and ci.organization_id = c.organization_id
   and ci.store_id = c.store_id
  where c.organization_id = p_organization_id
    and c.store_id = p_store_id
    and c.token_hash = p_token_hash
    and c.status = 'active'
    and c.expires_at > now()
    and ci.id = p_existing_item_id
  for update of c, ci;

  if v_cart_id is null then raise exception 'cart item unavailable'; end if;
  if v_existing_product_id <> p_product_id then raise exception 'cart product mismatch'; end if;

  if p_sale_mode is null or trim(p_sale_mode) = '' then
    v_result := public.cart_add_item_internal(
      p_organization_id,
      p_store_id,
      p_token_hash,
      p_expires_at,
      p_product_id,
      p_product_name,
      p_product_image_url,
      p_unit_base_price_cents,
      p_quantity,
      p_note,
      p_modifiers
    );
  else
    v_result := public.cart_add_gas_item_internal(
      p_organization_id,
      p_store_id,
      p_token_hash,
      p_expires_at,
      p_product_id,
      p_product_name,
      p_product_image_url,
      p_unit_base_price_cents,
      p_quantity,
      p_note,
      p_modifiers,
      p_sale_mode
    );
  end if;

  v_new_item_id := nullif(v_result->>'item_id', '')::uuid;
  v_new_cart_id := nullif(v_result->>'cart_id', '')::uuid;
  if v_new_item_id is null or v_new_cart_id is distinct from v_cart_id then
    raise exception 'cart replacement failed';
  end if;

  delete from public.cart_item_gas_options
  where organization_id = p_organization_id and store_id = p_store_id and cart_item_id = p_existing_item_id;

  delete from public.cart_item_modifiers
  where organization_id = p_organization_id and store_id = p_store_id and cart_item_id = p_existing_item_id;

  delete from public.cart_items
  where organization_id = p_organization_id and store_id = p_store_id and cart_id = v_cart_id and id = p_existing_item_id;

  if not found then raise exception 'cart item replacement lost source row'; end if;

  select coalesce(sum(line_total_cents), 0)
    into v_subtotal
  from public.cart_items
  where cart_id = v_cart_id and validation_status = 'valid';

  update public.carts
  set subtotal_cents = v_subtotal,
      total_cents = greatest(0, v_subtotal - discount_cents + delivery_fee_cents),
      last_validated_at = now(),
      updated_at = now()
  where id = v_cart_id
    and organization_id = p_organization_id
    and store_id = p_store_id;

  return jsonb_build_object(
    'cart_id', v_cart_id,
    'item_id', v_new_item_id,
    'replaced_item_id', p_existing_item_id,
    'subtotal_cents', v_subtotal
  );
end;
$$;

revoke all on function public.cart_replace_item_internal(uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) from public;
revoke all on function public.cart_replace_item_internal(uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) from anon;
revoke all on function public.cart_replace_item_internal(uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) from authenticated;
grant execute on function public.cart_replace_item_internal(uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) to service_role;
