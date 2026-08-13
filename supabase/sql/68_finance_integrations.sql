-- PedeAqui — Milestone 21 [211]–[224]
-- Integrações idempotentes: pedidos/pagamentos, CPV de estoque, compras e caixa físico.

alter table public.purchase_orders add column if not exists payment_term_days_snapshot integer not null default 0
  check (payment_term_days_snapshot between 0 and 3650);
update public.purchase_orders po
set payment_term_days_snapshot=coalesce(ss.payment_term_days,0)
from public.supplier_stores ss
where ss.organization_id=po.organization_id and ss.store_id=po.store_id and ss.supplier_id=po.supplier_id
  and po.payment_term_days_snapshot=0;

create or replace function private.purchase_snapshot_payment_term()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  select coalesce(ss.payment_term_days,0) into new.payment_term_days_snapshot
  from public.supplier_stores ss
  where ss.organization_id=new.organization_id and ss.store_id=new.store_id and ss.supplier_id=new.supplier_id;
  new.payment_term_days_snapshot:=coalesce(new.payment_term_days_snapshot,0);
  return new;
end; $$;
revoke all on function private.purchase_snapshot_payment_term() from public,anon,authenticated;
drop trigger if exists purchase_orders_snapshot_payment_term on public.purchase_orders;
create trigger purchase_orders_snapshot_payment_term before insert on public.purchase_orders
for each row execute function private.purchase_snapshot_payment_term();

create or replace function private.finance_category_id(p_organization_id uuid,p_system_key text)
returns uuid language sql stable security invoker set search_path='' as $$
  select id from public.financial_categories
  where organization_id=p_organization_id and system_key=p_system_key and active=true and deleted_at is null
  limit 1
$$;
revoke all on function private.finance_category_id(uuid,text) from public,anon,authenticated;
grant execute on function private.finance_category_id(uuid,text) to service_role;

create or replace function private.finance_store_local_date(p_store_id uuid,p_at timestamptz)
returns date language sql stable security invoker set search_path='' as $$
  select (coalesce(p_at,now()) at time zone coalesce(timezone,'America/Sao_Paulo'))::date
  from public.stores where id=p_store_id
