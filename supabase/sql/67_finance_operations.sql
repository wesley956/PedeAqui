-- PedeAqui — Milestone 21 [211]–[224]
-- Operações atômicas do ledger financeiro e projeções.

create or replace function private.finance_refresh_obligation(p_obligation_id uuid)
returns public.financial_obligations
language plpgsql security invoker set search_path='' as $$
declare v_row public.financial_obligations%rowtype; v_principal bigint; v_settled bigint; v_status text;
begin
  select * into v_row from public.financial_obligations where id=p_obligation_id for update;
  if v_row.id is null then raise exception 'financial obligation not found'; end if;
  select coalesce(sum(case when transaction_type in ('recognition','obligation_adjustment') then effect_sign*amount_cents else 0 end),0)::bigint,
         coalesce(sum(case when transaction_type in ('settlement','settlement_reversal') then effect_sign*amount_cents else 0 end),0)::bigint
  into v_principal,v_settled
  from public.financial_transactions where obligation_id=v_row.id;
  if v_principal<0 then raise exception 'financial obligation principal cannot be negative'; end if;
  if v_settled<0 or v_settled>v_principal then raise exception 'financial obligation settlement is invalid'; end if;
  if v_row.status='cancelled' then return v_row; end if;
  v_status:=case when v_principal=0 or v_settled=v_principal then 'settled' when v_settled>0 then 'partially_settled' else 'open' end;
  update public.financial_obligations set principal_cents=v_principal,settled_cents=v_settled,open_cents=v_principal-v_settled,status=v_status,updated_at=now()
  where id=v_row.id returning * into v_row;
  return v_row;
end; $$;
revoke all on function private.finance_refresh_obligation(uuid) from public,anon,authenticated;
grant execute on function private.finance_refresh_obligation(uuid) to service_role;

create or replace function private.finance_insert_transaction(
  p_organization_id uuid,p_store_id uuid,p_obligation_id uuid,p_account_id uuid,p_category_id uuid,
  p_transaction_type text,p_direction text,p_effect_sign smallint,p_amount_cents bigint,p_competence_date date,
  p_source_type text,p_source_id uuid,p_transfer_group_id uuid,p_idempotency_key text,p_description text,
  p_metadata jsonb,p_actor_user_id uuid,p_occurred_at timestamptz default now()
) returns public.financial_transactions
language plpgsql security invoker set search_path='' as $$
declare
  v_existing public.financial_transactions%rowtype; v_obligation public.financial_obligations%rowtype; v_account public.financial_accounts%rowtype;
  v_category public.financial_categories%rowtype; v_tx public.financial_transactions%rowtype; v_balance public.financial_account_balances%rowtype;
  v_account_delta bigint;
begin
  if p_transaction_type not in ('recognition','obligation_adjustment','settlement','settlement_reversal','transfer','manual_adjustment') then raise exception 'invalid financial transaction type'; end if;
  if p_direction not in ('in','out') then raise exception 'invalid financial direction'; end if;
  if p_effect_sign not in (-1,1) then raise exception 'invalid financial effect sign'; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'financial amount must be positive'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid financial idempotency key'; end if;

  select * into v_existing from public.financial_transactions
  where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.store_id is distinct from p_store_id or v_existing.obligation_id is distinct from p_obligation_id
      or v_existing.account_id is distinct from p_account_id or v_existing.category_id is distinct from p_category_id
      or v_existing.transaction_type<>p_transaction_type or v_existing.direction<>p_direction
      or v_existing.effect_sign<>p_effect_sign or v_existing.amount_cents<>p_amount_cents
      or v_existing.competence_date is distinct from p_competence_date or v_existing.source_type is distinct from nullif(trim(coalesce(p_source_type,'')),'')
      or v_existing.source_id is distinct from p_source_id or v_existing.transfer_group_id is distinct from p_transfer_group_id then
      raise exception 'financial idempotency key reused with different payload';
    end if;
    return v_existing;
  end if;

  if p_obligation_id is not null then
    select * into v_obligation from public.financial_obligations where id=p_obligation_id and organization_id=p_organization_id for update;
    if v_obligation.id is null then raise exception 'financial obligation unavailable'; end if;
    if v_obligation.store_id is distinct from p_store_id then raise exception 'financial obligation store mismatch'; end if;
    if v_obligation.direction<>p_direction then raise exception 'financial obligation direction mismatch'; end if;
    if v_obligation.status='cancelled' then raise exception 'financial obligation is cancelled'; end if;
  end if;
  if p_account_id is not null then
    select * into v_account from public.financial_accounts where id=p_account_id and organization_id=p_organization_id and active=true and deleted_at is null;
    if v_account.id is null then raise exception 'financial account unavailable'; end if;
    if v_account.store_id is not null and p_store_id is distinct from v_account.store_id then raise exception 'financial account store mismatch'; end if;
    insert into public.financial_account_balances(organization_id,account_id,balance_cents) values(p_organization_id,p_account_id,0)
    on conflict (organization_id,account_id) do nothing;
    select * into v_balance from public.financial_account_balances where organization_id=p_organization_id and account_id=p_account_id for update;
  end if;
  if p_category_id is not null then
    select * into v_category from public.financial_categories where id=p_category_id and organization_id=p_organization_id and active=true and deleted_at is null;
    if v_category.id is null then raise exception 'financial category unavailable'; end if;
  end if;

  insert into public.financial_transactions(
    organization_id,store_id,obligation_id,account_id,category_id,transaction_type,direction,effect_sign,amount_cents,competence_date,
    source_type,source_id,transfer_group_id,idempotency_key,description,metadata,created_by,occurred_at
  ) values(
    p_organization_id,p_store_id,p_obligation_id,p_account_id,p_category_id,p_transaction_type,p_direction,p_effect_sign,p_amount_cents,p_competence_date,
    nullif(trim(coalesce(p_source_type,'')),''),p_source_id,p_transfer_group_id,trim(p_idempotency_key),nullif(trim(coalesce(p_description,'')),''),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id,coalesce(p_occurred_at,now())
  ) returning * into v_tx;

  if p_account_id is not null then
    v_account_delta:=case when p_direction='in' then p_effect_sign*p_amount_cents else -p_effect_sign*p_amount_cents end;
    update public.financial_account_balances set balance_cents=balance_cents+v_account_delta,updated_at=now()
    where organization_id=p_organization_id and account_id=p_account_id;
  end if;
  if p_obligation_id is not null then perform private.finance_refresh_obligation(p_obligation_id); end if;
  return v_tx;
