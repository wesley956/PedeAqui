alter table public.subscription_change_requests
  add column if not exists requested_store_id uuid references public.stores(id) on delete set null;

create index if not exists subscription_change_requests_requested_store_idx
  on public.subscription_change_requests(requested_store_id, status)
  where requested_store_id is not null;

-- Toda ativação de módulo passa a respeitar entitlement no próprio banco para organizações
-- que já possuem alguma assinatura. Organizações legadas sem assinatura continuam compatíveis.
create or replace function public.set_store_modules_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_changes jsonb,
  p_source text,
  p_actor_user_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
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
  v_has_subscription boolean;
begin
  if p_organization_id is null or p_store_id is null or p_actor_user_id is null then
    raise exception 'organization, store and actor are required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'expected module configuration revision is required';
  end if;
  if p_source not in ('preset','manual','support') then
    raise exception 'invalid module configuration source';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes)=0 then
    raise exception 'module changes must be a non-empty array';
  end if;

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
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active' and (
      exists(
        select 1 from public.roles r
        join public.role_permissions rp on rp.role_id=r.id
        join public.permissions p on p.id=rp.permission_id and p.key='stores.manage'
        where r.id=m.role_id and r.organization_id=p_organization_id
      )
      or exists(
        select 1 from public.user_store_roles usr
        join public.roles r on r.id=usr.role_id and r.organization_id=usr.organization_id
        join public.role_permissions rp on rp.role_id=r.id
        join public.permissions p on p.id=rp.permission_id and p.key='stores.manage'
        where usr.organization_id=p_organization_id and usr.store_id=p_store_id and usr.user_id=p_actor_user_id
      )
    )
  ) then
    raise exception 'actor cannot manage store modules';
  end if;

  select exists(
    select 1 from public.organization_subscriptions s where s.organization_id=p_organization_id
  ) into v_has_subscription;

  select coalesce(jsonb_object_agg(sm.module_key,sm.enabled),'{}'::jsonb)
    into v_before
  from public.store_modules sm
  where sm.organization_id=p_organization_id and sm.store_id=p_store_id;

  for v_item in select value from jsonb_array_elements(p_changes) loop
    v_key:=trim(coalesce(v_item->>'module_key',''));
    if v_key not in ('dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver','inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings') then
      raise exception 'unknown module key: %',v_key;
    end if;
    if not(v_item?'enabled') then raise exception 'enabled is required for module %',v_key; end if;
    v_enabled:=(v_item->>'enabled')::boolean;

    if v_enabled and v_has_subscription then
      select * into v_ent from private.organization_entitlement(p_organization_id,'module.'||v_key,now());
      if v_ent.feature_id is null or not coalesce(v_ent.enabled,false) then
        raise exception 'feature is not entitled for organization: %',v_key;
      end if;
    end if;

    insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by)
    values(p_organization_id,p_store_id,v_key,v_enabled,p_source,2,p_actor_user_id)
    on conflict(store_id,module_key) do update
      set enabled=excluded.enabled,
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
      ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),('gas_containers','orders'),('gas_containers','catalog'))
    select 1 from dependencies d
    join public.store_modules m on m.organization_id=p_organization_id and m.store_id=p_store_id and m.module_key=d.module_key and m.enabled
    left join public.store_modules dep on dep.organization_id=p_organization_id and dep.store_id=p_store_id and dep.module_key=d.dependency_key and dep.enabled
    where dep.module_key is null
  ) then raise exception 'module dependency violation'; end if;

  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='cash' and not sm.enabled)
     and exists(select 1 from public.cash_sessions cs where cs.organization_id=p_organization_id and cs.store_id=p_store_id and cs.status='open') then
    raise exception 'cash_session_open';
  end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='dining' and not sm.enabled)
     and exists(select 1 from public.tabs t where t.organization_id=p_organization_id and t.store_id=p_store_id and t.status in ('open','settling')) then
    raise exception 'dining_tab_open';
  end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key in ('deliveries','driver') and not sm.enabled)
     and exists(select 1 from public.deliveries d where d.organization_id=p_organization_id and d.store_id=p_store_id and d.delivered_at is null and d.canceled_at is null) then
    raise exception 'delivery_in_progress';
  end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and not sm.enabled)
     and exists(select 1 from public.gas_container_balances b where b.organization_id=p_organization_id and b.store_id=p_store_id and b.in_route_quantity<>0) then
    raise exception 'gas_containers_in_route';
  end if;

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
$function$;

