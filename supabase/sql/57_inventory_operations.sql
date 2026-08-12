-- PedeAqui — Milestone 19 [186]–[198]
-- Operações de estoque: idempotência antes de saldo, projeção transacional e transferências pareadas.

create or replace function private.inventory_insert_movement(
  p_organization_id uuid,
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_unit_cost_micros bigint,
  p_idempotency_key text,
  p_source_type text default null,
  p_source_id uuid default null,
  p_order_id uuid default null,
  p_transfer_group_id uuid default null,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.inventory_movements
language plpgsql security invoker set search_path='' as $$
declare
  v_existing public.inventory_movements%rowtype;
  v_config public.inventory_item_stores%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_new_quantity numeric(18,6);
  v_old_average bigint;
  v_new_average bigint;
begin
  if p_movement_type not in ('purchase','sale','loss','adjustment','transfer','production','return') then raise exception 'invalid inventory movement type'; end if;
  if p_quantity_delta is null or p_quantity_delta=0 then raise exception 'inventory quantity delta must be non-zero'; end if;
  if abs(p_quantity_delta) > 999999999999::numeric then raise exception 'inventory quantity delta out of range'; end if;
  if p_unit_cost_micros is null or p_unit_cost_micros < 0 then raise exception 'invalid inventory unit cost'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid inventory idempotency key'; end if;

  -- Retry reconhecido antes de lock/saldo; nunca falha por efeito da primeira tentativa.
  select * into v_existing from public.inventory_movements
  where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.store_id<>p_store_id
      or v_existing.inventory_item_id<>p_inventory_item_id
      or v_existing.movement_type<>p_movement_type
      or v_existing.quantity_delta<>round(p_quantity_delta,6)
      or v_existing.unit_cost_micros<>p_unit_cost_micros
      or v_existing.source_type is distinct from p_source_type
      or v_existing.source_id is distinct from p_source_id
      or v_existing.order_id is distinct from p_order_id
      or v_existing.transfer_group_id is distinct from p_transfer_group_id then
      raise exception 'inventory idempotency key reused with different payload';
    end if;
    return v_existing;
  end if;

  select * into v_config from public.inventory_item_stores
  where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id and active=true
  for update;
  if v_config.inventory_item_id is null then raise exception 'inventory item is not active in store'; end if;

  insert into public.inventory_balances(organization_id,store_id,inventory_item_id,quantity)
  values(p_organization_id,p_store_id,p_inventory_item_id,0)
  on conflict (organization_id,store_id,inventory_item_id) do nothing;
  select * into v_balance from public.inventory_balances
  where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id
  for update;

  v_new_quantity := round(v_balance.quantity + p_quantity_delta,6);
  if not v_config.allow_negative and v_new_quantity < 0 then raise exception 'inventory movement would make stock negative'; end if;

  insert into public.inventory_movements(
    organization_id,store_id,inventory_item_id,movement_type,quantity_delta,unit_cost_micros,
    idempotency_key,source_type,source_id,order_id,transfer_group_id,reason,metadata,created_by
  ) values(
    p_organization_id,p_store_id,p_inventory_item_id,p_movement_type,round(p_quantity_delta,6),p_unit_cost_micros,
    trim(p_idempotency_key),nullif(trim(coalesce(p_source_type,'')),''),p_source_id,p_order_id,p_transfer_group_id,
    nullif(trim(coalesce(p_reason,'')),''),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id
  ) returning * into v_movement;

  update public.inventory_balances set quantity=v_new_quantity,updated_at=now()
  where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id;

  -- Custo médio é uma projeção preparada para o módulo de Compras; só entradas com custo conhecido alteram a média.
  if p_quantity_delta > 0 and p_unit_cost_micros > 0 and p_movement_type in ('purchase','return','transfer') then
    v_old_average := v_config.average_cost_micros_per_base_unit;
    if v_balance.quantity > 0 and v_old_average > 0 then
      v_new_average := round(((v_balance.quantity * v_old_average) + (p_quantity_delta * p_unit_cost_micros)) / greatest(v_new_quantity,0.000001))::bigint;
    else
      v_new_average := p_unit_cost_micros;
    end if;
    update public.inventory_item_stores set average_cost_micros_per_base_unit=v_new_average,updated_at=now(),updated_by=coalesce(p_actor_user_id,updated_by)
    where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id;
  end if;

  if v_balance.quantity > v_config.minimum_quantity and v_new_quantity <= v_config.minimum_quantity then
    insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
    values(p_organization_id,p_store_id,'inventory.low_stock','inventory_item',p_inventory_item_id,
      jsonb_build_object('quantity',v_new_quantity,'minimum_quantity',v_config.minimum_quantity,'movement_id',v_movement.id),
      'pending',0,now(),p_actor_user_id);
  elsif v_balance.quantity <= v_config.minimum_quantity and v_new_quantity > v_config.minimum_quantity then
    insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
    values(p_organization_id,p_store_id,'inventory.restocked','inventory_item',p_inventory_item_id,
      jsonb_build_object('quantity',v_new_quantity,'minimum_quantity',v_config.minimum_quantity,'movement_id',v_movement.id),
      'pending',0,now(),p_actor_user_id);
  end if;
  return v_movement;
end; $$;
revoke all on function private.inventory_insert_movement(uuid,uuid,uuid,text,numeric,bigint,text,text,uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.inventory_insert_movement(uuid,uuid,uuid,text,numeric,bigint,text,text,uuid,uuid,uuid,text,uuid,jsonb) to service_role;

create or replace function public.inventory_create_item_internal(
  p_store_id uuid,
  p_name text,
  p_sku text,
  p_base_unit text,
  p_minimum_quantity numeric,
  p_allow_negative boolean,
  p_average_cost_micros bigint,
  p_actor_user_id uuid default null
) returns public.inventory_items
language plpgsql security invoker set search_path='' as $$
declare
  v_store public.stores%rowtype;
  v_item public.inventory_items%rowtype;
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'invalid inventory item name'; end if;
  if p_base_unit not in ('unit','g','ml') then raise exception 'invalid inventory base unit'; end if;
  if p_minimum_quantity is null or p_minimum_quantity < 0 then raise exception 'invalid inventory minimum quantity'; end if;
  if p_average_cost_micros is null or p_average_cost_micros < 0 then raise exception 'invalid inventory average cost'; end if;
  select * into v_store from public.stores where id=p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  insert into public.inventory_items(organization_id,name,sku,base_unit,created_by,updated_by)
  values(v_store.organization_id,trim(p_name),nullif(trim(coalesce(p_sku,'')),''),p_base_unit,p_actor_user_id,p_actor_user_id)
  returning * into v_item;
  insert into public.inventory_item_stores(organization_id,store_id,inventory_item_id,minimum_quantity,allow_negative,average_cost_micros_per_base_unit,created_by,updated_by)
  values(v_store.organization_id,v_store.id,v_item.id,round(p_minimum_quantity,6),p_allow_negative,p_average_cost_micros,p_actor_user_id,p_actor_user_id);
  insert into public.inventory_balances(organization_id,store_id,inventory_item_id,quantity)
  values(v_store.organization_id,v_store.id,v_item.id,0);

  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_store.organization_id,v_store.id,p_actor_user_id,'inventory.item_created','inventory_item',v_item.id,
    jsonb_build_object('name',v_item.name,'base_unit',v_item.base_unit,'minimum_quantity',round(p_minimum_quantity,6),'allow_negative',p_allow_negative));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_store.organization_id,v_store.id,'inventory.item_created','inventory_item',v_item.id,jsonb_build_object('name',v_item.name,'base_unit',v_item.base_unit),'pending',0,now(),p_actor_user_id);
  return v_item;