end; $$;
revoke all on function private.finance_insert_transaction(uuid,uuid,uuid,uuid,uuid,text,text,smallint,bigint,date,text,uuid,uuid,text,text,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.finance_insert_transaction(uuid,uuid,uuid,uuid,uuid,text,text,smallint,bigint,date,text,uuid,uuid,text,text,jsonb,uuid,timestamptz) to service_role;

create or replace function private.finance_ensure_obligation(
  p_organization_id uuid,p_store_id uuid,p_direction text,p_source_type text,p_source_id uuid,p_counterparty_type text,p_counterparty_id uuid,
  p_description text,p_competence_date date,p_due_date date,p_actor_user_id uuid
) returns public.financial_obligations
language plpgsql security invoker set search_path='' as $$
declare v_row public.financial_obligations%rowtype; v_type text;
begin
  if p_direction not in ('in','out') then raise exception 'invalid financial direction'; end if;
  if char_length(trim(coalesce(p_description,''))) not between 2 and 300 then raise exception 'financial obligation description required'; end if;
  v_type:=case when p_direction='in' then 'receivable' else 'payable' end;
  if p_source_type is not null and p_source_id is not null then
    select * into v_row from public.financial_obligations where organization_id=p_organization_id and source_type=p_source_type and source_id=p_source_id and direction=p_direction and status<>'cancelled' for update;
    if v_row.id is not null then return v_row; end if;
  end if;
  insert into public.financial_obligations(
    organization_id,store_id,direction,obligation_type,source_type,source_id,counterparty_type,counterparty_id,description,competence_date,due_date,created_by
  ) values(
    p_organization_id,p_store_id,p_direction,v_type,nullif(trim(coalesce(p_source_type,'')),''),p_source_id,p_counterparty_type,p_counterparty_id,
    trim(p_description),p_competence_date,p_due_date,p_actor_user_id
  ) returning * into v_row;
  return v_row;
end; $$;
revoke all on function private.finance_ensure_obligation(uuid,uuid,text,text,uuid,text,uuid,text,date,date,uuid) from public,anon,authenticated;
grant execute on function private.finance_ensure_obligation(uuid,uuid,text,text,uuid,text,uuid,text,date,date,uuid) to service_role;

create or replace function public.financial_create_account_internal(
  p_store_id uuid,p_name text,p_account_type text,p_actor_user_id uuid
) returns public.financial_accounts
language plpgsql security invoker set search_path='' as $$
declare v_store public.stores%rowtype; v_row public.financial_accounts%rowtype;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'invalid financial account name'; end if;
  if p_account_type not in ('cash','bank','clearing','wallet','other') then raise exception 'invalid financial account type'; end if;
  select * into v_store from public.stores where id=p_store_id and status='active'; if v_store.id is null then raise exception 'store unavailable'; end if;
  insert into public.financial_accounts(organization_id,store_id,name,account_type,created_by,updated_by)
  values(v_store.organization_id,v_store.id,trim(p_name),p_account_type,p_actor_user_id,p_actor_user_id) returning * into v_row;
  insert into public.financial_account_balances(organization_id,account_id,balance_cents) values(v_store.organization_id,v_row.id,0);
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_store.organization_id,v_store.id,p_actor_user_id,'finance.account_created','financial_account',v_row.id,jsonb_build_object('name',v_row.name,'account_type',v_row.account_type));
  return v_row;