create or replace function public.subscription_change_cancel_internal(
  p_change_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
)
returns public.subscription_change_requests
language plpgsql
set search_path to ''
as $function$
declare
  v_row public.subscription_change_requests%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_row from public.subscription_change_requests where id=p_change_id for update;
  if v_row.id is null then raise exception 'change request not found'; end if;
  if v_row.status not in ('draft','scheduled') then raise exception 'only pending changes can be cancelled'; end if;

  update public.subscription_change_requests
  set status='cancelled',cancelled_at=now(),reason=trim(p_reason),protocol=trim(p_protocol),updated_at=now()
  where id=v_row.id
  returning * into v_row;

  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(
    v_row.organization_id,p_actor_user_id,'platform.contract.change_cancelled','subscription_change_request',v_row.id,
    jsonb_build_object('change_type',v_row.change_type,'cancelled_at',v_row.cancelled_at),trim(p_reason),trim(p_protocol)
  );
  return v_row;
end;
$function$;

create or replace function public.subscription_module_request_approve_internal(
  p_change_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
)
returns public.subscription_change_requests
language plpgsql
set search_path to ''
as $function$
declare
  v_row public.subscription_change_requests%rowtype;
  v_module_key text;
  v_revision bigint;
  v_changes jsonb;
  v_dependency text;
  v_ent record;
begin
  perform private.require_platform_super_admin(p_actor_user_id);

  select * into v_row
  from public.subscription_change_requests
  where id=p_change_id
  for update;

  if v_row.id is null then raise exception 'change request not found'; end if;
  if v_row.change_type<>'add_on' or v_row.status<>'draft' then raise exception 'draft add-on request required'; end if;
  if v_row.feature_id is null or v_row.requested_store_id is null then raise exception 'module request context is incomplete'; end if;
  if v_row.effective_at>now() then raise exception 'module request is scheduled for a future date'; end if;

  select nullif(trim(f.metadata->>'module_key'),'')
    into v_module_key
  from public.features f
  where f.id=v_row.feature_id and f.active=true;
  if v_module_key is null then raise exception 'requested feature is not a module'; end if;

  select s.module_config_revision
    into v_revision
  from public.stores s
  where s.id=v_row.requested_store_id
    and s.organization_id=v_row.organization_id
    and s.status='active'
  for update;
  if v_revision is null then raise exception 'requested store is unavailable'; end if;

  -- Dependências precisam já fazer parte do plano ou de outro adicional aprovado.
  for v_dependency in
    with recursive dependency_map(module_key,dependency_key) as (values
      ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),('gas_containers','orders'),('gas_containers','catalog')
    ), deps(module_key) as (
      select d.dependency_key from dependency_map d where d.module_key=v_module_key
      union
      select d.dependency_key from dependency_map d join deps x on d.module_key=x.module_key
    )
    select distinct module_key from deps
  loop
    select * into v_ent from private.organization_entitlement(v_row.organization_id,'module.'||v_dependency,now());
    if v_ent.feature_id is null or not coalesce(v_ent.enabled,false) then
      raise exception 'module dependency is not entitled: %',v_dependency;
    end if;
  end loop;

  -- Aceite, cobrança e ativação acontecem na mesma transação.
  perform public.subscription_change_accept_internal(p_change_id,p_actor_user_id,p_reason,p_protocol);
  perform public.subscription_change_apply_internal(p_change_id,p_actor_user_id,p_reason,p_protocol);

  with recursive dependency_map(module_key,dependency_key) as (values
    ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),('gas_containers','orders'),('gas_containers','catalog')
  ), deps(module_key) as (
    select v_module_key
    union
    select d.dependency_key from dependency_map d join deps x on d.module_key=x.module_key
  )
  select jsonb_agg(jsonb_build_object('module_key',module_key,'enabled',true) order by module_key)
    into v_changes
  from (select distinct module_key from deps) q;

  perform public.set_store_modules_internal(
    v_row.organization_id,
    v_row.requested_store_id,
    v_changes,
    'support',
    p_actor_user_id,
    v_revision
  );

  select * into v_row from public.subscription_change_requests where id=p_change_id;
  return v_row;
end;
$function$;