end; $$;
revoke all on function public.inventory_create_item_internal(uuid,text,text,text,numeric,boolean,bigint,uuid) from public,anon,authenticated;
grant execute on function public.inventory_create_item_internal(uuid,text,text,text,numeric,boolean,bigint,uuid) to service_role;

create or replace function public.inventory_enable_item_store_internal(
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_minimum_quantity numeric,
  p_allow_negative boolean,
  p_actor_user_id uuid default null
) returns public.inventory_item_stores
language plpgsql security invoker set search_path='' as $$
declare
  v_store public.stores%rowtype;
  v_item public.inventory_items%rowtype;
  v_config public.inventory_item_stores%rowtype;
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if p_minimum_quantity is null or p_minimum_quantity < 0 then raise exception 'invalid inventory minimum quantity'; end if;
  select * into v_store from public.stores where id=p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;
  select * into v_item from public.inventory_items where id=p_inventory_item_id and organization_id=v_store.organization_id and deleted_at is null;
  if v_item.id is null then raise exception 'inventory item not found in organization'; end if;

  insert into public.inventory_item_stores(organization_id,store_id,inventory_item_id,active,minimum_quantity,allow_negative,created_by,updated_by)
  values(v_store.organization_id,v_store.id,v_item.id,true,round(p_minimum_quantity,6),p_allow_negative,p_actor_user_id,p_actor_user_id)
  on conflict (organization_id,store_id,inventory_item_id) do update set active=true,minimum_quantity=excluded.minimum_quantity,allow_negative=excluded.allow_negative,updated_by=p_actor_user_id,updated_at=now()
  returning * into v_config;
  insert into public.inventory_balances(organization_id,store_id,inventory_item_id,quantity)
  values(v_store.organization_id,v_store.id,v_item.id,0) on conflict do nothing;
  return v_config;
