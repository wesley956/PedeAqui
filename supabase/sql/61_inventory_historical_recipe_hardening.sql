-- PedeAqui — Milestone 19 historical hardening
-- Uma versão só pode afetar pedidos se já existia E estava vigente na confirmação.
-- Insumo desativado depois da confirmação ainda recebe a baixa histórica; novas operações manuais continuam exigindo ativo.

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
  if abs(p_quantity_delta)>999999999999::numeric then raise exception 'inventory quantity delta out of range'; end if;
  if p_unit_cost_micros is null or p_unit_cost_micros<0 then raise exception 'invalid inventory unit cost'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid inventory idempotency key'; end if;

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
  where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id
  for update;
  if v_config.inventory_item_id is null then raise exception 'inventory item is not configured in store'; end if;

  insert into public.inventory_balances(organization_id,store_id,inventory_item_id,quantity)
  values(p_organization_id,p_store_id,p_inventory_item_id,0) on conflict do nothing;
  select * into v_balance from public.inventory_balances
  where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id for update;

  v_new_quantity:=round(v_balance.quantity+p_quantity_delta,6);
  if not v_config.allow_negative and v_new_quantity<0 then raise exception 'inventory movement would make stock negative'; end if;

  insert into public.inventory_movements(
    organization_id,store_id,inventory_item_id,movement_type,quantity_delta,unit_cost_micros,idempotency_key,
    source_type,source_id,order_id,transfer_group_id,reason,metadata,created_by
  ) values(
    p_organization_id,p_store_id,p_inventory_item_id,p_movement_type,round(p_quantity_delta,6),p_unit_cost_micros,
    trim(p_idempotency_key),nullif(trim(coalesce(p_source_type,'')),''),p_source_id,p_order_id,p_transfer_group_id,
    nullif(trim(coalesce(p_reason,'')),''),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id
  ) returning * into v_movement;

  update public.inventory_balances set quantity=v_new_quantity,updated_at=now()
  where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id;

  if p_quantity_delta>0 and p_unit_cost_micros>0 and p_movement_type in ('purchase','return','transfer') then
    v_old_average:=v_config.average_cost_micros_per_base_unit;
    if v_balance.quantity>0 and v_old_average>0 then
      v_new_average:=round(((v_balance.quantity*v_old_average)+(p_quantity_delta*p_unit_cost_micros))/greatest(v_new_quantity,0.000001))::bigint;
    else v_new_average:=p_unit_cost_micros; end if;
    update public.inventory_item_stores
    set average_cost_micros_per_base_unit=v_new_average,updated_at=now(),updated_by=coalesce(p_actor_user_id,updated_by)
    where organization_id=p_organization_id and store_id=p_store_id and inventory_item_id=p_inventory_item_id;
  end if;

  if v_balance.quantity>v_config.minimum_quantity and v_new_quantity<=v_config.minimum_quantity then
    insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
    values(p_organization_id,p_store_id,'inventory.low_stock','inventory_item',p_inventory_item_id,
      jsonb_build_object('quantity',v_new_quantity,'minimum_quantity',v_config.minimum_quantity,'movement_id',v_movement.id),'pending',0,now(),p_actor_user_id);
  elsif v_balance.quantity<=v_config.minimum_quantity and v_new_quantity>v_config.minimum_quantity then
    insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
    values(p_organization_id,p_store_id,'inventory.restocked','inventory_item',p_inventory_item_id,
      jsonb_build_object('quantity',v_new_quantity,'minimum_quantity',v_config.minimum_quantity,'movement_id',v_movement.id),'pending',0,now(),p_actor_user_id);
  end if;
  return v_movement;
