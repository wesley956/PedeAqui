-- PedeAqui — Salão: preço autoritativo e ciclo de mesa/comanda.

create or replace function private.dining_price_items(p_store_id uuid, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_store public.stores%rowtype; v_item jsonb; v_product public.products%rowtype; v_group public.modifier_groups%rowtype;
  v_modifier_ids jsonb; v_requested integer; v_distinct integer; v_valid integer; v_selected integer; v_modifier_total integer;
  v_modifiers jsonb; v_snapshot jsonb := '[]'::jsonb; v_quantity integer; v_note text; v_base integer; v_unit integer; v_line bigint; v_total bigint := 0;
begin
  select * into v_store from public.stores where id=p_store_id and status='active'; if v_store.id is null then raise exception 'store unavailable'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb)) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'dining round is empty'; end if;
  if jsonb_array_length(p_items)>100 then raise exception 'too many dining items'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'invalid dining item'; end if;
    v_quantity:=coalesce((v_item->>'quantity')::integer,0); if v_quantity<1 or v_quantity>999 then raise exception 'invalid item quantity'; end if;
    v_note:=nullif(left(trim(coalesce(v_item->>'note','')),500),'');
    select p.* into v_product from public.products p where p.id=(v_item->>'product_id')::uuid and p.organization_id=v_store.organization_id and p.store_id=v_store.id and p.active and p.availability='available' and p.deleted_at is null and (p.category_id is null or exists(select 1 from public.categories c where c.id=p.category_id and c.organization_id=p.organization_id and c.store_id=p.store_id and c.active and c.deleted_at is null));
    if v_product.id is null then raise exception 'product unavailable'; end if;
    v_modifier_ids:=coalesce(v_item->'modifier_ids','[]'::jsonb); if jsonb_typeof(v_modifier_ids)<>'array' then raise exception 'invalid modifiers'; end if;
    select count(*)::integer,count(distinct value)::integer into v_requested,v_distinct from jsonb_array_elements_text(v_modifier_ids);
    if v_requested<>v_distinct then raise exception 'duplicate modifier'; end if; if v_requested>40 then raise exception 'too many modifiers'; end if;
    for v_group in select mg.* from public.product_modifier_groups pmg join public.modifier_groups mg on mg.organization_id=pmg.organization_id and mg.store_id=pmg.store_id and mg.id=pmg.modifier_group_id where pmg.organization_id=v_store.organization_id and pmg.store_id=v_store.id and pmg.product_id=v_product.id and mg.active and mg.deleted_at is null order by pmg.sort_order,mg.sort_order,mg.id loop
      select count(*)::integer into v_selected from jsonb_array_elements_text(v_modifier_ids) x join public.modifiers m on m.id=x.value::uuid where m.organization_id=v_store.organization_id and m.store_id=v_store.id and m.modifier_group_id=v_group.id and m.active and m.deleted_at is null;
      if v_selected<v_group.min_selection or v_selected>v_group.max_selection then raise exception 'modifier group selection invalid: %',v_group.name; end if;
    end loop;
    select count(*)::integer,coalesce(sum(m.price_cents),0)::integer,coalesce(jsonb_agg(jsonb_build_object('modifier_group_id',mg.id,'modifier_id',m.id,'group_name',mg.name,'modifier_name',m.name,'unit_price_cents',m.price_cents) order by mg.sort_order,m.sort_order,m.id),'[]'::jsonb)
      into v_valid,v_modifier_total,v_modifiers
    from jsonb_array_elements_text(v_modifier_ids) x
    join public.modifiers m on m.id=x.value::uuid and m.organization_id=v_store.organization_id and m.store_id=v_store.id and m.active and m.deleted_at is null
    join public.modifier_groups mg on mg.id=m.modifier_group_id and mg.organization_id=m.organization_id and mg.store_id=m.store_id and mg.active and mg.deleted_at is null
    join public.product_modifier_groups pmg on pmg.organization_id=m.organization_id and pmg.store_id=m.store_id and pmg.product_id=v_product.id and pmg.modifier_group_id=mg.id;
    if v_valid<>v_requested then raise exception 'modifier unavailable for product'; end if;
    v_base:=coalesce(v_product.promotional_price_cents,v_product.price_cents); v_unit:=v_base+v_modifier_total; v_line:=v_unit::bigint*v_quantity; v_total:=v_total+v_line;
    if v_total<0 or v_total>9000000000000 then raise exception 'unsafe dining total'; end if;
    v_snapshot:=v_snapshot||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'image_url',v_product.image_url,'quantity',v_quantity,'note',v_note,'unit_base_price_cents',v_base,'unit_modifiers_price_cents',v_modifier_total,'unit_total_price_cents',v_unit,'line_total_cents',v_line,'modifiers',v_modifiers));
  end loop;
  return jsonb_build_object('subtotal_cents',v_total,'items',v_snapshot);