end; $$;
revoke all on function public.inventory_enable_item_store_internal(uuid,uuid,numeric,boolean,uuid) from public,anon,authenticated;
grant execute on function public.inventory_enable_item_store_internal(uuid,uuid,numeric,boolean,uuid) to service_role;

create or replace function public.inventory_update_store_item_internal(
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_active boolean,
  p_minimum_quantity numeric,
  p_allow_negative boolean,
  p_average_cost_micros bigint,
  p_actor_user_id uuid default null
) returns public.inventory_item_stores
language plpgsql security invoker set search_path='' as $$
declare
  v_before public.inventory_item_stores%rowtype;
  v_after public.inventory_item_stores%rowtype;
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if p_minimum_quantity is null or p_minimum_quantity < 0 then raise exception 'invalid inventory minimum quantity'; end if;
  if p_average_cost_micros is null or p_average_cost_micros < 0 then raise exception 'invalid inventory average cost'; end if;
  select * into v_before from public.inventory_item_stores where store_id=p_store_id and inventory_item_id=p_inventory_item_id for update;
  if v_before.inventory_item_id is null then raise exception 'inventory item is not configured in store'; end if;
  update public.inventory_item_stores set active=p_active,minimum_quantity=round(p_minimum_quantity,6),allow_negative=p_allow_negative,
    average_cost_micros_per_base_unit=p_average_cost_micros,updated_by=p_actor_user_id,updated_at=now()
  where organization_id=v_before.organization_id and store_id=v_before.store_id and inventory_item_id=v_before.inventory_item_id returning * into v_after;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_after.organization_id,v_after.store_id,p_actor_user_id,'inventory.store_item_updated','inventory_item',v_after.inventory_item_id,to_jsonb(v_before),to_jsonb(v_after));
  return v_after;
end; $$;
revoke all on function public.inventory_update_store_item_internal(uuid,uuid,boolean,numeric,boolean,bigint,uuid) from public,anon,authenticated;
grant execute on function public.inventory_update_store_item_internal(uuid,uuid,boolean,numeric,boolean,bigint,uuid) to service_role;