end; $$;
revoke all on function private.inventory_insert_movement(uuid,uuid,uuid,text,numeric,bigint,text,text,uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.inventory_insert_movement(uuid,uuid,uuid,text,numeric,bigint,text,text,uuid,uuid,uuid,text,uuid,jsonb) to service_role;

create or replace function public.inventory_manual_movement_internal(
  p_store_id uuid,p_inventory_item_id uuid,p_movement_type text,p_quantity numeric,p_unit_cost_micros bigint,
  p_reason text,p_idempotency_key text,p_actor_user_id uuid default null
) returns public.inventory_movements
language plpgsql security invoker set search_path='' as $$
declare v_config public.inventory_item_stores%rowtype; v_delta numeric(18,6);
begin
  if p_actor_user_id is null then raise exception 'inventory actor is required'; end if;
  if p_movement_type not in ('purchase','return','loss','adjustment','production') then raise exception 'invalid manual inventory movement type'; end if;
  if p_quantity is null or p_quantity=0 then raise exception 'inventory quantity must be non-zero'; end if;
  if p_movement_type in ('purchase','return') and p_quantity<0 then raise exception 'inventory entry quantity must be positive'; end if;
  if p_movement_type in ('loss','production') and p_quantity<0 then raise exception 'inventory outflow quantity must be positive'; end if;
  if p_movement_type in ('loss','adjustment','production') and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'inventory movement reason required'; end if;
  select * into v_config from public.inventory_item_stores
  where store_id=p_store_id and inventory_item_id=p_inventory_item_id and active=true;
  if v_config.inventory_item_id is null then raise exception 'inventory item is not active in store'; end if;
  v_delta:=case when p_movement_type in ('loss','production') then -abs(p_quantity) else p_quantity end;
  return private.inventory_insert_movement(
    v_config.organization_id,v_config.store_id,v_config.inventory_item_id,p_movement_type,v_delta,coalesce(p_unit_cost_micros,0),
    p_idempotency_key,'manual',null,null,null,p_reason,p_actor_user_id,'{}'::jsonb
  );
end; $$;
revoke all on function public.inventory_manual_movement_internal(uuid,uuid,text,numeric,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.inventory_manual_movement_internal(uuid,uuid,text,numeric,bigint,text,text,uuid) to service_role;

create or replace function private.consume_order_inventory()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  v_effective_at timestamptz;
  v_order_item record;
  v_modifier record;
  v_recipe public.recipes%rowtype;
  v_ingredient record;
  v_config public.inventory_item_stores%rowtype;
  v_consumed integer:=0;
  v_missing_products integer:=0;
  v_missing_modifiers integer:=0;
begin
  v_effective_at:=coalesce(new.confirmed_at,new.created_at);

  for v_order_item in
    select oi.id,oi.product_id,oi.product_name_snapshot,oi.quantity from public.order_items oi where oi.order_id=new.id
  loop
    if v_order_item.product_id is null then continue; end if;
    v_recipe:=null;
    select * into v_recipe from public.recipes r
    where r.organization_id=new.organization_id and r.store_id=new.store_id and r.product_id=v_order_item.product_id
      and r.effective_at<=v_effective_at and r.created_at<=v_effective_at
    order by r.effective_at desc,r.version desc limit 1;
    if v_recipe.id is null then
      v_missing_products:=v_missing_products+1;
      insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
      values(new.organization_id,new.store_id,'inventory.recipe_missing','order_item',v_order_item.id,
        jsonb_build_object('order_id',new.id,'target_type','product','product_id',v_order_item.product_id,'product_name',v_order_item.product_name_snapshot),
        'pending',0,now(),null);
    else
      for v_ingredient in select ri.inventory_item_id,ri.quantity from public.recipe_items ri where ri.recipe_id=v_recipe.id loop
        select * into v_config from public.inventory_item_stores cfg
        where cfg.organization_id=new.organization_id and cfg.store_id=new.store_id and cfg.inventory_item_id=v_ingredient.inventory_item_id;
        perform private.inventory_insert_movement(
          new.organization_id,new.store_id,v_ingredient.inventory_item_id,'sale',-(v_ingredient.quantity*v_order_item.quantity),
          coalesce(v_config.average_cost_micros_per_base_unit,0),
          'order:'||new.id::text||':item:'||v_order_item.id::text||':recipe:'||v_recipe.id::text||':inventory:'||v_ingredient.inventory_item_id::text,
          'order_item',v_order_item.id,new.id,null,'Baixa automática por pedido concluído',null,
          jsonb_build_object('recipe_id',v_recipe.id,'recipe_version',v_recipe.version,'product_id',v_order_item.product_id,'order_item_quantity',v_order_item.quantity)
        );
        v_consumed:=v_consumed+1;
      end loop;
    end if;
  end loop;

  for v_modifier in
    select oim.id,oim.modifier_id,oim.modifier_name_snapshot,oi.id as order_item_id,oi.quantity as order_item_quantity
    from public.order_item_modifiers oim join public.order_items oi on oi.id=oim.order_item_id
    where oi.order_id=new.id and oim.modifier_id is not null
  loop
    v_recipe:=null;
    select * into v_recipe from public.recipes r
    where r.organization_id=new.organization_id and r.store_id=new.store_id and r.modifier_id=v_modifier.modifier_id
      and r.effective_at<=v_effective_at and r.created_at<=v_effective_at
    order by r.effective_at desc,r.version desc limit 1;
    if v_recipe.id is null then
      v_missing_modifiers:=v_missing_modifiers+1;
      insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
      values(new.organization_id,new.store_id,'inventory.recipe_missing','order_item_modifier',v_modifier.id,
        jsonb_build_object('order_id',new.id,'target_type','modifier','modifier_id',v_modifier.modifier_id,'modifier_name',v_modifier.modifier_name_snapshot),
        'pending',0,now(),null);
      continue;
    end if;
    for v_ingredient in select ri.inventory_item_id,ri.quantity from public.recipe_items ri where ri.recipe_id=v_recipe.id loop
      select * into v_config from public.inventory_item_stores cfg
      where cfg.organization_id=new.organization_id and cfg.store_id=new.store_id and cfg.inventory_item_id=v_ingredient.inventory_item_id;
      perform private.inventory_insert_movement(
        new.organization_id,new.store_id,v_ingredient.inventory_item_id,'sale',-(v_ingredient.quantity*v_modifier.order_item_quantity),
        coalesce(v_config.average_cost_micros_per_base_unit,0),
        'order:'||new.id::text||':modifier:'||v_modifier.id::text||':recipe:'||v_recipe.id::text||':inventory:'||v_ingredient.inventory_item_id::text,
        'order_item_modifier',v_modifier.id,new.id,null,'Baixa automática por adicional concluído',null,
        jsonb_build_object('recipe_id',v_recipe.id,'recipe_version',v_recipe.version,'modifier_id',v_modifier.modifier_id,'order_item_id',v_modifier.order_item_id,'order_item_quantity',v_modifier.order_item_quantity)
      );
      v_consumed:=v_consumed+1;
    end loop;
  end loop;

  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(new.organization_id,new.store_id,'inventory.order_consumed','order',new.id,
    jsonb_build_object('movement_count',v_consumed,'missing_product_recipes',v_missing_products,'missing_modifier_recipes',v_missing_modifiers,'recipe_effective_at',v_effective_at),
    'pending',0,now(),null);
  return new;
end; $$;
revoke all on function private.consume_order_inventory() from public,anon,authenticated;