end; $$;
revoke all on function public.financial_create_account_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.financial_create_account_internal(uuid,text,text,uuid) to service_role;

create or replace function public.financial_create_category_internal(
  p_organization_id uuid,p_name text,p_nature text,p_dre_group text,p_parent_id uuid,p_actor_user_id uuid
) returns public.financial_categories
language plpgsql security invoker set search_path='' as $$
declare v_parent public.financial_categories%rowtype; v_row public.financial_categories%rowtype;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'invalid financial category name'; end if;
  if p_nature not in ('revenue','expense') then raise exception 'invalid financial category nature'; end if;
  if p_dre_group not in ('gross_revenue','deductions','delivery_revenue','cogs','operating_expense','other_revenue','other_expense') then raise exception 'invalid DRE group'; end if;
  if p_parent_id is not null then
    select * into v_parent from public.financial_categories where id=p_parent_id and organization_id=p_organization_id and active=true and deleted_at is null;
    if v_parent.id is null then raise exception 'parent financial category unavailable'; end if;
    if v_parent.nature<>p_nature then raise exception 'financial category parent nature mismatch'; end if;
  end if;
  insert into public.financial_categories(organization_id,parent_id,name,nature,dre_group,created_by,updated_by)
  values(p_organization_id,p_parent_id,trim(p_name),p_nature,p_dre_group,p_actor_user_id,p_actor_user_id) returning * into v_row;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_organization_id,p_actor_user_id,'finance.category_created','financial_category',v_row.id,jsonb_build_object('name',v_row.name,'nature',v_row.nature,'dre_group',v_row.dre_group));
  return v_row;
