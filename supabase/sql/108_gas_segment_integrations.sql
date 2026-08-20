-- PedeAqui — integração Revenda de Gás [362]–[366]
-- Preserva snapshots no checkout e evolui o motor modular para o catálogo v2.

create or replace function public.create_order_from_checkout_internal(
  p_store_id uuid,p_token_hash text,p_order_access_token_hash text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_cart public.carts%rowtype; v_checkout public.checkout_sessions%rowtype; v_existing public.orders%rowtype;
  v_customer_id uuid; v_order_id uuid; v_order_item_id uuid; v_display_number bigint; v_cart_item public.cart_items%rowtype;
begin
  if p_order_access_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid order access token hash'; end if;
  select * into v_cart from public.carts where store_id=p_store_id and token_hash=p_token_hash for update;
  if v_cart.id is null then raise exception 'cart unavailable'; end if;
  select * into v_existing from public.orders where source_cart_id=v_cart.id;
  if v_existing.id is not null then return jsonb_build_object('order_id',v_existing.id,'display_number',v_existing.display_number,'created',false); end if;
  if v_cart.status<>'active' or v_cart.expires_at<=now() then raise exception 'cart unavailable'; end if;
  select * into v_checkout from public.checkout_sessions where organization_id=v_cart.organization_id and store_id=v_cart.store_id and cart_id=v_cart.id for update;
  if v_checkout.id is null or v_checkout.reviewed_at is null then raise exception 'checkout not reviewed'; end if;
  if v_cart.updated_at>v_checkout.reviewed_at then raise exception 'cart changed after review'; end if;
  if v_checkout.customer_name is null or v_checkout.customer_phone_normalized is null then raise exception 'checkout identity incomplete'; end if;
  if v_checkout.fulfillment_type is null then raise exception 'checkout fulfillment incomplete'; end if;
  if v_checkout.fulfillment_type='delivery' and v_checkout.delivery_quote_status<>'valid' then raise exception 'delivery not validated'; end if;
  if v_checkout.payment_method is null then raise exception 'checkout payment incomplete'; end if;
  if v_checkout.payment_method='cash' and v_checkout.cash_change_for_cents is not null and v_checkout.cash_change_for_cents<v_cart.total_cents then raise exception 'invalid cash change'; end if;
  if exists(select 1 from public.cart_items where cart_id=v_cart.id and validation_status<>'valid') then raise exception 'cart contains invalid items'; end if;
  if not exists(select 1 from public.cart_items where cart_id=v_cart.id) then raise exception 'cart is empty'; end if;

  v_customer_id:=v_checkout.customer_id;
  if v_customer_id is null then
    insert into public.customers(organization_id,name,phone,phone_normalized,email,created_at,updated_at)
    values(v_cart.organization_id,v_checkout.customer_name,v_checkout.customer_phone,v_checkout.customer_phone_normalized,v_checkout.customer_email,now(),now())
    on conflict(organization_id,phone_normalized) where phone_normalized is not null and deleted_at is null
    do update set phone=excluded.phone,email=coalesce(public.customers.email,excluded.email),updated_at=now() returning id into v_customer_id;
  end if;
  update public.checkout_sessions set customer_id=v_customer_id,updated_at=now() where id=v_checkout.id;
  update public.carts set customer_id=v_customer_id where id=v_cart.id;
  insert into public.order_sequences(organization_id,store_id,last_number,updated_at)
  values(v_cart.organization_id,v_cart.store_id,1,now())
  on conflict(store_id) do update set last_number=public.order_sequences.last_number+1,updated_at=now()
  returning last_number into v_display_number;

  insert into public.orders(
    organization_id,store_id,source_cart_id,checkout_session_id,public_access_token_hash,display_number,channel,fulfillment_type,
    order_status,payment_status,production_status,fulfillment_status,customer_id,customer_name_snapshot,customer_phone_snapshot,customer_email_snapshot,
    address_postal_code_snapshot,address_street_snapshot,address_number_snapshot,address_complement_snapshot,address_district_snapshot,address_city_snapshot,address_state_snapshot,address_reference_snapshot,
    subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method_snapshot,cash_change_for_cents,delivery_estimated_min_minutes,delivery_estimated_max_minutes
  ) values(
    v_cart.organization_id,v_cart.store_id,v_cart.id,v_checkout.id,p_order_access_token_hash,v_display_number,'digital_menu',v_checkout.fulfillment_type,
    'pending_confirmation','pending','pending_confirmation','pending',v_customer_id,v_checkout.customer_name,v_checkout.customer_phone,v_checkout.customer_email,
    v_checkout.address_postal_code,v_checkout.address_street,v_checkout.address_number,v_checkout.address_complement,v_checkout.address_district,v_checkout.address_city,v_checkout.address_state,v_checkout.address_reference,
    v_cart.subtotal_cents,v_cart.discount_cents,v_cart.delivery_fee_cents,v_cart.total_cents,v_checkout.payment_method,v_checkout.cash_change_for_cents,v_checkout.delivery_estimated_min_minutes,v_checkout.delivery_estimated_max_minutes
  ) returning id into v_order_id;

  for v_cart_item in select * from public.cart_items where cart_id=v_cart.id order by created_at,id loop
    insert into public.order_items(
      organization_id,store_id,order_id,product_id,product_name_snapshot,product_image_url_snapshot,quantity,note,
      unit_base_price_cents,unit_modifiers_price_cents,unit_segment_price_cents,unit_total_price_cents,line_total_cents
    ) values(
      v_cart.organization_id,v_cart.store_id,v_order_id,v_cart_item.product_id,v_cart_item.product_name_snapshot,v_cart_item.product_image_url_snapshot,v_cart_item.quantity,v_cart_item.note,
      v_cart_item.unit_base_price_cents,v_cart_item.unit_modifiers_price_cents,v_cart_item.unit_segment_price_cents,v_cart_item.unit_total_price_cents,v_cart_item.line_total_cents
    ) returning id into v_order_item_id;
    insert into public.order_item_modifiers(organization_id,store_id,order_item_id,modifier_group_id,modifier_id,group_name_snapshot,modifier_name_snapshot,unit_price_cents)
    select v_cart.organization_id,v_cart.store_id,v_order_item_id,m.modifier_group_id,m.modifier_id,m.group_name_snapshot,m.modifier_name_snapshot,m.unit_price_cents
    from public.cart_item_modifiers m where m.cart_item_id=v_cart_item.id order by m.created_at,m.id;
    insert into public.order_item_gas_options(organization_id,store_id,order_item_id,container_type_id,sale_mode,container_code_snapshot,container_name_snapshot,unit_container_price_cents)
    select v_cart.organization_id,v_cart.store_id,v_order_item_id,g.container_type_id,g.sale_mode,g.container_code_snapshot,g.container_name_snapshot,g.unit_container_price_cents
    from public.cart_item_gas_options g where g.cart_item_id=v_cart_item.id;
  end loop;

  insert into public.order_state_history(organization_id,store_id,order_id,state_domain,from_state,to_state,source) values
    (v_cart.organization_id,v_cart.store_id,v_order_id,'order',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'payment',null,'pending','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'production',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'fulfillment',null,'pending','checkout');
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at)
  values(v_cart.organization_id,v_cart.store_id,'order.created','order',v_order_id,jsonb_build_object('display_number',v_display_number,'channel','digital_menu','fulfillment_type',v_checkout.fulfillment_type,'total_cents',v_cart.total_cents),'pending',0,now());
  update public.carts set status='converted',updated_at=now() where id=v_cart.id;
  return jsonb_build_object('order_id',v_order_id,'display_number',v_display_number,'created',true);
end $$;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text,text) to service_role;

