-- PedeAqui — Milestone 19 [190]–[193]
-- Fichas técnicas imutáveis/versionadas e consumo idempotente no order.completed.

create or replace function private.recipe_estimated_cost_cents(p_recipe_id uuid)
returns bigint
language sql stable security invoker set search_path='' as $$
  select coalesce(round(sum(ri.quantity * cfg.average_cost_micros_per_base_unit) / 1000000.0),0)::bigint
  from public.recipe_items ri
  join public.inventory_item_stores cfg
    on cfg.organization_id=ri.organization_id and cfg.store_id=ri.store_id and cfg.inventory_item_id=ri.inventory_item_id
  where ri.recipe_id=p_recipe_id;
$$;
revoke all on function private.recipe_estimated_cost_cents(uuid) from public,anon,authenticated;
grant execute on function private.recipe_estimated_cost_cents(uuid) to service_role;

create or replace function public.recipe_create_version_internal(
  p_store_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_items jsonb,
  p_effective_at timestamptz default now(),
  p_notes text default null,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_store public.stores%rowtype;
  v_recipe public.recipes%rowtype;
  v_version integer;
  v_count integer;
  v_distinct integer;
  v_row record;
begin
  if p_actor_user_id is null then raise exception 'recipe actor is required'; end if;
  if p_target_type not in ('product','modifier') then raise exception 'invalid recipe target type'; end if;
  if p_target_id is null then raise exception 'recipe target is required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'recipe items are required'; end if;
  if p_effective_at is null then raise exception 'recipe effective timestamp is required'; end if;
  if p_notes is not null and char_length(p_notes)>1000 then raise exception 'recipe notes too long'; end if;

  select * into v_store from public.stores where id=p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;
  if p_target_type='product' then
    if not exists(select 1 from public.products where id=p_target_id and organization_id=v_store.organization_id and store_id=v_store.id and deleted_at is null) then raise exception 'recipe product not found in store'; end if;
  else
    if not exists(select 1 from public.modifiers where id=p_target_id and organization_id=v_store.organization_id and store_id=v_store.id and deleted_at is null) then raise exception 'recipe modifier not found in store'; end if;
  end if;

  -- Serializa criação de versões do mesmo alvo sem depender do frontend.
  perform pg_advisory_xact_lock(hashtext('recipe:'||v_store.organization_id::text||':'||v_store.id::text||':'||p_target_type||':'||p_target_id::text));

  select count(*),count(distinct x.inventory_item_id) into v_count,v_distinct
  from jsonb_to_recordset(p_items) as x(inventory_item_id uuid,quantity numeric);
  if v_count<>v_distinct then raise exception 'recipe contains duplicate inventory item'; end if;

  for v_row in select * from jsonb_to_recordset(p_items) as x(inventory_item_id uuid,quantity numeric) loop
    if v_row.inventory_item_id is null or v_row.quantity is null or v_row.quantity<=0 or v_row.quantity>999999999999::numeric then raise exception 'invalid recipe item quantity'; end if;
    if not exists(select 1 from public.inventory_item_stores cfg where cfg.organization_id=v_store.organization_id and cfg.store_id=v_store.id and cfg.inventory_item_id=v_row.inventory_item_id and cfg.active=true) then raise exception 'recipe inventory item is not active in store'; end if;
  end loop;

  if p_target_type='product' then
    select coalesce(max(version),0)+1 into v_version from public.recipes where organization_id=v_store.organization_id and store_id=v_store.id and product_id=p_target_id;
    insert into public.recipes(organization_id,store_id,target_type,product_id,version,effective_at,notes,created_by)
    values(v_store.organization_id,v_store.id,'product',p_target_id,v_version,p_effective_at,nullif(trim(coalesce(p_notes,'')),''),p_actor_user_id)
    returning * into v_recipe;
  else
    select coalesce(max(version),0)+1 into v_version from public.recipes where organization_id=v_store.organization_id and store_id=v_store.id and modifier_id=p_target_id;
    insert into public.recipes(organization_id,store_id,target_type,modifier_id,version,effective_at,notes,created_by)
    values(v_store.organization_id,v_store.id,'modifier',p_target_id,v_version,p_effective_at,nullif(trim(coalesce(p_notes,'')),''),p_actor_user_id)
    returning * into v_recipe;
  end if;

  insert into public.recipe_items(organization_id,store_id,recipe_id,inventory_item_id,quantity)
  select v_store.organization_id,v_store.id,v_recipe.id,x.inventory_item_id,round(x.quantity,6)
  from jsonb_to_recordset(p_items) as x(inventory_item_id uuid,quantity numeric);

  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_store.organization_id,v_store.id,p_actor_user_id,'recipe.version_created','recipe',v_recipe.id,
    jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,'version',v_version,'effective_at',p_effective_at,'items',p_items));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_store.organization_id,v_store.id,'recipe.version_created','recipe',v_recipe.id,
    jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,'version',v_version),'pending',0,now(),p_actor_user_id);

  return jsonb_build_object('recipe_id',v_recipe.id,'version',v_recipe.version,'estimated_cost_cents',private.recipe_estimated_cost_cents(v_recipe.id));
