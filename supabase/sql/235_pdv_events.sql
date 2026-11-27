-- Optional, tenant-scoped event stock. Existing POS RPC and store settings stay authoritative.
create table public.pdv_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  store_id uuid not null references public.stores(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','active','closed','canceled')),
  close_store boolean not null default false,
  closure_reason text,
  closure_starts_at timestamptz,
  closure_ends_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,store_id,id),
  foreign key (organization_id,store_id) references public.stores(organization_id,id),
  check (ends_at > starts_at),
  check (not close_store or (closure_reason is not null and char_length(trim(closure_reason)) between 3 and 300 and closure_starts_at is not null and closure_ends_at is not null and closure_ends_at > closure_starts_at and closure_starts_at >= starts_at and closure_ends_at <= ends_at))
);
create index pdv_events_scope_created on public.pdv_events(organization_id,store_id,created_at desc);
create index pdv_events_closure on public.pdv_events(store_id,organization_id,closure_starts_at,closure_ends_at) where status='active' and close_store;
create table public.pdv_event_items (
  organization_id uuid not null,
  store_id uuid not null,
  event_id uuid not null,
  product_id uuid not null references public.products(id),
  allocated integer not null check (allocated between 1 and 1000000),
  sold integer not null default 0 check (sold >= 0 and sold <= allocated),
  primary key (event_id,product_id),
  foreign key (organization_id,store_id,product_id) references public.products(organization_id,store_id,id),
  foreign key (organization_id,store_id,event_id) references public.pdv_events(organization_id,store_id,id)
);
create index pdv_event_items_scope on public.pdv_event_items(organization_id,store_id);
create table public.pdv_event_operations (
  organization_id uuid not null,
  store_id uuid not null,
  event_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  action text not null,
  payload jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id,store_id,idempotency_key),
  foreign key (organization_id,store_id,event_id) references public.pdv_events(organization_id,store_id,id)
);
create index pdv_event_operations_event on public.pdv_event_operations(event_id);
create table public.pdv_event_orders (
  order_id uuid primary key references public.orders(id),
  organization_id uuid not null,
  store_id uuid not null,
  event_id uuid not null,
  idempotency_key text not null,
  quantities jsonb not null,
  response jsonb not null,
  request_payload jsonb not null,
  restored boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id,store_id,idempotency_key),
  foreign key (organization_id,store_id,order_id) references public.orders(organization_id,store_id,id),
  foreign key (organization_id,store_id,event_id) references public.pdv_events(organization_id,store_id,id)
);
create index pdv_event_orders_report on public.pdv_event_orders(organization_id,store_id,event_id);

alter table public.pdv_events enable row level security;
alter table public.pdv_event_items enable row level security;
alter table public.pdv_event_operations enable row level security;
alter table public.pdv_event_orders enable row level security;
revoke all on public.pdv_events,public.pdv_event_items,public.pdv_event_operations,public.pdv_event_orders from public,anon,authenticated;
grant select,insert,update,delete on public.pdv_events,public.pdv_event_items,public.pdv_event_operations,public.pdv_event_orders to service_role;

create function public.pdv_event_manage_internal(p_organization_id uuid,p_store_id uuid,p_event_id uuid,p_action text,p_data jsonb,p_idempotency_key text,p_actor_user_id uuid)
returns uuid language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
  v_event public.pdv_events%rowtype;
  v_operation public.pdv_event_operations%rowtype;
  v_created boolean := false;
  v_count integer;
  v_item record;