create or replace function public.set_store_modules_internal(
  p_organization_id uuid,p_store_id uuid,p_changes jsonb,p_source text,p_actor_user_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_revision bigint; v_business_type text; v_item jsonb; v_key text; v_enabled boolean; v_before jsonb; v_after jsonb; v_new_revision bigint; v_ent record;
begin
  if p_organization_id is null or p_store_id is null or p_actor_user_id is null then raise exception 'organization, store and actor are required'; end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'expected module configuration revision is required'; end if;
  if p_source not in ('preset','manual','support') then raise exception 'invalid module configuration source'; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)=0 then raise exception 'module changes must be a non-empty array'; end if;
  select s.module_config_revision,s.business_type into v_revision,v_business_type from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id for update;
  if v_revision is null then raise exception 'store not found'; end if;
  if v_revision<>p_expected_revision then raise exception 'module configuration revision conflict'; end if;

  if p_source<>'support' and not exists(
    select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active' and (
      exists(select 1 from public.roles r join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id and p.key='stores.manage' where r.id=m.role_id and r.organization_id=p_organization_id)
      or exists(select 1 from public.user_store_roles usr join public.roles r on r.id=usr.role_id and r.organization_id=usr.organization_id join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id and p.key='stores.manage' where usr.organization_id=p_organization_id and usr.store_id=p_store_id and usr.user_id=p_actor_user_id)
    )
  ) then raise exception 'actor cannot manage store modules'; end if;

  select coalesce(jsonb_object_agg(sm.module_key,sm.enabled),'{}'::jsonb) into v_before from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id;
  for v_item in select value from jsonb_array_elements(p_changes) loop
    v_key:=trim(coalesce(v_item->>'module_key',''));
    if v_key not in ('dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver','inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings') then raise exception 'unknown module key: %',v_key; end if;
    if not(v_item?'enabled') then raise exception 'enabled is required for module %',v_key; end if;
    v_enabled:=(v_item->>'enabled')::boolean;
    if v_key='gas_containers' and v_enabled then
      if v_business_type<>'gas' then raise exception 'gas_containers is not supported by business profile'; end if;
      select * into v_ent from private.organization_entitlement(p_organization_id,'module.gas_containers',now());
      if v_ent.feature_id is null or not coalesce(v_ent.enabled,false) then raise exception 'feature is not entitled for organization'; end if;
    end if;
    insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by)
    values(p_organization_id,p_store_id,v_key,v_enabled,p_source,2,p_actor_user_id)
    on conflict(store_id,module_key) do update set enabled=excluded.enabled,configuration_source=excluded.configuration_source,catalog_version=excluded.catalog_version,updated_by=excluded.updated_by,updated_at=now();
  end loop;

  if v_business_type<>'restaurant' and exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='dining' and sm.enabled) then raise exception 'dining is not supported by business profile'; end if;
  if v_business_type<>'gas' and exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and sm.enabled) then raise exception 'gas_containers is not supported by business profile'; end if;
  if exists(
    with dependencies(module_key,dependency_key) as(values
      ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),
      ('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),('gas_containers','orders'),('gas_containers','catalog'))
    select 1 from dependencies d
    join public.store_modules m on m.organization_id=p_organization_id and m.store_id=p_store_id and m.module_key=d.module_key and m.enabled
    left join public.store_modules dep on dep.organization_id=p_organization_id and dep.store_id=p_store_id and dep.module_key=d.dependency_key and dep.enabled
    where dep.module_key is null
  ) then raise exception 'module dependency violation'; end if;

  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='cash' and not sm.enabled)
    and exists(select 1 from public.cash_sessions cs where cs.organization_id=p_organization_id and cs.store_id=p_store_id and cs.status='open') then raise exception 'cash_session_open'; end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='dining' and not sm.enabled)
    and exists(select 1 from public.tabs t where t.organization_id=p_organization_id and t.store_id=p_store_id and t.status in ('open','settling')) then raise exception 'dining_tab_open'; end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key in ('deliveries','driver') and not sm.enabled)
    and exists(select 1 from public.deliveries d where d.organization_id=p_organization_id and d.store_id=p_store_id and d.delivered_at is null and d.canceled_at is null) then raise exception 'delivery_in_progress'; end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and not sm.enabled)
    and exists(select 1 from public.gas_container_balances b where b.organization_id=p_organization_id and b.store_id=p_store_id and b.in_route_quantity<>0) then raise exception 'gas_containers_in_route'; end if;

  select coalesce(jsonb_object_agg(sm.module_key,sm.enabled),'{}'::jsonb) into v_after from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id;
  if v_before=v_after then return jsonb_build_object('changed',false,'revision',v_revision); end if;
  v_new_revision:=v_revision+1;
  update public.stores set module_config_revision=v_new_revision,module_catalog_version=2,module_preset=case when p_source in ('manual','support') then 'custom' else module_preset end,updated_at=now() where id=p_store_id and organization_id=p_organization_id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_organization_id,p_store_id,p_actor_user_id,'store.modules.changed','store',p_store_id,jsonb_build_object('modules',v_before,'revision',v_revision),jsonb_build_object('modules',v_after,'revision',v_new_revision,'source',p_source));
  return jsonb_build_object('changed',true,'revision',v_new_revision);
