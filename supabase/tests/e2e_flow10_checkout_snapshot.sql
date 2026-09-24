-- FLOW-10 A03 — checkout identity/address/payment survive canonical order creation.
-- Technical fixture only; the entire scenario is rolled back.
begin;

insert into auth.users (id,email)
values ('79000000-0000-4000-8000-000000000001','flow10-a03@example.invalid');

insert into public.organizations (id,name,created_by)
values ('79000000-0000-4000-8000-000000000002','FLOW-10 A03 Org','79000000-0000-4000-8000-000000000001');

insert into public.stores (id,organization_id,name,slug,status)
values ('79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000002','FLOW-10 A03 Store','flow10-a03-store','active');

insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
values ('79000000-0000-4000-8000-000000000004','79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000003','Produto A03',3000,true,'available');

insert into public.carts (
  id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,
  delivery_fee_cents,total_cents,expires_at,created_at,updated_at
) values (
  '79000000-0000-4000-8000-000000000005','79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000003',repeat('a',64),'active',3000,0,600,3600,
  now()+interval '1 day','2026-09-21 15:00:00+00','2026-09-21 15:00:00+00'
);

insert into public.cart_items (
  id,organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,
  unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents,validation_status
) values (
  '79000000-0000-4000-8000-000000000006','79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000005',
  '79000000-0000-4000-8000-000000000004','Produto A03',1,3000,0,3000,3000,'valid'
);

insert into public.checkout_sessions (
  id,organization_id,store_id,cart_id,customer_name,customer_phone,customer_phone_normalized,customer_email,
  fulfillment_type,address_postal_code,address_street,address_number,address_complement,address_district,
  address_city,address_state,address_reference,delivery_quote_status,delivery_fee_cents,
  delivery_estimated_min_minutes,delivery_estimated_max_minutes,payment_method,reviewed_at,created_at,updated_at
) values (
  '79000000-0000-4000-8000-000000000007','79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000005',
  'Cliente Técnico A03','(11) 99999-0099','5511999990099','flow10-a03@example.invalid','delivery',
  '13380-000','Rua Técnica','321','Bloco A','Centro Técnico','Nova Odessa','SP','Portaria técnica',
  'valid',600,30,45,'debit_card','2026-09-21 15:00:02+00','2026-09-21 15:00:00+00','2026-09-21 15:00:02+00'
);

do $$
declare
  v_result jsonb;
  v_order public.orders%rowtype;
  v_event_id uuid;
  v_job_id uuid;
begin
  v_result := public.create_order_from_checkout_internal(
    '79000000-0000-4000-8000-000000000003',repeat('a',64),repeat('b',64),'digital_menu'
  );

  select * into v_order from public.orders where id=(v_result->>'order_id')::uuid;
  if v_order.customer_name_snapshot <> 'Cliente Técnico A03' then raise exception 'A03 customer name snapshot mismatch'; end if;
  if v_order.customer_phone_snapshot <> '(11) 99999-0099' then raise exception 'A03 customer phone snapshot mismatch'; end if;
  if v_order.customer_email_snapshot <> 'flow10-a03@example.invalid' then raise exception 'A03 customer email snapshot mismatch'; end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'A03 fulfillment mismatch'; end if;
  if v_order.address_postal_code_snapshot <> '13380-000'
    or v_order.address_street_snapshot <> 'Rua Técnica'
    or v_order.address_number_snapshot <> '321'
    or v_order.address_complement_snapshot <> 'Bloco A'
    or v_order.address_district_snapshot <> 'Centro Técnico'
    or v_order.address_city_snapshot <> 'Nova Odessa'
    or v_order.address_state_snapshot <> 'SP'
    or v_order.address_reference_snapshot <> 'Portaria técnica'
  then raise exception 'A03 address snapshot mismatch'; end if;
  if v_order.payment_method_snapshot <> 'debit_card' then raise exception 'A03 payment snapshot mismatch'; end if;
  if v_order.delivery_fee_cents <> 600 or v_order.total_cents <> 3600 then raise exception 'A03 total snapshot mismatch'; end if;
  if v_order.public_access_token_hash <> repeat('b',64) then raise exception 'A03 access token mismatch'; end if;
  if v_order.channel <> 'digital_menu' then raise exception 'A03 channel mismatch'; end if;

  select id into v_event_id from public.domain_events
   where entity_id=v_order.id and event_type='order.created';
  select id into v_job_id from public.order_whatsapp_notifications
   where order_id=v_order.id and notification_type='order_received';
  if v_event_id is null or v_job_id is null then raise exception 'A03 event/notification job missing'; end if;

  raise notice 'FLOW10_A03_EVIDENCE order_id=% event_id=% notification_job_id=% recipient=55********99 provider_status=N/A public_tracking_status=received verdict=PASS',
    v_order.id,v_event_id,v_job_id;
end $$;

rollback;