begin
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then raise exception 'invalid event operation key'; end if;
  if not exists(select 1 from public.stores where id=p_store_id and organization_id=p_organization_id and status='active') then raise exception 'event store unavailable'; end if;
  if p_action not in ('create','activate','restock','close','cancel') then raise exception 'invalid event action'; end if;
  if p_action='create' then
    insert into public.pdv_events(id,organization_id,store_id,name,starts_at,ends_at,close_store,closure_reason,closure_starts_at,closure_ends_at,created_by)
    values(p_event_id,p_organization_id,p_store_id,p_data->>'name',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,
      coalesce((p_data->>'close_store')::boolean,false),nullif(trim(p_data->>'closure_reason'),''),nullif(p_data->>'closure_starts_at','')::timestamptz,nullif(p_data->>'closure_ends_at','')::timestamptz,p_actor_user_id)
    on conflict(id) do nothing;
    get diagnostics v_count=row_count;
    v_created:=v_count=1;
  end if;
  select * into v_event from public.pdv_events where organization_id=p_organization_id and store_id=p_store_id and id=p_event_id for update;
  if v_event.id is null then raise exception 'event unavailable'; end if;
  insert into public.pdv_event_operations(organization_id,store_id,event_id,idempotency_key,action,payload,created_by)
  values(p_organization_id,p_store_id,p_event_id,trim(p_idempotency_key),p_action,p_data,p_actor_user_id) on conflict do nothing;
  get diagnostics v_count=row_count;
  if v_count=0 then
    select * into v_operation from public.pdv_event_operations where organization_id=p_organization_id and store_id=p_store_id and idempotency_key=trim(p_idempotency_key);
    if v_operation.event_id is distinct from p_event_id or v_operation.action is distinct from p_action or v_operation.payload is distinct from p_data then raise exception 'event operation differs from completed request'; end if;
    return p_event_id;
  end if;
  if p_action='create' and not v_created then raise exception 'event already exists'; end if;
  if p_action in ('create','restock') then
    if v_event.status not in ('draft','active') or (p_action='restock' and v_event.ends_at<=now()) then raise exception 'event is finished'; end if;
    if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'invalid event items'; end if;
    if exists(select 1 from jsonb_array_elements(p_data->'items') x group by x->>'product_id' having count(*)>1) then raise exception 'duplicate event product'; end if;
    for v_item in select (x->>'product_id')::uuid product_id,(x->>'quantity')::integer quantity from jsonb_array_elements(p_data->'items') x order by 1 loop
      if v_item.quantity is null or v_item.quantity not between 1 and 1000000 then raise exception 'invalid event quantity'; end if;
      if not exists(select 1 from public.products where id=v_item.product_id and organization_id=p_organization_id and store_id=p_store_id and active and deleted_at is null) then raise exception 'event product unavailable'; end if;
      insert into public.pdv_event_items(organization_id,store_id,event_id,product_id,allocated)
      values(p_organization_id,p_store_id,p_event_id,v_item.product_id,v_item.quantity)
      on conflict(event_id,product_id) do update set allocated=public.pdv_event_items.allocated+excluded.allocated;
    end loop;
  elsif p_action='activate' then
    if v_event.status<>'draft' or v_event.ends_at<=now() then raise exception 'event cannot be activated'; end if;
    if not exists(select 1 from public.pdv_event_items where event_id=p_event_id) then raise exception 'event has no products'; end if;
    update public.pdv_events set status='active',updated_at=now() where id=p_event_id;
  elsif p_action in ('close','cancel') then
    if v_event.status not in ('draft','active') then raise exception 'event is finished'; end if;
    update public.pdv_events set status=case p_action when 'close' then 'closed' else 'canceled' end,updated_at=now() where id=p_event_id;
  end if;
  return p_event_id;
end $$;
revoke all on function public.pdv_event_manage_internal(uuid,uuid,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.pdv_event_manage_internal(uuid,uuid,uuid,text,jsonb,text,uuid) to service_role;

create function public.pdv_event_sale_internal(p_organization_id uuid,p_store_id uuid,p_event_id uuid,p_items jsonb,p_payments jsonb,p_customer jsonb,p_growth jsonb,p_idempotency_key text,p_actor_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare v_event public.pdv_events%rowtype; v_previous public.pdv_event_orders%rowtype; v_quantities jsonb; v_item record; v_response jsonb; v_count integer;
begin
  select * into v_event from public.pdv_events where id=p_event_id and organization_id=p_organization_id and store_id=p_store_id for update;
  if v_event.id is null then raise exception 'event unavailable'; end if;
  select * into v_previous from public.pdv_event_orders where organization_id=p_organization_id and store_id=p_store_id and idempotency_key=p_idempotency_key;
  if v_previous.order_id is not null then
    if v_previous.request_payload is distinct from jsonb_build_object('items',p_items,'payments',p_payments,'customer',p_customer,'growth',p_growth) then raise exception 'event sale key payload mismatch'; end if;
    if v_previous.event_id<>p_event_id then raise exception 'event sale key mismatch'; end if;
    return v_previous.response || jsonb_build_object('created',false);
  end if;
  if v_event.status<>'active' or now()<v_event.starts_at or now()>=v_event.ends_at then raise exception 'event not open for sales'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'invalid event sale items'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where (x->>'quantity')::integer is null or (x->>'quantity')::integer not between 1 and 999) then raise exception 'invalid event sale quantity'; end if;
  select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity) order by product_id) into v_quantities
  from (select (x->>'product_id')::uuid product_id,sum((x->>'quantity')::integer)::integer quantity from jsonb_array_elements(p_items) x group by 1) q;
  for v_item in select (x->>'product_id')::uuid product_id,(x->>'quantity')::integer quantity from jsonb_array_elements(v_quantities) x loop
    update public.pdv_event_items set sold=sold+v_item.quantity where event_id=p_event_id and product_id=v_item.product_id and allocated-sold>=v_item.quantity;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception 'event stock insufficient'; end if;
  end loop;
  -- Reuse exactly one normal order/payment transaction. No second financial ledger.
  v_response:=public.pdv_create_order_growth_internal(p_store_id,p_items,p_payments,p_customer,p_growth,p_idempotency_key,p_actor_user_id);
  if not coalesce((v_response->>'created')::boolean,false) then raise exception 'event sale key belongs to another sale'; end if;
  insert into public.pdv_event_orders(order_id,organization_id,store_id,event_id,idempotency_key,quantities,response,request_payload)
  values((v_response->>'order_id')::uuid,p_organization_id,p_store_id,p_event_id,p_idempotency_key,v_quantities,v_response,jsonb_build_object('items',p_items,'payments',p_payments,'customer',p_customer,'growth',p_growth));
  return v_response;