end; $$;
revoke all on function public.financial_create_category_internal(uuid,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.financial_create_category_internal(uuid,text,text,text,uuid,uuid) to service_role;

create or replace function public.financial_settle_obligation_internal(
  p_obligation_id uuid,p_account_id uuid,p_amount_cents bigint,p_settled_at timestamptz,p_reference text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_ob public.financial_obligations%rowtype; v_tx public.financial_transactions%rowtype;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'settlement amount must be positive'; end if;
  select * into v_ob from public.financial_obligations where id=p_obligation_id for update;
  if v_ob.id is null or v_ob.status='cancelled' then raise exception 'financial obligation unavailable'; end if;
  if p_amount_cents>v_ob.open_cents then raise exception 'settlement exceeds open amount'; end if;
  v_tx:=private.finance_insert_transaction(v_ob.organization_id,v_ob.store_id,v_ob.id,p_account_id,null,'settlement',v_ob.direction,1,p_amount_cents,null,
    'manual_settlement',null,null,p_idempotency_key,'Liquidação financeira',jsonb_build_object('reference',nullif(trim(coalesce(p_reference,'')),'')),p_actor_user_id,coalesce(p_settled_at,now()));
  select * into v_ob from public.financial_obligations where id=v_ob.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_ob.organization_id,v_ob.store_id,p_actor_user_id,'finance.obligation_settled','financial_obligation',v_ob.id,jsonb_build_object('transaction_id',v_tx.id,'amount_cents',p_amount_cents,'status',v_ob.status));
  return jsonb_build_object('transaction_id',v_tx.id,'obligation_id',v_ob.id,'status',v_ob.status,'open_cents',v_ob.open_cents);
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
  select * into v_ob from public.financial_obligations where id=v_original.obligation_id for update;
  v_tx:=private.finance_insert_transaction(v_original.organization_id,v_original.store_id,v_original.obligation_id,v_original.account_id,null,
    'settlement_reversal',v_original.direction,-1,v_original.amount_cents,null,'financial_transaction',v_original.id,null,p_idempotency_key,
    trim(p_reason),jsonb_build_object('reverses_transaction_id',v_original.id),p_actor_user_id,now());
  select * into v_ob from public.financial_obligations where id=v_original.obligation_id;
  return jsonb_build_object('transaction_id',v_tx.id,'obligation_id',v_ob.id,'status',v_ob.status,'open_cents',v_ob.open_cents);
end; $$;
revoke all on function public.financial_reverse_settlement_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.financial_reverse_settlement_internal(uuid,text,text,uuid) to service_role;

create or replace function public.financial_transfer_internal(
  p_source_account_id uuid,p_target_account_id uuid,p_amount_cents bigint,p_occurred_at timestamptz,p_reason text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_source public.financial_accounts%rowtype; v_target public.financial_accounts%rowtype; v_group uuid; v_out public.financial_transactions%rowtype; v_in public.financial_transactions%rowtype;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if p_source_account_id=p_target_account_id then raise exception 'financial transfer accounts must differ'; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'transfer amount must be positive'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'financial transfer reason required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(p_source_account_id::text,p_target_account_id::text),0));
  select * into v_source from public.financial_accounts where id=p_source_account_id and active=true and deleted_at is null;
  select * into v_target from public.financial_accounts where id=p_target_account_id and active=true and deleted_at is null;
  if v_source.id is null or v_target.id is null or v_source.organization_id<>v_target.organization_id then raise exception 'financial transfer accounts unavailable'; end if;
  v_group:=gen_random_uuid();
  v_out:=private.finance_insert_transaction(v_source.organization_id,v_source.store_id,null,v_source.id,null,'transfer','out',1,p_amount_cents,null,'financial_transfer',v_group,v_group,p_idempotency_key||':out',trim(p_reason),'{}'::jsonb,p_actor_user_id,coalesce(p_occurred_at,now()));
  v_in:=private.finance_insert_transaction(v_target.organization_id,v_target.store_id,null,v_target.id,null,'transfer','in',1,p_amount_cents,null,'financial_transfer',v_group,v_group,p_idempotency_key||':in',trim(p_reason),'{}'::jsonb,p_actor_user_id,coalesce(p_occurred_at,now()));
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_source.organization_id,v_source.store_id,p_actor_user_id,'finance.transfer','financial_transaction',v_out.id,jsonb_build_object('transfer_group_id',v_group,'target_account_id',v_target.id,'amount_cents',p_amount_cents));
  return jsonb_build_object('transfer_group_id',v_group,'out_transaction_id',v_out.id,'in_transaction_id',v_in.id);
end; $$;
revoke all on function public.financial_transfer_internal(uuid,uuid,bigint,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.financial_transfer_internal(uuid,uuid,bigint,timestamptz,text,text,uuid) to service_role;

create or replace function public.financial_manual_entry_internal(
  p_store_id uuid,p_direction text,p_category_id uuid,p_amount_cents bigint,p_competence_date date,p_due_date date,p_description text,
  p_account_id uuid,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_store public.stores%rowtype; v_category public.financial_categories%rowtype; v_ob public.financial_obligations%rowtype; v_rec public.financial_transactions%rowtype; v_set public.financial_transactions%rowtype; v_source_id uuid;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if p_direction not in ('in','out') then raise exception 'invalid financial direction'; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'financial amount must be positive'; end if;
  if char_length(trim(coalesce(p_description,'')))<2 then raise exception 'financial description required'; end if;
  select * into v_store from public.stores where id=p_store_id and status='active'; if v_store.id is null then raise exception 'store unavailable'; end if;
  select * into v_category from public.financial_categories where id=p_category_id and organization_id=v_store.organization_id and active=true and deleted_at is null;
  if v_category.id is null then raise exception 'financial category unavailable'; end if;
  if (p_direction='in' and v_category.nature<>'revenue') or (p_direction='out' and v_category.nature<>'expense') then raise exception 'financial category nature does not match direction'; end if;
  v_source_id:=gen_random_uuid();
  v_ob:=private.finance_ensure_obligation(v_store.organization_id,v_store.id,p_direction,'manual',v_source_id,'manual',null,trim(p_description),p_competence_date,coalesce(p_due_date,p_competence_date),p_actor_user_id);
  v_rec:=private.finance_insert_transaction(v_store.organization_id,v_store.id,v_ob.id,null,v_category.id,'recognition',p_direction,1,p_amount_cents,p_competence_date,
    'manual',v_source_id,null,p_idempotency_key||':recognition',trim(p_description),'{}'::jsonb,p_actor_user_id,now());
  if p_account_id is not null then
    v_set:=private.finance_insert_transaction(v_store.organization_id,v_store.id,v_ob.id,p_account_id,null,'settlement',p_direction,1,p_amount_cents,null,
      'manual',v_source_id,null,p_idempotency_key||':settlement','Liquidação imediata','{}'::jsonb,p_actor_user_id,now());
  end if;
  select * into v_ob from public.financial_obligations where id=v_ob.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_store.organization_id,v_store.id,p_actor_user_id,'finance.manual_entry_created','financial_obligation',v_ob.id,jsonb_build_object('direction',p_direction,'amount_cents',p_amount_cents,'category_id',p_category_id,'settled',p_account_id is not null));
  return jsonb_build_object('obligation_id',v_ob.id,'recognition_transaction_id',v_rec.id,'settlement_transaction_id',v_set.id,'status',v_ob.status,'open_cents',v_ob.open_cents);
end; $$;
revoke all on function public.financial_manual_entry_internal(uuid,text,uuid,bigint,date,date,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.financial_manual_entry_internal(uuid,text,uuid,bigint,date,date,text,uuid,text,uuid) to service_role;