end; $$;
revoke all on function private.dining_price_items(uuid,jsonb) from public, anon, authenticated;

create or replace function public.dining_open_tab_internal(p_table_id uuid,p_guest_count integer default 1,p_label text default null,p_actor_user_id uuid default null)
returns public.tabs language plpgsql security invoker set search_path='' as $$
declare v_table public.tables%rowtype; v_existing public.tabs%rowtype; v_number bigint; v_tab public.tabs%rowtype;
begin
  if p_guest_count<1 or p_guest_count>100 then raise exception 'invalid guest count'; end if;
  select * into v_table from public.tables where id=p_table_id for update; if v_table.id is null then raise exception 'table not found'; end if;
  if v_table.status in ('disabled','cleaning') then raise exception 'table unavailable'; end if;
  select * into v_existing from public.tabs where table_id=v_table.id and status in ('open','settling') order by opened_at desc limit 1; if v_existing.id is not null then return v_existing; end if;
  insert into public.tab_sequences(organization_id,store_id,last_number,updated_at) values(v_table.organization_id,v_table.store_id,1,now()) on conflict(store_id) do update set last_number=public.tab_sequences.last_number+1,updated_at=now() returning last_number into v_number;
  insert into public.tabs(organization_id,store_id,table_id,display_number,guest_count,label,opened_by) values(v_table.organization_id,v_table.store_id,v_table.id,v_number,p_guest_count,nullif(trim(coalesce(p_label,'')),''),p_actor_user_id) returning * into v_tab;
  update public.tables set status='occupied',opened_at=coalesce(opened_at,now()),updated_by=p_actor_user_id,updated_at=now() where id=v_table.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data) values(v_table.organization_id,v_table.store_id,p_actor_user_id,'dining.tab_opened','tab',v_tab.id,jsonb_build_object('table_id',v_table.id,'display_number',v_tab.display_number,'guest_count',v_tab.guest_count));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,created_by) values(v_table.organization_id,v_table.store_id,'dining.tab_opened','tab',v_tab.id,jsonb_build_object('table_id',v_table.id,'display_number',v_tab.display_number),p_actor_user_id);
  return v_tab;
end; $$;
revoke all on function public.dining_open_tab_internal(uuid,integer,text,uuid) from public,anon,authenticated; grant execute on function public.dining_open_tab_internal(uuid,integer,text,uuid) to service_role;

create or replace function public.dining_transfer_tab_internal(p_tab_id uuid,p_target_table_id uuid,p_actor_user_id uuid default null)
returns public.tabs language plpgsql security invoker set search_path='' as $$
declare v_tab public.tabs%rowtype; v_source public.tables%rowtype; v_target public.tables%rowtype; v_result public.tabs%rowtype;
begin
  select * into v_tab from public.tabs where id=p_tab_id for update; if v_tab.id is null or v_tab.status not in ('open','settling') then raise exception 'tab is not active'; end if; if v_tab.table_id=p_target_table_id then return v_tab; end if;
  select * into v_source from public.tables where id=v_tab.table_id for update; select * into v_target from public.tables where id=p_target_table_id for update;
  if v_target.id is null or v_target.organization_id<>v_tab.organization_id or v_target.store_id<>v_tab.store_id then raise exception 'target table unavailable'; end if;
  if v_target.status not in ('available','reserved') or exists(select 1 from public.tabs where table_id=v_target.id and status in ('open','settling')) then raise exception 'target table is not available'; end if;
  update public.tabs set table_id=v_target.id,version=version+1,updated_at=now() where id=v_tab.id returning * into v_result;
  update public.tables set status='available',opened_at=null,updated_by=p_actor_user_id,updated_at=now() where id=v_source.id;
  update public.tables set status='occupied',opened_at=coalesce(v_target.opened_at,now()),updated_by=p_actor_user_id,updated_at=now() where id=v_target.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(v_tab.organization_id,v_tab.store_id,p_actor_user_id,'dining.tab_transferred','tab',v_tab.id,jsonb_build_object('table_id',v_source.id),jsonb_build_object('table_id',v_target.id));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,created_by) values(v_tab.organization_id,v_tab.store_id,'dining.tab_transferred','tab',v_tab.id,jsonb_build_object('from_table_id',v_source.id,'to_table_id',v_target.id),p_actor_user_id);
  return v_result;
end; $$;
revoke all on function public.dining_transfer_tab_internal(uuid,uuid,uuid) from public,anon,authenticated; grant execute on function public.dining_transfer_tab_internal(uuid,uuid,uuid) to service_role;

