-- PedeAqui — Milestone 19 hardening
-- Serializa transferências do mesmo insumo e persiste idempotência até para contagens sem diferença.

create or replace function public.inventory_transfer_internal(
  p_source_store_id uuid,
  p_target_store_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_source_org uuid;
  v_target_org uuid;
  v_source public.inventory_item_stores%rowtype;
  v_target public.inventory_item_stores%rowtype;
  v_group uuid;
  v_out public.inventory_movements%rowtype;
  v_in public.inventory_movements%rowtype;
  v_existing public.inventory_movements%rowtype;
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if p_source_store_id=p_target_store_id then raise exception 'inventory transfer stores must differ'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'inventory transfer quantity must be positive'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'inventory transfer reason required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 220 then raise exception 'invalid inventory transfer idempotency key'; end if;

  select organization_id into v_source_org from public.stores where id=p_source_store_id;
  select organization_id into v_target_org from public.stores where id=p_target_store_id;
  if v_source_org is null or v_target_org is null then raise exception 'inventory transfer store not found'; end if;
  if v_source_org<>v_target_org then raise exception 'inventory transfer must stay in organization'; end if;

  -- Mesma organização+insumo usa uma ordem global de lock; evita deadlock em A→B e B→A concorrentes.
  perform pg_advisory_xact_lock(hashtext('inventory-transfer:'||v_source_org::text||':'||p_inventory_item_id::text));

  select * into v_existing from public.inventory_movements
  where organization_id=v_source_org and idempotency_key=trim(p_idempotency_key)||':out';
  if v_existing.id is not null then
    if v_existing.store_id<>p_source_store_id
      or v_existing.inventory_item_id<>p_inventory_item_id
      or v_existing.quantity_delta<>-round(p_quantity,6) then
      raise exception 'inventory transfer idempotency key reused with different payload';
    end if;
    select * into v_in from public.inventory_movements
    where organization_id=v_source_org and idempotency_key=trim(p_idempotency_key)||':in';
    if v_in.id is null or v_in.store_id<>p_target_store_id or v_in.inventory_item_id<>p_inventory_item_id then
      raise exception 'inventory transfer pair is incomplete';
    end if;
    return jsonb_build_object('transfer_group_id',v_existing.transfer_group_id,'out_movement_id',v_existing.id,'in_movement_id',v_in.id,'created',false);
  end if;

  select * into v_source from public.inventory_item_stores
  where organization_id=v_source_org and store_id=p_source_store_id and inventory_item_id=p_inventory_item_id and active=true for update;
  select * into v_target from public.inventory_item_stores
  where organization_id=v_source_org and store_id=p_target_store_id and inventory_item_id=p_inventory_item_id and active=true for update;
  if v_source.inventory_item_id is null or v_target.inventory_item_id is null then
    raise exception 'inventory item must be active in both transfer stores';
  end if;

  v_group := gen_random_uuid();
  v_out := private.inventory_insert_movement(
    v_source_org,p_source_store_id,p_inventory_item_id,'transfer',-abs(p_quantity),v_source.average_cost_micros_per_base_unit,
    trim(p_idempotency_key)||':out','transfer',v_group,null,v_group,p_reason,p_actor_user_id,
    jsonb_build_object('target_store_id',p_target_store_id)
  );
  v_in := private.inventory_insert_movement(
    v_source_org,p_target_store_id,p_inventory_item_id,'transfer',abs(p_quantity),v_source.average_cost_micros_per_base_unit,
    trim(p_idempotency_key)||':in','transfer',v_group,null,v_group,p_reason,p_actor_user_id,
    jsonb_build_object('source_store_id',p_source_store_id)
  );

  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_source_org,p_source_store_id,p_actor_user_id,'inventory.transferred','inventory_item',p_inventory_item_id,
    jsonb_build_object('source_store_id',p_source_store_id,'target_store_id',p_target_store_id,'quantity',round(p_quantity,6),'transfer_group_id',v_group));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_source_org,p_source_store_id,'inventory.transferred','inventory_item',p_inventory_item_id,
    jsonb_build_object('source_store_id',p_source_store_id,'target_store_id',p_target_store_id,'quantity',round(p_quantity,6),'transfer_group_id',v_group),'pending',0,now(),p_actor_user_id);

  return jsonb_build_object('transfer_group_id',v_group,'out_movement_id',v_out.id,'in_movement_id',v_in.id,'created',true);