$$;
revoke all on function private.finance_store_local_date(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.finance_store_local_date(uuid,timestamptz) to service_role;

create or replace function private.finance_payment_account_id(p_organization_id uuid,p_store_id uuid,p_method text)
returns uuid language sql stable security invoker set search_path='' as $$
  select id from public.financial_accounts
  where organization_id=p_organization_id and store_id=p_store_id and active=true and deleted_at is null
    and system_key=case
      when p_method='cash' then 'cash_on_hand'
      when p_method='pix' then 'pix_clearing'
      when p_method in ('credit_card','debit_card') then 'card_clearing'
      else null
    end
  limit 1
$$;
revoke all on function private.finance_payment_account_id(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.finance_payment_account_id(uuid,uuid,text) to service_role;

create or replace function private.finance_sync_payment(p_payment_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_payment public.payments%rowtype; v_order public.orders%rowtype; v_ob public.financial_obligations%rowtype;
  v_account_id uuid; v_paid_tx public.financial_transactions%rowtype; v_key text; v_metadata jsonb;
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
      'payment',v_payment.id,null,'finance-payment-paid:'||v_payment.id::text,'Liquidação por pagamento',v_metadata,v_payment.confirmed_by,coalesce(v_payment.paid_at,v_payment.updated_at)
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
  end if;
end; $$;
revoke all on function private.finance_sync_payment(uuid) from public,anon,authenticated;
grant execute on function private.finance_sync_payment(uuid) to service_role;

create or replace function private.finance_sync_completed_order(p_order_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype; v_ob public.financial_obligations%rowtype; v_competence date;
  v_sales uuid; v_discounts uuid; v_delivery uuid; v_payment record;
begin
  select * into v_order from public.orders where id=p_order_id;
  if v_order.id is null or v_order.order_status<>'completed' then return; end if;
  v_competence:=private.finance_store_local_date(v_order.store_id,coalesce(v_order.completed_at,v_order.updated_at));
  v_sales:=private.finance_category_id(v_order.organization_id,'sales_revenue');
  v_discounts:=private.finance_category_id(v_order.organization_id,'sales_discounts');
  v_delivery:=private.finance_category_id(v_order.organization_id,'delivery_revenue');
  if v_sales is null or v_discounts is null or v_delivery is null then raise exception 'financial sales categories unavailable'; end if;
  v_ob:=private.finance_ensure_obligation(
    v_order.organization_id,v_order.store_id,'in','order',v_order.id,
    case when v_order.customer_id is null then 'platform' else 'customer' end,v_order.customer_id,
    'Venda pedido #'||v_order.display_number::text,v_competence,v_competence,v_order.created_by
  );
  if v_order.subtotal_cents>0 then
    perform private.finance_insert_transaction(v_order.organization_id,v_order.store_id,v_ob.id,null,v_sales,'recognition','in',1,v_order.subtotal_cents,v_competence,
      'order',v_order.id,null,'finance-order-sales:'||v_order.id::text,'Receita bruta pedido #'||v_order.display_number::text,'{}'::jsonb,v_order.created_by,coalesce(v_order.completed_at,v_order.updated_at));
  end if;
  if v_order.discount_cents>0 then
    perform private.finance_insert_transaction(v_order.organization_id,v_order.store_id,v_ob.id,null,v_discounts,'recognition','in',-1,v_order.discount_cents,v_competence,
      'order',v_order.id,null,'finance-order-discount:'||v_order.id::text,'Descontos pedido #'||v_order.display_number::text,'{}'::jsonb,v_order.created_by,coalesce(v_order.completed_at,v_order.updated_at));
  end if;
  if v_order.delivery_fee_cents>0 then
    perform private.finance_insert_transaction(v_order.organization_id,v_order.store_id,v_ob.id,null,v_delivery,'recognition','in',1,v_order.delivery_fee_cents,v_competence,
      'order',v_order.id,null,'finance-order-delivery:'||v_order.id::text,'Taxa de entrega pedido #'||v_order.display_number::text,'{}'::jsonb,v_order.created_by,coalesce(v_order.completed_at,v_order.updated_at));
  end if;
  select * into v_ob from public.financial_obligations where id=v_ob.id;
  if v_ob.principal_cents<>v_order.total_cents then raise exception 'financial order recognition does not match order total'; end if;
  for v_payment in select id from public.payments where order_id=v_order.id and status in ('paid','refunded') order by created_at,id loop
    perform private.finance_sync_payment(v_payment.id);
  end loop;
end; $$;
revoke all on function private.finance_sync_completed_order(uuid) from public,anon,authenticated;
grant execute on function private.finance_sync_completed_order(uuid) to service_role;

create or replace function private.finance_sync_inventory_movement(p_movement_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_move public.inventory_movements%rowtype; v_order public.orders%rowtype; v_category uuid; v_amount bigint; v_competence date;
begin
  select * into v_move from public.inventory_movements where id=p_movement_id;
  if v_move.id is null or v_move.movement_type<>'sale' or v_move.order_id is null or v_move.unit_cost_micros<=0 then return; end if;
  select * into v_order from public.orders where id=v_move.order_id;
  if v_order.id is null or v_order.order_status<>'completed' then return; end if;
  v_amount:=round(abs(v_move.quantity_delta)*v_move.unit_cost_micros/1000000::numeric)::bigint;
  if v_amount<=0 then return; end if;
  v_category:=private.finance_category_id(v_move.organization_id,'cogs');
  if v_category is null then raise exception 'financial COGS category unavailable'; end if;
  v_competence:=private.finance_store_local_date(v_move.store_id,coalesce(v_order.completed_at,v_move.created_at));
  perform private.finance_insert_transaction(
    v_move.organization_id,v_move.store_id,null,null,v_category,'recognition','out',1,v_amount,v_competence,
    'inventory_movement',v_move.id,null,'finance-cogs:'||v_move.id::text,'CPV pedido #'||v_order.display_number::text,
    jsonb_build_object('order_id',v_order.id,'inventory_item_id',v_move.inventory_item_id,'quantity_delta',v_move.quantity_delta,'unit_cost_micros',v_move.unit_cost_micros),
    v_move.created_by,v_move.created_at
  );
end; $$;
revoke all on function private.finance_sync_inventory_movement(uuid) from public,anon,authenticated;
grant execute on function private.finance_sync_inventory_movement(uuid) to service_role;

create or replace function private.finance_sync_purchase_receipt_item(p_receipt_item_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_item public.purchase_receipt_items%rowtype; v_receipt public.purchase_receipts%rowtype; v_source_receipt public.purchase_receipts%rowtype;
  v_po public.purchase_orders%rowtype; v_ob public.financial_obligations%rowtype; v_competence date; v_due date; v_effect smallint; v_type text;
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
  v_effect:=case when v_item.purchase_quantity_delta>0 then 1 else -1 end;
  v_type:=case when v_item.purchase_quantity_delta>0 then 'recognition' else 'obligation_adjustment' end;
  perform private.finance_insert_transaction(
    v_po.organization_id,v_po.store_id,v_ob.id,null,null,v_type,'out',v_effect,v_item.line_total_cents,v_competence,
    'purchase_receipt_item',v_item.id,null,'finance-purchase-item:'||v_item.id::text,
    case when v_effect=1 then 'Entrada de compra #'||v_po.display_number::text else 'Correção de compra #'||v_po.display_number::text end,
    jsonb_build_object('purchase_order_id',v_po.id,'receipt_id',v_receipt.id,'source_receipt_id',v_source_receipt.id,'purchase_quantity_delta',v_item.purchase_quantity_delta),
    v_receipt.created_by,v_receipt.created_at
  );
end; $$;
revoke all on function private.finance_sync_purchase_receipt_item(uuid) from public,anon,authenticated;
grant execute on function private.finance_sync_purchase_receipt_item(uuid) to service_role;

create or replace function private.finance_sync_cash_movement(p_cash_movement_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare v_move public.cash_movements%rowtype; v_account uuid;
begin
  select * into v_move from public.cash_movements where id=p_cash_movement_id;
  if v_move.id is null or v_move.movement_type in ('sale','refund') then return; end if;
  select id into v_account from public.financial_accounts
  where organization_id=v_move.organization_id and store_id=v_move.store_id and system_key='cash_on_hand' and active=true and deleted_at is null limit 1;
  if v_account is null then raise exception 'financial cash account unavailable'; end if;
  perform private.finance_insert_transaction(
    v_move.organization_id,v_move.store_id,null,v_account,null,'manual_adjustment',v_move.direction,1,v_move.amount_cents,null,
    'cash_movement',v_move.id,null,'finance-cash-movement:'||v_move.id::text,
    'Movimento de caixa: '||v_move.movement_type,
    jsonb_build_object('cash_session_id',v_move.cash_session_id,'cash_movement_type',v_move.movement_type,'reason',v_move.reason),
    v_move.created_by,v_move.created_at
  );
end; $$;
revoke all on function private.finance_sync_cash_movement(uuid) from public,anon,authenticated;
grant execute on function private.finance_sync_cash_movement(uuid) to service_role;

create or replace function private.on_order_finance_completion()
returns trigger language plpgsql security invoker set search_path='' as $$ begin perform private.finance_sync_completed_order(new.id); return new; end; $$;
revoke all on function private.on_order_finance_completion() from public,anon,authenticated;
drop trigger if exists orders_finance_after_completion on public.orders;
create trigger orders_finance_after_completion after update of order_status on public.orders
for each row when (new.order_status='completed' and old.order_status is distinct from 'completed') execute function private.on_order_finance_completion();

create or replace function private.on_payment_finance_status()
returns trigger language plpgsql security invoker set search_path='' as $$ begin perform private.finance_sync_payment(new.id); return new; end; $$;
revoke all on function private.on_payment_finance_status() from public,anon,authenticated;
drop trigger if exists payments_finance_status on public.payments;
create trigger payments_finance_status after update of status on public.payments
for each row when (new.status in ('paid','refunded') and old.status is distinct from new.status) execute function private.on_payment_finance_status();

create or replace function private.on_inventory_finance_insert()
returns trigger language plpgsql security invoker set search_path='' as $$ begin perform private.finance_sync_inventory_movement(new.id); return new; end; $$;
revoke all on function private.on_inventory_finance_insert() from public,anon,authenticated;
drop trigger if exists inventory_movements_finance_insert on public.inventory_movements;
create trigger inventory_movements_finance_insert after insert on public.inventory_movements
for each row when (new.movement_type='sale' and new.order_id is not null) execute function private.on_inventory_finance_insert();

create or replace function private.on_purchase_finance_receipt_item()
returns trigger language plpgsql security invoker set search_path='' as $$ begin perform private.finance_sync_purchase_receipt_item(new.id); return new; end; $$;
revoke all on function private.on_purchase_finance_receipt_item() from public,anon,authenticated;
drop trigger if exists purchase_receipt_items_finance_insert on public.purchase_receipt_items;
create trigger purchase_receipt_items_finance_insert after insert on public.purchase_receipt_items
for each row execute function private.on_purchase_finance_receipt_item();

create or replace function private.on_cash_finance_insert()
returns trigger language plpgsql security invoker set search_path='' as $$ begin perform private.finance_sync_cash_movement(new.id); return new; end; $$;
revoke all on function private.on_cash_finance_insert() from public,anon,authenticated;
drop trigger if exists cash_movements_finance_insert on public.cash_movements;
create trigger cash_movements_finance_insert after insert on public.cash_movements
for each row execute function private.on_cash_finance_insert();

-- Backfill idempotente para dados operacionais existentes.
select private.finance_sync_completed_order(id) from public.orders where order_status='completed';
select private.finance_sync_payment(id) from public.payments where status in ('paid','refunded');
select private.finance_sync_inventory_movement(id) from public.inventory_movements where movement_type='sale' and order_id is not null;
select private.finance_sync_purchase_receipt_item(id) from public.purchase_receipt_items;
select private.finance_sync_cash_movement(id) from public.cash_movements where movement_type not in ('sale','refund');