create or replace function public.dining_set_tab_status_internal(p_tab_id uuid,p_status text,p_reason text default null,p_actor_user_id uuid default null)
returns public.tabs language plpgsql security invoker set search_path='' as $$
declare v_tab public.tabs%rowtype; v_result public.tabs%rowtype; v_due bigint;
begin
  if p_status not in ('settling','closed','canceled') then raise exception 'invalid tab status'; end if;
  select * into v_tab from public.tabs where id=p_tab_id for update; if v_tab.id is null then raise exception 'tab not found'; end if; if v_tab.status in ('closed','canceled') then return v_tab; end if;
  if p_status='settling' then
    if v_tab.status<>'open' then raise exception 'tab cannot enter settling'; end if; update public.tabs set status='settling',settling_at=now(),version=version+1,updated_at=now() where id=v_tab.id returning * into v_result;
  elsif p_status='canceled' then
    if exists(select 1 from public.orders where tab_id=v_tab.id and order_status not in ('canceled','rejected')) then raise exception 'non-empty tab cannot be canceled'; end if;
    if coalesce(length(trim(p_reason)),0)<3 then raise exception 'cancel reason required'; end if;
    update public.tabs set status='canceled',canceled_at=now(),canceled_by=p_actor_user_id,cancel_reason=trim(p_reason),version=version+1,updated_at=now() where id=v_tab.id returning * into v_result;
    update public.tables set status='available',opened_at=null,updated_by=p_actor_user_id,updated_at=now() where id=v_tab.table_id;
  else
    if v_tab.status<>'settling' then raise exception 'tab must be settling before close'; end if;
    select coalesce(sum(o.total_cents-coalesce((select sum(p.amount_cents) from public.payments p where p.order_id=o.id and p.status='paid'),0)),0)::bigint into v_due from public.orders o where o.tab_id=v_tab.id and o.order_status not in ('canceled','rejected');
    if v_due<>0 then raise exception 'tab still has outstanding balance'; end if;
    if exists(select 1 from public.orders o where o.tab_id=v_tab.id and o.order_status not in ('canceled','rejected','completed') and (o.production_status not in ('ready','not_required') or o.payment_status<>'paid')) then raise exception 'tab has unfinished orders'; end if;
    perform public.order_transition_internal(o.id,'fulfillment','served',null,p_actor_user_id,'panel') from public.orders o where o.tab_id=v_tab.id and o.order_status='confirmed' and o.fulfillment_status='pending' and o.production_status in ('ready','not_required');
    perform public.order_transition_internal(o.id,'order','completed',null,p_actor_user_id,'panel') from public.orders o where o.tab_id=v_tab.id and o.order_status='confirmed' and o.payment_status='paid' and o.fulfillment_status='served';
    update public.tabs set status='closed',closed_at=now(),closed_by=p_actor_user_id,version=version+1,updated_at=now() where id=v_tab.id returning * into v_result;
    update public.tables set status='cleaning',opened_at=null,updated_by=p_actor_user_id,updated_at=now() where id=v_tab.table_id;
  end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(v_tab.organization_id,v_tab.store_id,p_actor_user_id,'dining.tab_status_changed','tab',v_tab.id,jsonb_build_object('status',v_tab.status),jsonb_build_object('status',v_result.status,'reason',nullif(trim(coalesce(p_reason,'')),'')));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,created_by) values(v_tab.organization_id,v_tab.store_id,'dining.tab_'||v_result.status,'tab',v_tab.id,jsonb_build_object('table_id',v_tab.table_id,'display_number',v_tab.display_number),p_actor_user_id);
  return v_result;
end; $$;
revoke all on function public.dining_set_tab_status_internal(uuid,text,text,uuid) from public,anon,authenticated; grant execute on function public.dining_set_tab_status_internal(uuid,text,text,uuid) to service_role;

create or replace function public.dining_set_table_status_internal(p_table_id uuid,p_status text,p_actor_user_id uuid default null)
returns public.tables language plpgsql security invoker set search_path='' as $$
declare v_table public.tables%rowtype; v_result public.tables%rowtype;
begin
  if p_status not in ('available','reserved','cleaning','disabled') then raise exception 'invalid manual table status'; end if; select * into v_table from public.tables where id=p_table_id for update; if v_table.id is null then raise exception 'table not found'; end if;
  if exists(select 1 from public.tabs where table_id=v_table.id and status in ('open','settling')) then raise exception 'active tab controls table occupancy'; end if;
  update public.tables set status=p_status,opened_at=case when p_status='available' then null else opened_at end,updated_by=p_actor_user_id,updated_at=now() where id=v_table.id returning * into v_result;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(v_table.organization_id,v_table.store_id,p_actor_user_id,'dining.table_status_changed','table',v_table.id,jsonb_build_object('status',v_table.status),jsonb_build_object('status',v_result.status)); return v_result;