create or replace function public.inventory_manual_movement_internal(
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost_micros bigint,
  p_reason text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns public.inventory_movements
language plpgsql security invoker set search_path='' as $$
declare
  v_config public.inventory_item_stores%rowtype;
  v_delta numeric(18,6);
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if p_movement_type not in ('purchase','return','loss','adjustment','production') then raise exception 'invalid manual inventory movement type'; end if;
  if p_quantity is null or p_quantity=0 then raise exception 'inventory quantity must be non-zero'; end if;
  if p_movement_type in ('purchase','return') and p_quantity<0 then raise exception 'inventory entry quantity must be positive'; end if;
  if p_movement_type in ('loss','production') and p_quantity<0 then raise exception 'inventory outflow quantity must be positive'; end if;
  if p_movement_type in ('loss','adjustment','production') and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'inventory movement reason required'; end if;
  select * into v_config from public.inventory_item_stores where store_id=p_store_id and inventory_item_id=p_inventory_item_id;
  if v_config.inventory_item_id is null then raise exception 'inventory item is not configured in store'; end if;
  v_delta := case when p_movement_type in ('loss','production') then -abs(p_quantity) else p_quantity end;
  return private.inventory_insert_movement(v_config.organization_id,v_config.store_id,v_config.inventory_item_id,p_movement_type,v_delta,coalesce(p_unit_cost_micros,0),p_idempotency_key,'manual',null,null,null,p_reason,p_actor_user_id,'{}'::jsonb);
end; $$;
revoke all on function public.inventory_manual_movement_internal(uuid,uuid,text,numeric,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.inventory_manual_movement_internal(uuid,uuid,text,numeric,bigint,text,text,uuid) to service_role;

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

  select * into v_existing from public.inventory_movements where idempotency_key=trim(p_idempotency_key)||':out';
  if v_existing.id is not null then
    if v_existing.store_id<>p_source_store_id or v_existing.inventory_item_id<>p_inventory_item_id or v_existing.quantity_delta<>-round(p_quantity,6) then raise exception 'inventory transfer idempotency key reused with different payload'; end if;
    select * into v_in from public.inventory_movements where organization_id=v_existing.organization_id and idempotency_key=trim(p_idempotency_key)||':in';
    if v_in.id is null or v_in.store_id<>p_target_store_id then raise exception 'inventory transfer pair is incomplete'; end if;
    return jsonb_build_object('transfer_group_id',v_existing.transfer_group_id,'out_movement_id',v_existing.id,'in_movement_id',v_in.id,'created',false);
  end if;

  select * into v_source from public.inventory_item_stores where store_id=p_source_store_id and inventory_item_id=p_inventory_item_id and active=true for update;
  select * into v_target from public.inventory_item_stores where store_id=p_target_store_id and inventory_item_id=p_inventory_item_id and active=true for update;
  if v_source.inventory_item_id is null or v_target.inventory_item_id is null then raise exception 'inventory item must be active in both transfer stores'; end if;
  if v_source.organization_id<>v_target.organization_id then raise exception 'inventory transfer must stay in organization'; end if;
  v_group := gen_random_uuid();

  v_out := private.inventory_insert_movement(v_source.organization_id,v_source.store_id,p_inventory_item_id,'transfer',-abs(p_quantity),v_source.average_cost_micros_per_base_unit,trim(p_idempotency_key)||':out','transfer',v_group,null,v_group,p_reason,p_actor_user_id,jsonb_build_object('target_store_id',p_target_store_id));
  v_in := private.inventory_insert_movement(v_target.organization_id,v_target.store_id,p_inventory_item_id,'transfer',abs(p_quantity),v_source.average_cost_micros_per_base_unit,trim(p_idempotency_key)||':in','transfer',v_group,null,v_group,p_reason,p_actor_user_id,jsonb_build_object('source_store_id',p_source_store_id));
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_source.organization_id,v_source.store_id,p_actor_user_id,'inventory.transferred','inventory_item',p_inventory_item_id,
    jsonb_build_object('source_store_id',p_source_store_id,'target_store_id',p_target_store_id,'quantity',round(p_quantity,6),'transfer_group_id',v_group));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_source.organization_id,v_source.store_id,'inventory.transferred','inventory_item',p_inventory_item_id,
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
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if p_counted_quantity is null or p_counted_quantity<0 then raise exception 'invalid counted inventory quantity'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'inventory reconciliation reason required'; end if;
  select * into v_config from public.inventory_item_stores where store_id=p_store_id and inventory_item_id=p_inventory_item_id for update;
  if v_config.inventory_item_id is null then raise exception 'inventory item is not configured in store'; end if;
  insert into public.inventory_balances(organization_id,store_id,inventory_item_id,quantity) values(v_config.organization_id,v_config.store_id,v_config.inventory_item_id,0) on conflict do nothing;
  select * into v_balance from public.inventory_balances where organization_id=v_config.organization_id and store_id=v_config.store_id and inventory_item_id=v_config.inventory_item_id for update;
  v_delta := round(p_counted_quantity-v_balance.quantity,6);
  if v_delta=0 then return jsonb_build_object('movement_id',null,'before_quantity',v_balance.quantity,'counted_quantity',round(p_counted_quantity,6),'difference',0,'created',false); end if;
  v_movement := private.inventory_insert_movement(v_config.organization_id,v_config.store_id,v_config.inventory_item_id,'adjustment',v_delta,v_config.average_cost_micros_per_base_unit,p_idempotency_key,'stock_count',null,null,null,p_reason,p_actor_user_id,jsonb_build_object('before_quantity',v_balance.quantity,'counted_quantity',round(p_counted_quantity,6)));
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_config.organization_id,v_config.store_id,p_actor_user_id,'inventory.reconciled','inventory_item',v_config.inventory_item_id,
    jsonb_build_object('quantity',v_balance.quantity),jsonb_build_object('quantity',round(p_counted_quantity,6),'difference',v_delta,'movement_id',v_movement.id));
  return jsonb_build_object('movement_id',v_movement.id,'before_quantity',v_balance.quantity,'counted_quantity',round(p_counted_quantity,6),'difference',v_delta,'created',true);
end; $$;
revoke all on function public.inventory_reconcile_internal(uuid,uuid,numeric,text,text,uuid) from public,anon,authenticated;
grant execute on function public.inventory_reconcile_internal(uuid,uuid,numeric,text,text,uuid) to service_role;
