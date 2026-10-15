begin;
create function pg_temp.auto_order(p_method text default 'cash',p_channel text default 'digital_menu',p_created timestamptz default now(),p_scheduled timestamptz default null,p_fulfillment text default 'pickup')
returns uuid language plpgsql as $f$
declare v_id uuid; v_cart uuid:=gen_random_uuid(); v_checkout uuid:=gen_random_uuid(); v_cols text;
begin
if p_channel='digital_menu' then
select string_agg(quote_ident(column_name),', ' order by ordinal_position) into v_cols from information_schema.columns where table_schema='public' and table_name='carts' and is_generated='NEVER';
execute format('insert into public.carts(%s) select %s from jsonb_populate_record(null::public.carts,(select to_jsonb(c) from public.carts c join public.orders o on o.source_cart_id=c.id where o.id=''5a931da1-72c2-4628-9ccf-93b4f7e81027'') || $1)',v_cols,v_cols) using jsonb_build_object('id',v_cart,'token_hash',encode(sha256(v_cart::text::bytea),'hex'));
select string_agg(quote_ident(column_name),', ' order by ordinal_position) into v_cols from information_schema.columns where table_schema='public' and table_name='checkout_sessions' and is_generated='NEVER';
execute format('insert into public.checkout_sessions(%s) select %s from jsonb_populate_record(null::public.checkout_sessions,(select to_jsonb(c) from public.checkout_sessions c join public.orders o on o.checkout_session_id=c.id where o.id=''5a931da1-72c2-4628-9ccf-93b4f7e81027'') || $1)',v_cols,v_cols) using jsonb_build_object('id',v_checkout,'cart_id',v_cart,'scheduled_for',p_scheduled);
else v_cart:=null; v_checkout:=null; end if;

insert into public.orders(source_cart_id,checkout_session_id,public_access_token_hash,organization_id,store_id,display_number,channel,fulfillment_type,customer_name_snapshot,customer_phone_snapshot,subtotal_cents,total_cents,payment_method_snapshot,created_at,scheduled_for,address_street_snapshot,address_number_snapshot,address_district_snapshot,address_city_snapshot,address_state_snapshot)
values(v_cart,v_checkout,repeat('a',64),'b2f1d1e9-f931-42b4-bf0d-b31fe503468d','5d4fb9e0-0d27-457a-ad0a-d86ed8816810',900000+(select count(*) from public.orders where store_id='5d4fb9e0-0d27-457a-ad0a-d86ed8816810'),p_channel,p_fulfillment,'TESTE ROLLBACK AUTO','11900000000',1990,1990,p_method,p_created,p_scheduled,'Rua Teste','1','Teste','Teste','SP') returning id into v_id;
return v_id;
end $f$;
update public.store_operational_settings set orders_auto_accept=true,
orders_custom_workflow=orders_custom_workflow || jsonb_build_object('receptionMode','auto_prepare','autoPrepareFrom',now()-interval '1 second')
where store_id='5d4fb9e0-0d27-457a-ad0a-d86ed8816810';
do $test$
declare v_id uuid; v_old uuid; v_pix uuid; v_state public.orders%rowtype; v_count int; v_payment uuid;
begin
  v_id:=pg_temp.auto_order();
  set constraints orders_apply_store_automations immediate;
  select * into v_state from public.orders where id=v_id;
  if v_state.order_status<>'confirmed' or v_state.production_status<>'preparing' then raise exception 'cash auto prepare failed'; end if;
  update public.orders set payment_status=payment_status where id=v_id;
  select count(*) into v_count from public.order_state_history where order_id=v_id and state_domain='production' and to_state='preparing';
  if v_count<>1 then raise exception 'duplicate preparation'; end if;
  v_id:=pg_temp.auto_order('credit_card','digital_menu',now(),null,'delivery');
  if not exists(select 1 from public.orders where id=v_id and production_status='preparing') then raise exception 'delivery failed'; end if;
  v_old:=pg_temp.auto_order('cash','digital_menu',now()-interval '2 days');
  if not exists(select 1 from public.orders where id=v_old and order_status='pending_confirmation') then raise exception 'old order advanced'; end if;
  v_id:=pg_temp.auto_order('cash','digital_menu',now(),now()+interval '2 days');
  if not exists(select 1 from public.orders where id=v_id and order_status='pending_confirmation') then raise exception 'scheduled order advanced'; end if;
  v_id:=pg_temp.auto_order('cash','ifood');
  if not exists(select 1 from public.orders where id=v_id and order_status='pending_confirmation') then raise exception 'external order advanced'; end if;
  v_pix:=pg_temp.auto_order('pix');
  if not exists(select 1 from public.orders where id=v_pix and order_status='pending_confirmation' and production_status='pending_confirmation') then raise exception 'unpaid pix advanced'; end if;
  select id into v_payment from public.payments where order_id=v_pix limit 1;
  perform public.payment_confirm_internal(v_payment,null,'ROLLBACK TEST',null,'integration');
  if not exists(select 1 from public.orders where id=v_pix and payment_status='paid' and production_status='preparing') then raise exception 'paid pix did not start'; end if;
  update public.store_operational_settings set orders_auto_accept=false where store_id='5d4fb9e0-0d27-457a-ad0a-d86ed8816810';
  v_id:=pg_temp.auto_order();
  if not exists(select 1 from public.orders where id=v_id and order_status='pending_confirmation') then raise exception 'manual advanced'; end if;
  update public.store_operational_settings set orders_auto_accept=true,orders_custom_workflow=orders_custom_workflow || '{"receptionMode":"auto_accept"}'::jsonb where store_id='5d4fb9e0-0d27-457a-ad0a-d86ed8816810';
  v_id:=pg_temp.auto_order();
  if not exists(select 1 from public.orders where id=v_id and order_status='confirmed' and production_status='pending_confirmation') then raise exception 'accept-only started prep'; end if;
end $test$;
select 'PASS: cash, delivery, idempotency, old, scheduled, external, pending Pix, paid Pix, manual, accept-only' as result;
rollback;