end; $$;
revoke all on function public.inventory_transfer_internal(uuid,uuid,uuid,numeric,text,text,uuid) from public,anon,authenticated;
grant execute on function public.inventory_transfer_internal(uuid,uuid,uuid,numeric,text,text,uuid) to service_role;

create or replace function public.inventory_reconcile_internal(
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_counted_quantity numeric,
  p_reason text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_config public.inventory_item_stores%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_delta numeric(18,6);
  v_movement public.inventory_movements%rowtype;
  v_fingerprint text;
  v_idem_id uuid;
  v_existing public.idempotency_keys%rowtype;
  v_response jsonb;
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if p_counted_quantity is null or p_counted_quantity<0 then raise exception 'invalid counted inventory quantity'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'inventory reconciliation reason required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 220 then raise exception 'invalid inventory reconciliation idempotency key'; end if;

  select * into v_config from public.inventory_item_stores
  where store_id=p_store_id and inventory_item_id=p_inventory_item_id;
  if v_config.inventory_item_id is null then raise exception 'inventory item is not configured in store'; end if;

  v_fingerprint := p_store_id::text||'|'||p_inventory_item_id::text||'|'||round(p_counted_quantity,6)::text||'|'||trim(p_reason);
  insert into public.idempotency_keys(organization_id,store_id,scope,idempotency_key,request_fingerprint,status,expires_at)
  values(v_config.organization_id,p_store_id,'inventory.reconcile',trim(p_idempotency_key),v_fingerprint,'processing',now()+interval '7 days')
  on conflict (organization_id,scope,idempotency_key) do nothing
  returning id into v_idem_id;

  if v_idem_id is null then
    select * into v_existing from public.idempotency_keys
    where organization_id=v_config.organization_id and scope='inventory.reconcile' and idempotency_key=trim(p_idempotency_key);
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'inventory reconciliation idempotency key reused with different payload';
    end if;
    if v_existing.status='completed' then return v_existing.response_body; end if;
    raise exception 'inventory reconciliation is already processing';
  end if;

  select * into v_config from public.inventory_item_stores
  where organization_id=v_config.organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id for update;
  insert into public.inventory_balances(organization_id,store_id,inventory_item_id,quantity)
  values(v_config.organization_id,p_store_id,p_inventory_item_id,0) on conflict do nothing;
  select * into v_balance from public.inventory_balances
  where organization_id=v_config.organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id for update;

  v_delta := round(p_counted_quantity-v_balance.quantity,6);
  if v_delta=0 then
    v_response := jsonb_build_object('movement_id',null,'before_quantity',v_balance.quantity,'counted_quantity',round(p_counted_quantity,6),'difference',0,'created',false);
  else
    v_movement := private.inventory_insert_movement(
      v_config.organization_id,p_store_id,p_inventory_item_id,'adjustment',v_delta,v_config.average_cost_micros_per_base_unit,
      trim(p_idempotency_key)||':movement','stock_count',null,null,null,p_reason,p_actor_user_id,
      jsonb_build_object('before_quantity',v_balance.quantity,'counted_quantity',round(p_counted_quantity,6))
    );
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(v_config.organization_id,p_store_id,p_actor_user_id,'inventory.reconciled','inventory_item',p_inventory_item_id,
      jsonb_build_object('quantity',v_balance.quantity),jsonb_build_object('quantity',round(p_counted_quantity,6),'difference',v_delta,'movement_id',v_movement.id));
    v_response := jsonb_build_object('movement_id',v_movement.id,'before_quantity',v_balance.quantity,'counted_quantity',round(p_counted_quantity,6),'difference',v_delta,'created',true);
  end if;

  update public.idempotency_keys set status='completed',response_code=200,response_body=v_response,updated_at=now()
  where id=v_idem_id;
  return v_response;
end; $$;
revoke all on function public.inventory_reconcile_internal(uuid,uuid,numeric,text,text,uuid) from public,anon,authenticated;
grant execute on function public.inventory_reconcile_internal(uuid,uuid,numeric,text,text,uuid) to service_role;
