-- PedeAqui FLOW-10 / D05 — fixture committed for two real PostgreSQL sessions.
-- This script is only called by the disposable Isolated Chaos runner.
\set ON_ERROR_STOP on

select set_config('flow10.fixture_slug', :'fixture_slug', false);

do $$
declare
  v_slug text := current_setting('flow10.fixture_slug');
  v_user_id uuid := gen_random_uuid();
  v_organization_id uuid := gen_random_uuid();
  v_store_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_cart_id uuid;
  v_token text;
  v_access_token text;
  v_result jsonb;
  v_index integer;
  v_count integer;
begin
  insert into auth.users (id,email)
  values (v_user_id,v_slug || '@example.invalid');

  insert into public.organizations (id,name,created_by)
  values (v_organization_id,'FLOW-10 Concurrent Claim',v_user_id);

  insert into public.stores (id,organization_id,name,slug,status)
  values (v_store_id,v_organization_id,'FLOW-10 Concurrent Store',v_slug,'active');

  insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
  values (v_product_id,v_organization_id,v_store_id,'Produto Concorrência',1000,true,'available');

  for v_index in 1..20 loop
    v_cart_id := gen_random_uuid();
    v_token := md5(v_slug || ':cart:' || v_index::text) || md5(v_slug || ':cart-b:' || v_index::text);
    v_access_token := md5(v_slug || ':access:' || v_index::text) || md5(v_slug || ':access-b:' || v_index::text);

    insert into public.carts (
      id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,
      delivery_fee_cents,total_cents,expires_at,created_at,updated_at
    ) values (
      v_cart_id,v_organization_id,v_store_id,v_token,'active',1000,0,0,1000,
      clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp()
    );

    insert into public.cart_items (
      id,organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,
      unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents,
      validation_status
    ) values (
      gen_random_uuid(),v_organization_id,v_store_id,v_cart_id,v_product_id,'Produto Concorrência',1,
      1000,0,1000,1000,'valid'
    );

    insert into public.checkout_sessions (
      id,organization_id,store_id,cart_id,customer_name,customer_phone,customer_phone_normalized,
      fulfillment_type,delivery_quote_status,delivery_fee_cents,payment_method,reviewed_at,created_at,updated_at
    ) values (
      gen_random_uuid(),v_organization_id,v_store_id,v_cart_id,'Cliente Técnico ' || v_index::text,
      '(19) 99999-1111','19999991111','pickup','not_required',0,'cash',
      clock_timestamp(),clock_timestamp(),clock_timestamp()
    );

    v_result := public.create_order_from_checkout_internal(v_store_id,v_token,v_access_token);
    if coalesce((v_result->>'created')::boolean,false) is not true then
      raise exception 'concurrent fixture checkout % was not created',v_index;
    end if;
  end loop;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id=v_organization_id
     and notification_type='order_received'
     and status='pending';
  if v_count <> 20 then
    raise exception 'concurrent fixture expected 20 pending jobs, got %',v_count;
  end if;
end $$;

select 'FLOW10_CONCURRENT_FIXTURE_READY=' || :'fixture_slug';
