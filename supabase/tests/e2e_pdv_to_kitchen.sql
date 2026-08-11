-- PedeAqui quality [121][123] — PDV → impressão → cozinha + fallback.
-- Fixture administrativa de TESTE; a transação inteira é revertida.
begin;

insert into auth.users (id,email) values ('e5555555-5555-4555-8555-555555555555','quality-pdv@example.invalid');
insert into public.organizations (id,name,created_by) values ('e0000000-0000-4000-8000-000000000001','Quality PDV Org','e5555555-5555-4555-8555-555555555555');
insert into public.stores (id,organization_id,name,slug,status) values ('e0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000001','PDV Test Store','quality-pdv','active');
insert into public.products (id,organization_id,store_id,name,price_cents,active,availability) values ('e0000000-0000-4000-8000-000000000021','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','X-Teste',1590,true,'available');
insert into public.store_payment_methods (organization_id,store_id,method,enabled) values ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','cash',true);
insert into public.production_stations (id,organization_id,store_id,name,code,kind,active,auto_print) values ('e0000000-0000-4000-8000-000000000031','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','Cozinha Teste','cozinha-teste','production',true,true);
insert into public.print_agents (id,organization_id,store_id,name,token_hash,active,status) values
  ('e0000000-0000-4000-8000-000000000041','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','Agent Primary',repeat('e',64),true,'online'),
  ('e0000000-0000-4000-8000-000000000042','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','Agent Wrong',repeat('f',64),true,'online');
insert into public.printers (id,organization_id,store_id,agent_id,name,connection_type,connection_address,connection_port,paper_width_mm,active,status) values
  ('e0000000-0000-4000-8000-000000000051','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000041','Primary','network','127.0.0.1',9100,80,true,'online'),
  ('e0000000-0000-4000-8000-000000000052','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000041','Fallback','network','127.0.0.1',9101,80,true,'online');
update public.printers set fallback_printer_id='e0000000-0000-4000-8000-000000000052' where id='e0000000-0000-4000-8000-000000000051';
insert into public.station_printers (organization_id,store_id,station_id,printer_id,priority,active) values ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000031','e0000000-0000-4000-8000-000000000051',1,true);
insert into public.product_production_stations (organization_id,store_id,product_id,station_id) values ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000021','e0000000-0000-4000-8000-000000000031');

do $$
declare
  v_sale jsonb; v_order uuid; v_job uuid; v_wrong_rejected boolean := false;
  v_printer uuid; v_status text; v_attempts integer;
begin
  v_sale := public.pdv_create_order_internal(
    'e0000000-0000-4000-8000-000000000011',
    '[{"product_id":"e0000000-0000-4000-8000-000000000021","quantity":1,"modifier_ids":[]}]'::jsonb,
    '[{"method":"cash","amount_cents":1590,"cash_received_cents":2000}]'::jsonb,
    '{"name":"Cliente PDV","phone":"19999999999"}'::jsonb,
    'quality-pdv-sale-0001','e5555555-5555-4555-8555-555555555555'
  );
  v_order := (v_sale->>'order_id')::uuid;
  if not exists (select 1 from public.orders where id=v_order and order_status='confirmed' and payment_status='paid' and production_status='preparing' and total_cents=1590) then raise exception 'invalid PDV states'; end if;
  if (select count(*) from public.payments where order_id=v_order and status='paid') <> 1 then raise exception 'invalid payment ledger'; end if;
  select id into v_job from public.print_jobs where order_id=v_order and status='pending';
  if v_job is null then raise exception 'print job missing'; end if;

  update public.print_jobs set max_attempts=1 where id=v_job;
  perform * from public.print_agent_claim_internal('e0000000-0000-4000-8000-000000000041',5);
  begin
    perform public.print_agent_fail_internal('e0000000-0000-4000-8000-000000000042',v_job,'wrong agent');
  exception when others then v_wrong_rejected := true;
  end;
  if not v_wrong_rejected then raise exception 'wrong agent was allowed to fail job'; end if;

  perform public.print_agent_fail_internal('e0000000-0000-4000-8000-000000000041',v_job,'primary offline');
  select printer_id,status,attempts into v_printer,v_status,v_attempts from public.print_jobs where id=v_job;
  if v_printer <> 'e0000000-0000-4000-8000-000000000052' or v_status <> 'pending' or v_attempts <> 0 then raise exception 'fallback invalid'; end if;
  if not exists (select 1 from public.domain_events where entity_type='print_job' and entity_id=v_job and event_type='print.fallback_activated' and payload->>'order_id'=v_order::text) then raise exception 'fallback event missing'; end if;

  perform * from public.print_agent_claim_internal('e0000000-0000-4000-8000-000000000041',5);
  perform public.print_agent_ack_internal('e0000000-0000-4000-8000-000000000041',v_job);
  if (select status from public.print_jobs where id=v_job) <> 'printed' then raise exception 'fallback print not acknowledged'; end if;

  perform public.order_transition_internal(v_order,'production','ready',null,'e5555555-5555-4555-8555-555555555555','pdv');
  perform public.order_transition_internal(v_order,'fulfillment','served',null,'e5555555-5555-4555-8555-555555555555','pdv');
  perform public.order_transition_internal(v_order,'order','completed',null,'e5555555-5555-4555-8555-555555555555','pdv');
  if not exists (select 1 from public.orders where id=v_order and order_status='completed' and fulfillment_status='served' and production_status='ready') then raise exception 'PDV completion invalid'; end if;
end $$;

rollback;
