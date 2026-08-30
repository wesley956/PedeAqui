-- PedeAqui — autorização explícita do motor modular para fluxos administrativos
-- manual = membro da organização com stores.manage
-- preset/support = somente super-admin da plataforma

create or replace function public.set_store_modules_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_changes jsonb,
  p_source text,
  p_actor_user_id uuid,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_revision bigint;
  v_business_type text;
  v_item jsonb;
  v_key text;
  v_enabled boolean;
  v_before jsonb;
  v_after jsonb;
  v_new_revision bigint;
  v_ent record;
begin
  if p_organization_id is null or p_store_id is null or p_actor_user_id is null then raise exception 'organization, store and actor are required'; end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'expected module configuration revision is required'; end if;
  if p_source not in ('preset','manual','support') then raise exception 'invalid module configuration source'; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)=0 then raise exception 'module changes must be a non-empty array'; end if;

  select s.module_config_revision,s.business_type
  into v_revision,v_business_type
  from public.stores s
  where s.id=p_store_id and s.organization_id=p_organization_id
  for update;
  if v_revision is null then raise exception 'store not found'; end if;
  if v_revision<>p_expected_revision then raise exception 'module configuration revision conflict'; end if;

  if p_source in ('preset','support') then
    perform private.require_platform_super_admin(p_actor_user_id);
  elsif not exists(
    select 1
    from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and (
        exists(
          select 1
          from public.roles r
          join public.role_permissions rp on rp.role_id=r.id
          join public.permissions p on p.id=rp.permission_id and p.key='stores.manage'
          where r.id=m.role_id and r.organization_id=p_organization_id
        )
        or exists(
          select 1
          from public.user_store_roles usr
          join public.roles r on r.id=usr.role_id and r.organization_id=usr.organization_id
          join public.role_permissions rp on rp.role_id=r.id
          join public.permissions p on p.id=rp.permission_id and p.key='stores.manage'
          where usr.organization_id=p_organization_id
            and usr.store_id=p_store_id
            and usr.user_id=p_actor_user_id
        )
      )
  ) then
    raise exception 'actor cannot manage store modules';
  end if;

  select coalesce(jsonb_object_agg(sm.module_key,sm.enabled),'{}'::jsonb)
  into v_before
  from public.store_modules sm
  where sm.organization_id=p_organization_id and sm.store_id=p_store_id;

  for v_item in select value from jsonb_array_elements(p_changes) loop
    v_key:=trim(coalesce(v_item->>'module_key',''));
    if v_key not in (
      'dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver',
      'inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings'
    ) then raise exception 'unknown module key: %',v_key; end if;
    if not(v_item?'enabled') then raise exception 'enabled is required for module %',v_key; end if;
    v_enabled:=(v_item->>'enabled')::boolean;

    if v_key='gas_containers' and v_enabled then
      if v_business_type<>'gas' then raise exception 'gas_containers is not supported by business profile'; end if;
      select * into v_ent from private.organization_entitlement(p_organization_id,'module.gas_containers',now());
      if v_ent.feature_id is null or not coalesce(v_ent.enabled,false) then raise exception 'feature is not entitled for organization'; end if;
    end if;

    insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by)
    values(p_organization_id,p_store_id,v_key,v_enabled,p_source,2,p_actor_user_id)
    on conflict(store_id,module_key) do update set
      enabled=excluded.enabled,
      configuration_source=excluded.configuration_source,
      catalog_version=excluded.catalog_version,
      updated_by=excluded.updated_by,
      updated_at=now();
  end loop;

  if v_business_type<>'restaurant' and exists(
    select 1 from public.store_modules sm
    where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='dining' and sm.enabled
  ) then raise exception 'dining is not supported by business profile'; end if;

  if v_business_type<>'gas' and exists(
    select 1 from public.store_modules sm
    where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and sm.enabled
  ) then raise exception 'gas_containers is not supported by business profile'; end if;

  if exists(
    with dependencies(module_key,dependency_key) as(values
      ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),
      ('deliveries','orders'),('driver','deliveries'),('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),
      ('gas_containers','orders'),('gas_containers','catalog'))
    select 1
    from dependencies d
    join public.store_modules m on m.organization_id=p_organization_id and m.store_id=p_store_id and m.module_key=d.module_key and m.enabled
    left join public.store_modules dep on dep.organization_id=p_organization_id and dep.store_id=p_store_id and dep.module_key=d.dependency_key and dep.enabled
    where dep.module_key is null
  ) then raise exception 'module dependency violation'; end if;

  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='cash' and not sm.enabled)
    and exists(select 1 from public.cash_sessions cs where cs.organization_id=p_organization_id and cs.store_id=p_store_id and cs.status='open')
  then raise exception 'cash_session_open'; end if;

  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='dining' and not sm.enabled)
    and exists(select 1 from public.tabs t where t.organization_id=p_organization_id and t.store_id=p_store_id and t.status in ('open','settling'))
  then raise exception 'dining_tab_open'; end if;

  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key in ('deliveries','driver') and not sm.enabled)
    and exists(select 1 from public.deliveries d where d.organization_id=p_organization_id and d.store_id=p_store_id and d.delivered_at is null and d.canceled_at is null)
  then raise exception 'delivery_in_progress'; end if;

  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and not sm.enabled)
    and exists(select 1 from public.gas_container_balances b where b.organization_id=p_organization_id and b.store_id=p_store_id and b.in_route_quantity<>0)
  then raise exception 'gas_containers_in_route'; end if;

  select coalesce(jsonb_object_agg(sm.module_key,sm.enabled),'{}'::jsonb)
  into v_after
  from public.store_modules sm
  where sm.organization_id=p_organization_id and sm.store_id=p_store_id;

  if v_before=v_after then return jsonb_build_object('changed',false,'revision',v_revision); end if;

  v_new_revision:=v_revision+1;
  update public.stores
  set module_config_revision=v_new_revision,
      module_catalog_version=2,
      module_preset=case when p_source in ('manual','support') then 'custom' else module_preset end,
      updated_at=now()
  where id=p_store_id and organization_id=p_organization_id;

  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(
    p_organization_id,p_store_id,p_actor_user_id,'store.modules.changed','store',p_store_id,
    jsonb_build_object('modules',v_before,'revision',v_revision),
    jsonb_build_object('modules',v_after,'revision',v_new_revision,'source',p_source)
  );

  return jsonb_build_object('changed',true,'revision',v_new_revision);
end;
$$;

revoke all on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint) to service_role;