end $$;
revoke all on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint) to service_role;

create or replace function private.bootstrap_organization_modular(
  organization_name text,store_name text,store_slug text,p_business_type text,p_module_preset text,p_enabled_modules text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=(select auth.uid()); v_result jsonb; v_org_id uuid; v_store_id uuid; v_existing_org_id uuid; v_existing_store_id uuid; v_ent record;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text,0));
  select m.organization_id,s.id into v_existing_org_id,v_existing_store_id from public.organization_members m join public.stores s on s.organization_id=m.organization_id and s.status='active'
  where m.user_id=actor_id and m.status='active' order by s.is_primary desc,s.created_at,s.id limit 1;
  if v_existing_org_id is not null and v_existing_store_id is not null then return jsonb_build_object('organization_id',v_existing_org_id,'store_id',v_existing_store_id,'reused',true); end if;
  if p_business_type not in ('restaurant','gas','generic_commerce') then raise exception 'invalid business type'; end if;
  if p_module_preset not in ('essential','complete','custom') then raise exception 'invalid module preset'; end if;
  if p_enabled_modules is null then raise exception 'enabled modules are required'; end if;
  if exists(select 1 from unnest(p_enabled_modules)x(module_key) where module_key not in ('dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver','inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings')) then raise exception 'unknown module key'; end if;
  if not(array['dashboard','orders','catalog','customers','settings']::text[]<@p_enabled_modules) then raise exception 'core modules are required'; end if;
  if p_business_type<>'restaurant' and 'dining'=any(p_enabled_modules) then raise exception 'dining is not supported by business profile'; end if;
  if p_business_type<>'gas' and 'gas_containers'=any(p_enabled_modules) then raise exception 'gas_containers is not supported by business profile'; end if;
  if exists(with dependencies(module_key,dependency_key) as(values
    ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),
    ('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),('gas_containers','orders'),('gas_containers','catalog'))
    select 1 from dependencies d where d.module_key=any(p_enabled_modules) and not(d.dependency_key=any(p_enabled_modules))) then raise exception 'module dependency violation'; end if;

  v_result:=private.bootstrap_organization(organization_name,store_name,store_slug);
  v_org_id:=(v_result->>'organization_id')::uuid; v_store_id:=(v_result->>'store_id')::uuid;
  if 'gas_containers'=any(p_enabled_modules) then
    select * into v_ent from private.organization_entitlement(v_org_id,'module.gas_containers',now());
    if v_ent.feature_id is null or not coalesce(v_ent.enabled,false) then raise exception 'feature is not entitled for organization'; end if;
  end if;
  update public.stores set business_type=p_business_type,module_preset=p_module_preset,module_catalog_version=2,module_config_revision=0,updated_at=now() where id=v_store_id and organization_id=v_org_id;
  with module_catalog(module_key) as(values
    ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),('deliveries'),('driver'),('inventory'),('gas_containers'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings'))
  insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by)
  select v_org_id,v_store_id,c.module_key,c.module_key=any(p_enabled_modules),'preset',2,actor_id from module_catalog c
  on conflict(store_id,module_key) do update set enabled=excluded.enabled,configuration_source=excluded.configuration_source,catalog_version=excluded.catalog_version,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_org_id,v_store_id,actor_id,'organization.modules.bootstrap','store',v_store_id,jsonb_build_object('business_type',p_business_type,'preset',p_module_preset,'enabled_modules',to_jsonb(p_enabled_modules),'catalog_version',2));
  return v_result||jsonb_build_object('business_type',p_business_type,'module_preset',p_module_preset,'reused',false);