end $$;
revoke all on function public.pdv_event_sale_internal(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.pdv_event_sale_internal(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid) to service_role;

create function private.pdv_event_restore_canceled_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare v_sale public.pdv_event_orders%rowtype; v_item record;
begin
  if new.order_status not in ('canceled','rejected') or old.order_status in ('canceled','rejected') then return new; end if;
  select * into v_sale from public.pdv_event_orders where order_id=new.id and organization_id=new.organization_id and store_id=new.store_id;
  if v_sale.order_id is null then return new; end if;
  perform 1 from public.pdv_events where id=v_sale.event_id for update;
  update public.pdv_event_orders set restored=true where order_id=new.id and not restored;
  if not found then return new; end if;
  for v_item in select (x->>'product_id')::uuid product_id,(x->>'quantity')::integer quantity from jsonb_array_elements(v_sale.quantities) x loop
    update public.pdv_event_items set sold=sold-v_item.quantity where event_id=v_sale.event_id and product_id=v_item.product_id;
  end loop;
  return new;
end $$;
revoke all on function private.pdv_event_restore_canceled_stock() from public,anon,authenticated;
create trigger pdv_event_restore_canceled_stock after update of order_status on public.orders for each row
when (old.order_status is distinct from new.order_status) execute function private.pdv_event_restore_canceled_stock();

-- A stale tab/API cannot bypass a temporary closure. Updates/payments of existing orders stay available.
create function private.pdv_event_guard_online_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.channel in ('digital_menu','whatsapp') and exists(
    select 1 from public.pdv_events where organization_id=new.organization_id and store_id=new.store_id and status='active' and close_store
      and closure_starts_at<=now() and closure_ends_at>now()
  ) then raise exception 'store temporarily closed for event'; end if;
  return new;
end $$;
revoke all on function private.pdv_event_guard_online_order() from public,anon,authenticated;
create trigger pdv_event_guard_online_order before insert on public.orders for each row
when (new.channel in ('digital_menu','whatsapp')) execute function private.pdv_event_guard_online_order();

-- The existing consumption trigger is SECURITY INVOKER. This scoped private helper
-- lets authenticated completions keep working without granting access to event ledgers.
create function private.pdv_event_order_exists(p_organization_id uuid,p_store_id uuid,p_order_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (auth.uid() is null or private.can_access_store(p_organization_id,p_store_id)) and exists(
    select 1 from public.pdv_event_orders where organization_id=p_organization_id and store_id=p_store_id and order_id=p_order_id
  );
$$;
revoke all on function private.pdv_event_order_exists(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.pdv_event_order_exists(uuid,uuid,uuid) to authenticated,service_role;

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
  -- Finished event products were already allocated; preserve the historical recipe logic for regular orders.
  if private.pdv_event_order_exists(new.organization_id,new.store_id,new.id) then return new; end if;
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

-- Aggregate on the server: reports must not silently stop at PostgREST's row limit.
create function public.pdv_event_report_internal(p_organization_id uuid,p_store_id uuid,p_event_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('sales',count(*),'totalCents',coalesce(sum(o.total_cents),0),'discountCents',coalesce(sum(o.discount_cents),0))
  from public.pdv_event_orders e join public.orders o on o.id=e.order_id and o.organization_id=e.organization_id and o.store_id=e.store_id
  where e.organization_id=p_organization_id and e.store_id=p_store_id and e.event_id=p_event_id and not e.restored and o.order_status not in ('canceled','rejected');
$$;
revoke all on function public.pdv_event_report_internal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pdv_event_report_internal(uuid,uuid,uuid) to service_role;
