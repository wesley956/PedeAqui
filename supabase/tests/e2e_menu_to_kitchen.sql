-- PedeAqui quality [119][122] — checkout duplicado + Cardápio → Cozinha.
-- Fixture administrativa de TESTE; a transação inteira é revertida.
begin;

insert into auth.users (id,email) values ('d4444444-4444-4444-8444-444444444444','quality-menu@example.invalid');
insert into public.organizations (id,name,created_by) values ('d0000000-0000-4000-8000-000000000001','Quality Menu Org','d4444444-4444-4444-8444-444444444444');
insert into public.stores (id,organization_id,name,slug,status) values ('d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000001','Menu Test Store','quality-menu','active');
insert into public.products (id,organization_id,store_id,name,price_cents,active,availability) values ('d0000000-0000-4000-8000-000000000021','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','Pizza Teste',2500,true,'available');
insert into public.production_stations (id,organization_id,store_id,name,code,kind,active,auto_print) values ('d0000000-0000-4000-8000-000000000031','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','Forno Teste','forno-teste','production',true,true);
insert into public.print_agents (id,organization_id,store_id,name,token_hash,active,status) values ('d0000000-0000-4000-8000-000000000041','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','Agent Menu',repeat('b',64),true,'online');
insert into public.printers (id,organization_id,store_id,agent_id,name,connection_type,connection_address,connection_port,paper_width_mm,active,status) values ('d0000000-0000-4000-8000-000000000051','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000041','Printer Menu','network','127.0.0.1',9100,80,true,'online');
insert into public.station_printers (organization_id,store_id,station_id,printer_id,priority,active) values ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000031','d0000000-0000-4000-8000-000000000051',1,true);
insert into public.product_production_stations (organization_id,store_id,product_id,station_id) values ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000021','d0000000-0000-4000-8000-000000000031');

insert into public.carts (id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,expires_at,created_at,updated_at)
values ('d0000000-0000-4000-8000-000000000061','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011',repeat('c',64),'active',2500,0,0,2500,now()+interval '1 day','2026-08-11 04:00:00+00','2026-08-11 04:00:00+00');
insert into public.cart_items (id,organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents,validation_status)
values ('d0000000-0000-4000-8000-000000000071','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000061','d0000000-0000-4000-8000-000000000021','Pizza Teste',1,2500,0,2500,2500,'valid');
insert into public.checkout_sessions (id,organization_id,store_id,cart_id,customer_name,customer_phone,customer_phone_normalized,fulfillment_type,delivery_quote_status,delivery_fee_cents,payment_method,reviewed_at,created_at,updated_at)
values ('d0000000-0000-4000-8000-000000000081','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000061','Cliente Menu','(19) 99999-1111','19999991111','pickup','not_required',0,'cash','2026-08-11 04:00:01+00','2026-08-11 04:00:00+00','2026-08-11 04:00:01+00');

do $$
declare v_first jsonb; v_second jsonb; v_order uuid; v_count integer; v_print integer; v_status text;
begin
  v_first := public.create_order_from_checkout_internal('d0000000-0000-4000-8000-000000000011',repeat('c',64),repeat('d',64));
  v_second := public.create_order_from_checkout_internal('d0000000-0000-4000-8000-000000000011',repeat('c',64),repeat('d',64));
  v_order := (v_first->>'order_id')::uuid;
  if (v_second->>'order_id')::uuid <> v_order then raise exception 'duplicate checkout returned different order'; end if;
  if (v_first->>'created')::boolean <> true or (v_second->>'created')::boolean <> false then raise exception 'idempotency flags invalid'; end if;
  select count(*) into v_count from public.orders where source_cart_id='d0000000-0000-4000-8000-000000000061';
  if v_count <> 1 then raise exception 'checkout created % orders',v_count; end if;
  perform public.order_transition_internal(v_order,'order','confirmed',null,'d4444444-4444-4444-8444-444444444444','panel');
  select count(*) into v_print from public.print_jobs where order_id=v_order and status='pending';
  if v_print <> 1 then raise exception 'expected one print job, got %',v_print; end if;
  perform public.order_start_production_internal(v_order,'d4444444-4444-4444-8444-444444444444','panel');
  select production_status into v_status from public.orders where id=v_order;
  if v_status <> 'preparing' then raise exception 'order did not reach kitchen'; end if;
  if (select status from public.carts where id='d0000000-0000-4000-8000-000000000061') <> 'converted' then raise exception 'cart not converted'; end if;
end $$;

rollback;