end $$;
revoke all on function private.bootstrap_organization_modular(text,text,text,text,text,text[]) from public;
grant execute on function private.bootstrap_organization_modular(text,text,text,text,text,text[]) to authenticated;

create or replace function public.set_store_module_preset_internal(
  p_organization_id uuid,p_store_id uuid,p_module_preset text,p_enabled_modules text[],p_actor_user_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_changes jsonb; v_result jsonb; v_old_preset text; v_revision bigint; v_changed boolean;
begin
  if p_module_preset not in ('essential','complete') then raise exception 'invalid restorable preset'; end if;
  if p_enabled_modules is null then raise exception 'enabled modules are required'; end if;
  select s.module_preset into v_old_preset from public.stores s where s.organization_id=p_organization_id and s.id=p_store_id;
  if v_old_preset is null then raise exception 'store not found'; end if;
  select jsonb_agg(jsonb_build_object('module_key',c.module_key,'enabled',c.module_key=any(p_enabled_modules))) into v_changes
  from(values ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),('deliveries'),('driver'),('inventory'),('gas_containers'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings'))c(module_key);
  v_result:=public.set_store_modules_internal(p_organization_id,p_store_id,v_changes,'preset',p_actor_user_id,p_expected_revision);
  v_changed:=coalesce((v_result->>'changed')::boolean,false); v_revision:=coalesce((v_result->>'revision')::bigint,p_expected_revision);
  if v_old_preset is distinct from p_module_preset then
    if not v_changed then v_revision:=v_revision+1; end if;
    update public.stores set module_preset=p_module_preset,module_config_revision=v_revision,module_catalog_version=2,updated_at=now() where organization_id=p_organization_id and id=p_store_id;
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_organization_id,p_store_id,p_actor_user_id,'store.modules.preset_changed','store',p_store_id,jsonb_build_object('preset',v_old_preset),jsonb_build_object('preset',p_module_preset,'revision',v_revision,'catalog_version',2));
  end if;
  return jsonb_build_object('changed',v_changed or v_old_preset is distinct from p_module_preset,'revision',v_revision,'preset',p_module_preset);
end $$;
revoke all on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) to service_role;
