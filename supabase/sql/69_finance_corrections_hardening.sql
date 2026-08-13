-- PedeAqui — Milestone 21 hardening
-- Reembolsos reduzem competência; correção de compra já paga vira crédito contra fornecedor.

insert into public.financial_categories(organization_id,name,nature,dre_group,system_key)
select id,'Reembolsos de vendas','revenue','deductions','sales_refunds' from public.organizations
on conflict (organization_id,system_key) where system_key is not null and deleted_at is null do nothing;

create or replace function private.seed_financial_categories(p_organization_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.financial_categories(organization_id,name,nature,dre_group,system_key) values
    (p_organization_id,'Vendas','revenue','gross_revenue','sales_revenue'),
    (p_organization_id,'Descontos de vendas','revenue','deductions','sales_discounts'),
    (p_organization_id,'Reembolsos de vendas','revenue','deductions','sales_refunds'),
    (p_organization_id,'Taxa de entrega','revenue','delivery_revenue','delivery_revenue'),
    (p_organization_id,'Custo dos produtos vendidos','expense','cogs','cogs'),
    (p_organization_id,'Outras receitas','revenue','other_revenue','other_revenue'),
    (p_organization_id,'Despesas operacionais','expense','operating_expense','operating_expense'),
    (p_organization_id,'Outras despesas','expense','other_expense','other_expense')
  on conflict (organization_id,system_key) where system_key is not null and deleted_at is null do nothing;
end; $$;
revoke all on function private.seed_financial_categories(uuid) from public,anon,authenticated;
grant execute on function private.seed_financial_categories(uuid) to service_role;

create or replace function private.finance_sync_payment(p_payment_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_payment public.payments%rowtype; v_order public.orders%rowtype; v_ob public.financial_obligations%rowtype;
  v_account_id uuid; v_paid_tx public.financial_transactions%rowtype; v_metadata jsonb; v_refund_category uuid; v_competence date;
begin
  select * into v_payment from public.payments where id=p_payment_id;
  if v_payment.id is null then return; end if;
  select * into v_order from public.orders where id=v_payment.order_id;
  if v_order.id is null or v_order.order_status<>'completed' then return; end if;
  select * into v_ob from public.financial_obligations
  where organization_id=v_order.organization_id and source_type='order' and source_id=v_order.id and direction='in' and status<>'cancelled'
  limit 1;
  if v_ob.id is null then return; end if;
  v_account_id:=private.finance_payment_account_id(v_order.organization_id,v_order.store_id,v_payment.method);
  if v_account_id is null then raise exception 'financial payment account unavailable'; end if;
  v_metadata:=jsonb_build_object('payment_id',v_payment.id,'method',v_payment.method,'reference',v_payment.reference);

  if v_payment.status='paid' then
    perform private.finance_insert_transaction(
      v_order.organization_id,v_order.store_id,v_ob.id,v_account_id,null,'settlement','in',1,v_payment.amount_cents,null,
      'payment',v_payment.id,null,'finance-payment-paid:'||v_payment.id::text,'Liquidação por pagamento',v_metadata,
      v_payment.confirmed_by,coalesce(v_payment.paid_at,v_payment.updated_at)
    );
  elsif v_payment.status='refunded' then
    select * into v_paid_tx from public.financial_transactions
    where organization_id=v_order.organization_id and idempotency_key='finance-payment-paid:'||v_payment.id::text
      and transaction_type='settlement' limit 1;
    if v_paid_tx.id is null then return; end if;
    perform private.finance_insert_transaction(
      v_order.organization_id,v_order.store_id,v_ob.id,v_paid_tx.account_id,null,'settlement_reversal','in',-1,v_paid_tx.amount_cents,null,
      'payment_refund',v_payment.id,null,'finance-payment-refund:'||v_payment.id::text,'Estorno de pagamento',
      jsonb_build_object('payment_id',v_payment.id,'method',v_payment.method,'reference',v_payment.reference,'reverses_transaction_id',v_paid_tx.id),
      v_payment.confirmed_by,coalesce(v_payment.refunded_at,v_payment.updated_at)
    );
    v_refund_category:=private.finance_category_id(v_order.organization_id,'sales_refunds');
    if v_refund_category is null then raise exception 'financial refund category unavailable'; end if;
    v_competence:=private.finance_store_local_date(v_order.store_id,coalesce(v_payment.refunded_at,v_payment.updated_at));
    perform private.finance_insert_transaction(
      v_order.organization_id,v_order.store_id,v_ob.id,null,v_refund_category,'obligation_adjustment','in',-1,v_paid_tx.amount_cents,v_competence,
      'payment_refund',v_payment.id,null,'finance-payment-refund-recognition:'||v_payment.id::text,'Reembolso ao cliente',
      jsonb_build_object('payment_id',v_payment.id,'method',v_payment.method,'reverses_settlement_id',v_paid_tx.id),
      v_payment.confirmed_by,coalesce(v_payment.refunded_at,v_payment.updated_at)
    );
  end if;
end; $$;
revoke all on function private.finance_sync_payment(uuid) from public,anon,authenticated;
grant execute on function private.finance_sync_payment(uuid) to service_role;

create or replace function private.finance_sync_purchase_receipt_item(p_receipt_item_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_item public.purchase_receipt_items%rowtype; v_receipt public.purchase_receipts%rowtype; v_source_receipt public.purchase_receipts%rowtype;
  v_po public.purchase_orders%rowtype; v_ob public.financial_obligations%rowtype; v_credit_ob public.financial_obligations%rowtype;
  v_competence date; v_due date; v_reduce bigint; v_credit bigint;
begin
  select * into v_item from public.purchase_receipt_items where id=p_receipt_item_id;
  if v_item.id is null or v_item.line_total_cents<=0 then return; end if;
  select * into v_receipt from public.purchase_receipts where id=v_item.receipt_id;
  if v_receipt.id is null then return; end if;
  if v_receipt.receipt_kind='correction' then
    select * into v_source_receipt from public.purchase_receipts where id=v_receipt.corrects_receipt_id;
  else
    v_source_receipt:=v_receipt;
  end if;
  if v_source_receipt.id is null then raise exception 'financial source purchase receipt unavailable'; end if;
  select * into v_po from public.purchase_orders where id=v_receipt.purchase_order_id;
  if v_po.id is null then return; end if;
  v_competence:=private.finance_store_local_date(v_po.store_id,v_source_receipt.created_at);
  v_due:=v_competence+v_po.payment_term_days_snapshot;
  v_ob:=private.finance_ensure_obligation(
    v_po.organization_id,v_po.store_id,'out','purchase_receipt',v_source_receipt.id,'supplier',v_po.supplier_id,
    'Compra #'||v_po.display_number::text||' · recebimento',v_competence,v_due,v_receipt.created_by
  );

  if v_item.purchase_quantity_delta>0 then
    perform private.finance_insert_transaction(
      v_po.organization_id,v_po.store_id,v_ob.id,null,null,'recognition','out',1,v_item.line_total_cents,v_competence,
      'purchase_receipt_item',v_item.id,null,'finance-purchase-item:'||v_item.id::text,'Entrada de compra #'||v_po.display_number::text,
      jsonb_build_object('purchase_order_id',v_po.id,'receipt_id',v_receipt.id,'source_receipt_id',v_source_receipt.id,'purchase_quantity_delta',v_item.purchase_quantity_delta),
      v_receipt.created_by,v_receipt.created_at
    );
    return;
  end if;

  -- Correção negativa: reduz somente a parcela ainda não paga. O excedente já pago vira crédito contra o fornecedor.
  select * into v_ob from public.financial_obligations where id=v_ob.id for update;
  v_reduce:=least(v_item.line_total_cents,v_ob.open_cents);
  v_credit:=v_item.line_total_cents-v_reduce;
  if v_reduce>0 then
    perform private.finance_insert_transaction(
      v_po.organization_id,v_po.store_id,v_ob.id,null,null,'obligation_adjustment','out',-1,v_reduce,v_competence,
      'purchase_receipt_item',v_item.id,null,'finance-purchase-adjust:'||v_item.id::text,'Correção de compra #'||v_po.display_number::text,
      jsonb_build_object('purchase_order_id',v_po.id,'receipt_id',v_receipt.id,'source_receipt_id',v_source_receipt.id,'purchase_quantity_delta',v_item.purchase_quantity_delta,'payable_reduction_cents',v_reduce),
      v_receipt.created_by,v_receipt.created_at
    );
  end if;
  if v_credit>0 then
    v_credit_ob:=private.finance_ensure_obligation(
      v_po.organization_id,v_po.store_id,'in','supplier_credit',v_item.id,'supplier',v_po.supplier_id,
      'Crédito fornecedor · compra #'||v_po.display_number::text,
      private.finance_store_local_date(v_po.store_id,v_receipt.created_at),private.finance_store_local_date(v_po.store_id,v_receipt.created_at),v_receipt.created_by
    );
    perform private.finance_insert_transaction(
      v_po.organization_id,v_po.store_id,v_credit_ob.id,null,null,'recognition','in',1,v_credit,private.finance_store_local_date(v_po.store_id,v_receipt.created_at),
      'purchase_receipt_item',v_item.id,null,'finance-supplier-credit:'||v_item.id::text,'Crédito contra fornecedor · compra #'||v_po.display_number::text,
      jsonb_build_object('purchase_order_id',v_po.id,'receipt_id',v_receipt.id,'source_receipt_id',v_source_receipt.id,'purchase_quantity_delta',v_item.purchase_quantity_delta,'credit_cents',v_credit),
      v_receipt.created_by,v_receipt.created_at
    );
  end if;
end; $$;
revoke all on function private.finance_sync_purchase_receipt_item(uuid) from public,anon,authenticated;
grant execute on function private.finance_sync_purchase_receipt_item(uuid) to service_role;

create or replace function public.financial_cancel_manual_obligation_internal(
  p_obligation_id uuid,p_reason text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_ob public.financial_obligations%rowtype; v_rec public.financial_transactions%rowtype; v_existing public.financial_transactions%rowtype; v_tx public.financial_transactions%rowtype;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'financial cancellation reason required'; end if;
  select * into v_ob from public.financial_obligations where id=p_obligation_id for update;
  if v_ob.id is null or v_ob.source_type<>'manual' then raise exception 'only manual financial obligations can be cancelled here'; end if;
  select * into v_existing from public.financial_transactions where organization_id=v_ob.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_ob.status='cancelled' then
    if v_existing.id is null then raise exception 'financial obligation already cancelled'; end if;
    if v_existing.obligation_id<>v_ob.id or v_existing.transaction_type<>'obligation_adjustment' or v_existing.effect_sign<>-1
       or v_existing.description is distinct from trim(p_reason) then raise exception 'financial idempotency key reused with different payload'; end if;
    return jsonb_build_object('obligation_id',v_ob.id,'transaction_id',v_existing.id,'status','cancelled','retry',true);
  end if;
  if v_ob.settled_cents<>0 then raise exception 'reverse settlements before cancelling manual obligation'; end if;
  if v_ob.principal_cents<=0 then raise exception 'financial obligation has no principal to cancel'; end if;
  select * into v_rec from public.financial_transactions where obligation_id=v_ob.id and transaction_type='recognition' and effect_sign=1 order by created_at limit 1;
  if v_rec.id is null then raise exception 'financial recognition unavailable'; end if;
  v_tx:=private.finance_insert_transaction(
    v_ob.organization_id,v_ob.store_id,v_ob.id,null,v_rec.category_id,'obligation_adjustment',v_ob.direction,-1,v_ob.principal_cents,v_ob.competence_date,
    'financial_obligation',v_ob.id,null,p_idempotency_key,trim(p_reason),jsonb_build_object('cancels_obligation_id',v_ob.id),p_actor_user_id,now()
  );
  update public.financial_obligations set status='cancelled',cancelled_at=now(),cancelled_reason=trim(p_reason),updated_at=now() where id=v_ob.id returning * into v_ob;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_ob.organization_id,v_ob.store_id,p_actor_user_id,'finance.manual_obligation_cancelled','financial_obligation',v_ob.id,jsonb_build_object('transaction_id',v_tx.id,'reason',trim(p_reason)));
  return jsonb_build_object('obligation_id',v_ob.id,'transaction_id',v_tx.id,'status','cancelled','retry',false);
end; $$;
revoke all on function public.financial_cancel_manual_obligation_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.financial_cancel_manual_obligation_internal(uuid,text,text,uuid) to service_role;

-- Completa o backfill de reembolsos já existentes com a nova dedução de competência.
select private.finance_sync_payment(id) from public.payments where status='refunded';
