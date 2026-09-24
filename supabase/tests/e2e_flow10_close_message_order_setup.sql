-- PedeAqui FLOW-10 / D02 — two distinct WhatsApp confirmations over one checkout.
-- The fixture is committed so two independent PostgreSQL sessions can race.
\set ON_ERROR_STOP on

select set_config('flow10.fixture_slug', :'fixture_slug', false);

do $$
declare
  v_slug text := current_setting('flow10.fixture_slug');
  v_user_id uuid := gen_random_uuid();
  v_organization_id uuid := gen_random_uuid();
  v_store_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_cart_id uuid := gen_random_uuid();
  v_token text := md5(v_slug || ':cart') || md5(v_slug || ':cart-b');
  v_first_message jsonb;
  v_second_message jsonb;
begin
  insert into auth.users (id,email)
  values (v_user_id,v_slug || '@example.invalid');

  insert into public.organizations (id,name,created_by)
  values (v_organization_id,'FLOW-10 Close Message Order',v_user_id);

  insert into public.stores (id,organization_id,name,slug,status)
  values (v_store_id,v_organization_id,'FLOW-10 WhatsApp Store',v_slug,'active');

  insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
  values (v_product_id,v_organization_id,v_store_id,'Produto WhatsApp',1500,true,'available');

  insert into public.carts (
    id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,
    delivery_fee_cents,total_cents,expires_at,created_at,updated_at
  ) values (
    v_cart_id,v_organization_id,v_store_id,v_token,'active',1500,0,0,1500,
    clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp()
  );

  insert into public.cart_items (
    id,organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,
    unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents,
    validation_status
  ) values (
    gen_random_uuid(),v_organization_id,v_store_id,v_cart_id,v_product_id,'Produto WhatsApp',1,
    1500,0,1500,1500,'valid'
  );

  insert into public.checkout_sessions (
    id,organization_id,store_id,cart_id,customer_name,customer_phone,customer_phone_normalized,
    fulfillment_type,delivery_quote_status,delivery_fee_cents,payment_method,reviewed_at,created_at,updated_at
  ) values (
    gen_random_uuid(),v_organization_id,v_store_id,v_cart_id,'Cliente WhatsApp',
    '(19) 99999-1111','19999991111','pickup','not_required',0,'cash',
    clock_timestamp(),clock_timestamp(),clock_timestamp()
  );

  v_first_message := public.conversation_receive_message_internal(
    v_store_id,'meta_cloud','5519999991111','5519999991111','Cliente WhatsApp',
    v_slug || ':confirmation-a','SIM','text',clock_timestamp(),'{}'::jsonb
  );
  v_second_message := public.conversation_receive_message_internal(
    v_store_id,'meta_cloud','5519999991111','5519999991111','Cliente WhatsApp',
    v_slug || ':confirmation-b','SIM','text',clock_timestamp(),'{}'::jsonb
  );

  if coalesce((v_first_message->>'message_created')::boolean,false) is not true
     or coalesce((v_second_message->>'message_created')::boolean,false) is not true then
    raise exception 'expected two distinct inbound WhatsApp confirmations';
  end if;
end $$;

select 'FLOW10_CLOSE_MESSAGE_FIXTURE_READY=' || :'fixture_slug';
