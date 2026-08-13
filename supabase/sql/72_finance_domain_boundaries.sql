-- PedeAqui — Financeiro [211]–[224]
-- Vendas são liquidadas pelo domínio Payments; Financeiro não pode duplicar/estornar esse subledger manualmente.

create or replace function public.financial_settle_obligation_internal(
  p_obligation_id uuid,p_account_id uuid,p_amount_cents bigint,p_settled_at timestamptz,p_reference text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_ob public.financial_obligations%rowtype; v_tx public.financial_transactions%rowtype; v_existing public.financial_transactions%rowtype; v_metadata jsonb;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'settlement amount must be positive'; end if;
  select * into v_ob from public.financial_obligations where id=p_obligation_id for update;
  if v_ob.id is null or v_ob.status='cancelled' then raise exception 'financial obligation unavailable'; end if;
  if v_ob.source_type='order' then raise exception 'order receivable must be settled through payments'; end if;
  v_metadata:=jsonb_build_object('reference',nullif(trim(coalesce(p_reference,'')),''));
  select * into v_existing from public.financial_transactions where organization_id=v_ob.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.obligation_id<>v_ob.id or v_existing.account_id is distinct from p_account_id or v_existing.transaction_type<>'settlement'
      or v_existing.direction<>v_ob.direction or v_existing.effect_sign<>1 or v_existing.amount_cents<>p_amount_cents
      or v_existing.source_type is distinct from 'manual_settlement' or v_existing.source_id is not null
      or v_existing.description is distinct from 'Liquidação financeira' or v_existing.metadata is distinct from v_metadata then
      raise exception 'financial idempotency key reused with different payload';
    end if;
    return jsonb_build_object('transaction_id',v_existing.id,'obligation_id',v_ob.id,'status',v_ob.status,'open_cents',v_ob.open_cents,'retry',true);
  end if;
  if p_amount_cents>v_ob.open_cents then raise exception 'settlement exceeds open amount'; end if;
  v_tx:=private.finance_insert_transaction(v_ob.organization_id,v_ob.store_id,v_ob.id,p_account_id,null,'settlement',v_ob.direction,1,p_amount_cents,null,
    'manual_settlement',null,null,p_idempotency_key,'Liquidação financeira',v_metadata,p_actor_user_id,coalesce(p_settled_at,now()));
  select * into v_ob from public.financial_obligations where id=v_ob.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_ob.organization_id,v_ob.store_id,p_actor_user_id,'finance.obligation_settled','financial_obligation',v_ob.id,jsonb_build_object('transaction_id',v_tx.id,'amount_cents',p_amount_cents,'status',v_ob.status));
  return jsonb_build_object('transaction_id',v_tx.id,'obligation_id',v_ob.id,'status',v_ob.status,'open_cents',v_ob.open_cents,'retry',false);
end; $$;
revoke all on function public.financial_settle_obligation_internal(uuid,uuid,bigint,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.financial_settle_obligation_internal(uuid,uuid,bigint,timestamptz,text,text,uuid) to service_role;

create or replace function public.financial_reverse_settlement_internal(
  p_transaction_id uuid,p_reason text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_original public.financial_transactions%rowtype; v_ob public.financial_obligations%rowtype; v_tx public.financial_transactions%rowtype;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'settlement reversal reason required'; end if;
  select * into v_original from public.financial_transactions where id=p_transaction_id and transaction_type='settlement';
  if v_original.id is null then raise exception 'settlement transaction not found'; end if;
  if v_original.source_type not in ('manual_settlement','manual') then raise exception 'automated settlement must be reversed by its source domain'; end if;
  select * into v_ob from public.financial_obligations where id=v_original.obligation_id for update;
  v_tx:=private.finance_insert_transaction(v_original.organization_id,v_original.store_id,v_original.obligation_id,v_original.account_id,null,
    'settlement_reversal',v_original.direction,-1,v_original.amount_cents,null,'financial_transaction',v_original.id,null,p_idempotency_key,
    trim(p_reason),jsonb_build_object('reverses_transaction_id',v_original.id),p_actor_user_id,now());
  select * into v_ob from public.financial_obligations where id=v_original.obligation_id;
  return jsonb_build_object('transaction_id',v_tx.id,'obligation_id',v_ob.id,'status',v_ob.status,'open_cents',v_ob.open_cents);
end; $$;
revoke all on function public.financial_reverse_settlement_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.financial_reverse_settlement_internal(uuid,text,text,uuid) to service_role;
