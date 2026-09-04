-- PedeAqui [174] — Caixa: abertura → suprimento/sangria → PDV cash → estorno → conferência.
-- A transação inteira é revertida e não deixa fixtures.
begin;

insert into auth.users (id,email) values ('c5555555-5555-4555-8555-555555555555','cash-e2e@example.invalid');
insert into public.organizations (id,name,created_by) values ('c0000000-0000-4000-8000-000000000001','Cash E2E Org','c5555555-5555-4555-8555-555555555555');
insert into public.stores (id,organization_id,name,slug,status) values ('c0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000001','Cash E2E Store','cash-e2e','active');
insert into public.store_modules (organization_id,store_id,module_key,enabled,configuration_source)
values ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000011','cash',true,'manual');
insert into public.products (id,organization_id,store_id,name,price_cents,active,availability) values ('c0000000-0000-4000-8000-000000000021','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000011','Produto Caixa',1590,true,'available');
insert into public.store_payment_methods (organization_id,store_id,method,enabled) values ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000011','cash',true);

do $$
declare
  v_register public.cash_registers%rowtype;
  v_session public.cash_sessions%rowtype;
  v_retry_session public.cash_sessions%rowtype;
  v_sale jsonb;
  v_order uuid;
  v_payment uuid;
  v_summary jsonb;
  v_closed public.cash_sessions%rowtype;
  v_close_retry public.cash_sessions%rowtype;
  v_blocked boolean := false;
begin
  v_register := public.cash_create_register_internal('c0000000-0000-4000-8000-000000000011','principal','Caixa Principal','c5555555-5555-4555-8555-555555555555');
  v_session := public.cash_open_session_internal(v_register.id,10000,'cash-e2e-open-0001','Abertura E2E','c5555555-5555-4555-8555-555555555555');
  v_retry_session := public.cash_open_session_internal(v_register.id,10000,'cash-e2e-open-0001','Abertura E2E','c5555555-5555-4555-8555-555555555555');
  if v_retry_session.id<>v_session.id then raise exception 'open retry changed session'; end if;

  perform public.cash_manual_movement_internal(v_session.id,'supply',2000,'Troco extra','cash-e2e-supply-0001','c5555555-5555-4555-8555-555555555555');
  perform public.cash_manual_movement_internal(v_session.id,'withdrawal',1000,'Retirada parcial','cash-e2e-withdraw-0001','c5555555-5555-4555-8555-555555555555');
  perform public.cash_manual_movement_internal(v_session.id,'withdrawal',1000,'Retirada parcial','cash-e2e-withdraw-0001','c5555555-5555-4555-8555-555555555555');
  if (select count(*) from public.cash_movements where cash_session_id=v_session.id and movement_type='withdrawal')<>1 then raise exception 'withdraw retry duplicated movement'; end if;

  v_sale := public.pdv_create_order_growth_internal(
    'c0000000-0000-4000-8000-000000000011',
    '[{"product_id":"c0000000-0000-4000-8000-000000000021","quantity":1,"modifier_ids":[]}]'::jsonb,
    '[{"method":"cash","amount_cents":1590,"cash_received_cents":2000}]'::jsonb,
    null,
    '{"coupon_code":null,"cashback_redeem_cents":0,"loyalty_redeem_points":0}'::jsonb,
    'cash-e2e-sale-0001','c5555555-5555-4555-8555-555555555555'
  );
  v_order := (v_sale->>'order_id')::uuid;
  select id into v_payment from public.payments where order_id=v_order and method='cash' and status='paid';
  if v_payment is null then raise exception 'paid cash payment missing'; end if;
  if (select count(*) from public.cash_movements where payment_id=v_payment and movement_type='sale')<>1 then raise exception 'cash sale movement missing or duplicated'; end if;

  perform public.payment_refund_internal(v_payment,'Cliente desistiu','c5555555-5555-4555-8555-555555555555','panel');
  perform public.payment_refund_internal(v_payment,'Cliente desistiu','c5555555-5555-4555-8555-555555555555','panel');
  if (select count(*) from public.cash_movements where payment_id=v_payment and movement_type='refund')<>1 then raise exception 'refund movement missing or duplicated'; end if;

  v_summary := public.cash_session_summary_internal(v_session.id);
  if (v_summary->>'expected_cash_cents')::bigint<>11000 then raise exception 'unexpected cash balance'; end if;

  v_closed := public.cash_close_session_internal(v_session.id,10900,'cash-e2e-close-0001','Conferência E2E','c5555555-5555-4555-8555-555555555555');
  if v_closed.expected_cash_cents_snapshot<>11000 or v_closed.counted_cash_cents<>10900 or v_closed.difference_cents<>-100 then raise exception 'cash reconciliation invalid'; end if;
  v_close_retry := public.cash_close_session_internal(v_session.id,10900,'cash-e2e-close-0001','Conferência E2E','c5555555-5555-4555-8555-555555555555');
  if v_close_retry.id<>v_session.id then raise exception 'close retry failed'; end if;

  begin
    perform public.pdv_create_order_growth_internal(
      'c0000000-0000-4000-8000-000000000011',
      '[{"product_id":"c0000000-0000-4000-8000-000000000021","quantity":1,"modifier_ids":[]}]'::jsonb,
      '[{"method":"cash","amount_cents":1590,"cash_received_cents":1590}]'::jsonb,
      null,
      '{"coupon_code":null,"cashback_redeem_cents":0,"loyalty_redeem_points":0}'::jsonb,
      'cash-e2e-sale-blocked-0002','c5555555-5555-4555-8555-555555555555'
    );
  exception when others then
    if position('open cash session required for cash payment' in sqlerrm)>0 then v_blocked:=true; else raise; end if;
  end;
  if not v_blocked then raise exception 'cash sale succeeded without open session'; end if;
  if (select count(*) from public.cash_movements where cash_session_id=v_session.id)<>5 then raise exception 'unexpected movement count'; end if;
end $$;

rollback;