end; $$;
revoke all on function public.dining_set_table_status_internal(uuid,text,uuid) from public,anon,authenticated; grant execute on function public.dining_set_table_status_internal(uuid,text,uuid) to service_role;

create or replace function public.dining_rotate_table_code_internal(p_table_id uuid,p_actor_user_id uuid default null)
returns text language plpgsql security invoker set search_path='' as $$
declare v_table public.tables%rowtype; v_code text;
begin select * into v_table from public.tables where id=p_table_id for update; if v_table.id is null then raise exception 'table not found'; end if; v_code:=encode(gen_random_bytes(15),'hex'); update public.tables set public_code=v_code,updated_by=p_actor_user_id,updated_at=now() where id=v_table.id; insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data) values(v_table.organization_id,v_table.store_id,p_actor_user_id,'dining.table_qr_rotated','table',v_table.id,jsonb_build_object('qr_enabled',v_table.qr_enabled)); return v_code; end; $$;
revoke all on function public.dining_rotate_table_code_internal(uuid,uuid) from public,anon,authenticated; grant execute on function public.dining_rotate_table_code_internal(uuid,uuid) to service_role;

create or replace function public.dining_add_member_internal(p_tab_id uuid,p_name text,p_customer_id uuid default null,p_seat_number integer default null,p_actor_user_id uuid default null)
returns public.tab_members language plpgsql security invoker set search_path='' as $$
declare v_tab public.tabs%rowtype; v_member public.tab_members%rowtype;
begin
  if char_length(trim(coalesce(p_name,'')))<1 or char_length(trim(p_name))>120 then raise exception 'invalid member name'; end if; if p_seat_number is not null and (p_seat_number<1 or p_seat_number>100) then raise exception 'invalid seat number'; end if;
  select * into v_tab from public.tabs where id=p_tab_id for update; if v_tab.id is null or v_tab.status not in ('open','settling') then raise exception 'tab unavailable'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers c where c.id=p_customer_id and c.organization_id=v_tab.organization_id and c.deleted_at is null) then raise exception 'customer unavailable'; end if;
  insert into public.tab_members(organization_id,store_id,tab_id,customer_id,name,seat_number,created_by) values(v_tab.organization_id,v_tab.store_id,v_tab.id,p_customer_id,trim(p_name),p_seat_number,p_actor_user_id) returning * into v_member;
  update public.tabs set guest_count=greatest(guest_count,(select count(*) from public.tab_members where tab_id=v_tab.id)),version=version+1,updated_at=now() where id=v_tab.id; return v_member;
end; $$;
revoke all on function public.dining_add_member_internal(uuid,text,uuid,integer,uuid) from public,anon,authenticated; grant execute on function public.dining_add_member_internal(uuid,text,uuid,integer,uuid) to service_role;

create or replace function public.dining_allocate_item_internal(p_order_item_id uuid,p_tab_member_id uuid,p_quantity integer,p_actor_user_id uuid default null)
returns public.tab_item_allocations language plpgsql security invoker set search_path='' as $$
declare v_item public.order_items%rowtype; v_order public.orders%rowtype; v_member public.tab_members%rowtype; v_result public.tab_item_allocations%rowtype;
begin
  if p_quantity<1 then raise exception 'invalid allocation quantity'; end if; select * into v_item from public.order_items where id=p_order_item_id for update; if v_item.id is null then raise exception 'order item not found'; end if;
  select * into v_order from public.orders where id=v_item.order_id; if v_order.tab_id is null then raise exception 'order is not part of a tab'; end if; select * into v_member from public.tab_members where id=p_tab_member_id; if v_member.id is null or v_member.tab_id<>v_order.tab_id then raise exception 'member unavailable'; end if;
  insert into public.tab_item_allocations(organization_id,store_id,tab_id,order_item_id,tab_member_id,quantity,created_by) values(v_order.organization_id,v_order.store_id,v_order.tab_id,v_item.id,v_member.id,p_quantity,p_actor_user_id) on conflict(order_item_id,tab_member_id) do update set quantity=excluded.quantity,updated_at=now() returning * into v_result; return v_result;
end; $$;
revoke all on function public.dining_allocate_item_internal(uuid,uuid,integer,uuid) from public,anon,authenticated; grant execute on function public.dining_allocate_item_internal(uuid,uuid,integer,uuid) to service_role;