end; $$;
revoke all on function public.recipe_create_version_internal(uuid,text,uuid,jsonb,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.recipe_create_version_internal(uuid,text,uuid,jsonb,timestamptz,text,uuid) to service_role;

create or replace function private.consume_order_inventory()
returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  v_effective_at timestamptz;
  v_order_item record;
  v_modifier record;
  v_recipe public.recipes%rowtype;
  v_ingredient record;
  v_config public.inventory_item_stores%rowtype;
  v_consumed integer := 0;
  v_missing_products integer := 0;
begin
  v_effective_at := coalesce(new.confirmed_at,new.created_at);

  for v_order_item in
    select oi.id,oi.product_id,oi.product_name_snapshot,oi.quantity
    from public.order_items oi where oi.order_id=new.id
  loop
    if v_order_item.product_id is null then continue; end if;
    select * into v_recipe from public.recipes r
    where r.organization_id=new.organization_id and r.store_id=new.store_id and r.product_id=v_order_item.product_id
      and r.effective_at<=v_effective_at
    order by r.effective_at desc,r.version desc limit 1;
    if v_recipe.id is null then
      v_missing_products := v_missing_products+1;
      insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
      values(new.organization_id,new.store_id,'inventory.recipe_missing','order_item',v_order_item.id,
        jsonb_build_object('order_id',new.id,'product_id',v_order_item.product_id,'product_name',v_order_item.product_name_snapshot),'pending',0,now(),null);
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
        v_consumed := v_consumed+1;
      end loop;
    end if;
  end loop;

  for v_modifier in
    select oim.id,oim.modifier_id,oim.modifier_name_snapshot,oi.id as order_item_id,oi.quantity as order_item_quantity
    from public.order_item_modifiers oim
    join public.order_items oi on oi.id=oim.order_item_id
    where oi.order_id=new.id and oim.modifier_id is not null
  loop
    v_recipe := null;
    select * into v_recipe from public.recipes r
    where r.organization_id=new.organization_id and r.store_id=new.store_id and r.modifier_id=v_modifier.modifier_id
      and r.effective_at<=v_effective_at
    order by r.effective_at desc,r.version desc limit 1;
    if v_recipe.id is null then continue; end if;
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
      v_consumed := v_consumed+1;
    end loop;
  end loop;

  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(new.organization_id,new.store_id,'inventory.order_consumed','order',new.id,
    jsonb_build_object('movement_count',v_consumed,'missing_product_recipes',v_missing_products,'recipe_effective_at',v_effective_at),'pending',0,now(),null);
  return new;
end; $$;
revoke all on function private.consume_order_inventory() from public,anon,authenticated;

drop trigger if exists orders_inventory_after_completion on public.orders;
create trigger orders_inventory_after_completion
  after update of order_status on public.orders
  for each row when (new.order_status='completed' and old.order_status is distinct from 'completed')
  execute function private.consume_order_inventory();
