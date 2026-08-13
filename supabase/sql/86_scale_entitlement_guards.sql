-- PedeAqui — Milestone 23 [247]–[252]
-- Quotas de recursos concorrentes usam contagem real sob lock; ledger de uso continua para métricas por período.

create or replace function public.configure_branding_entitled_internal(
  p_organization_id uuid,p_white_label_enabled boolean,p_product_name text,p_logo_asset_ref text,p_favicon_asset_ref text,
  p_primary_color text,p_secondary_color text,p_support_url text,p_hide_pedeaqui_branding boolean,p_actor_user_id uuid
) returns public.organization_branding
language plpgsql security invoker set search_path='' as $$
declare v_ent record; v_row public.organization_branding%rowtype;
begin
  if p_white_label_enabled or p_hide_pedeaqui_branding then
    select * into v_ent from private.organization_entitlement(p_organization_id,'branding.white_label',now());
    if v_ent.feature_id is null or not v_ent.enabled then raise exception 'white-label is not entitled for organization'; end if;
  end if;
  select * into v_row from public.configure_branding_internal(p_organization_id,p_white_label_enabled,p_product_name,p_logo_asset_ref,p_favicon_asset_ref,p_primary_color,p_secondary_color,p_support_url,p_hide_pedeaqui_branding,p_actor_user_id);
  return v_row;
end;
$$;
revoke all on function public.configure_branding_entitled_internal(uuid,boolean,text,text,text,text,text,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.configure_branding_entitled_internal(uuid,boolean,text,text,text,text,text,text,boolean,uuid) to service_role;

create or replace function public.configure_domain_entitled_internal(p_organization_id uuid,p_store_id uuid,p_hostname text,p_actor_user_id uuid)
returns public.organization_domains
language plpgsql security invoker set search_path='' as $$
declare v_ent record; v_count bigint; v_existing public.organization_domains%rowtype; v_row public.organization_domains%rowtype; v_host text:=lower(trim(p_hostname));
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':domains.custom',0));
  select * into v_ent from private.organization_entitlement(p_organization_id,'domains.custom',now());
  if v_ent.feature_id is null or not v_ent.enabled then raise exception 'custom domains are not entitled for organization'; end if;
  select * into v_existing from public.organization_domains where hostname=v_host;
  if v_existing.id is not null and v_existing.organization_id<>p_organization_id then raise exception 'domain belongs to another organization'; end if;
  if v_existing.id is null then
    select count(*) into v_count from public.organization_domains where organization_id=p_organization_id and status<>'disabled';
    if v_ent.limit_value is not null and v_count>=v_ent.limit_value then raise exception 'custom domain limit exceeded'; end if;
  end if;
  select * into v_row from public.configure_domain_internal(p_organization_id,p_store_id,v_host,p_actor_user_id);
  return v_row;
end;
$$;
revoke all on function public.configure_domain_entitled_internal(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.configure_domain_entitled_internal(uuid,uuid,text,uuid) to service_role;

create or replace function public.create_franchise_group_internal(p_organization_id uuid,p_key text,p_name text,p_actor_user_id uuid)
returns public.franchise_groups
language plpgsql security invoker set search_path='' as $$
declare v_ent record; v_row public.franchise_groups%rowtype;
begin
  select * into v_ent from private.organization_entitlement(p_organization_id,'scale.multiunit',now());
  if v_ent.feature_id is null or not v_ent.enabled then raise exception 'multiunit scale is not entitled for organization'; end if;
  insert into public.franchise_groups(organization_id,key,name,created_by,updated_by)
  values(p_organization_id,lower(trim(p_key)),trim(p_name),p_actor_user_id,p_actor_user_id)
  on conflict(organization_id,key) do update set name=excluded.name,active=true,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.create_franchise_group_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_franchise_group_internal(uuid,text,text,uuid) to service_role;

create or replace function public.assign_franchise_group_store_internal(p_organization_id uuid,p_group_id uuid,p_store_id uuid,p_actor_user_id uuid)
returns public.franchise_group_stores
language plpgsql security invoker set search_path='' as $$
declare v_row public.franchise_group_stores%rowtype;
begin
  if not exists(select 1 from public.franchise_groups g where g.organization_id=p_organization_id and g.id=p_group_id and g.active=true) then raise exception 'group outside organization'; end if;
  if not exists(select 1 from public.stores s where s.organization_id=p_organization_id and s.id=p_store_id and s.status='active') then raise exception 'store outside organization'; end if;
  insert into public.franchise_group_stores(organization_id,group_id,store_id,created_by)
  values(p_organization_id,p_group_id,p_store_id,p_actor_user_id)
  on conflict(group_id,store_id) do update set organization_id=excluded.organization_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.assign_franchise_group_store_internal(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_franchise_group_store_internal(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.install_catalog_integration_internal(
  p_organization_id uuid,p_store_id uuid,p_adapter_key text,p_environment text,p_secret_ref text,p_webhook_secret_ref text,p_config jsonb,p_actor_user_id uuid
) returns public.integrations
language plpgsql security invoker set search_path='' as $$
declare v_ent record; v_catalog public.integration_catalog%rowtype; v_row public.integrations%rowtype;
begin
  select * into v_ent from private.organization_entitlement(p_organization_id,'integrations.marketplace',now());
  if v_ent.feature_id is null or not v_ent.enabled then raise exception 'integration marketplace is not entitled for organization'; end if;
  select * into v_catalog from public.integration_catalog where adapter_key=trim(p_adapter_key) and active=true;
  if v_catalog.id is null then raise exception 'integration adapter not found'; end if;
  if v_catalog.kind='billing' then raise exception 'billing adapters are platform-managed'; end if;
  if p_store_id is not null and not exists(select 1 from public.stores s where s.organization_id=p_organization_id and s.id=p_store_id) then raise exception 'store outside organization'; end if;
  if p_environment not in ('sandbox','homologation','production') then raise exception 'invalid integration environment'; end if;
  select * into v_row from public.integrations where organization_id=p_organization_id and store_id is not distinct from p_store_id and provider_key=v_catalog.adapter_key order by updated_at desc limit 1 for update;
  if v_row.id is null then
    insert into public.integrations(organization_id,store_id,kind,provider_key,name,environment,secret_ref,webhook_secret_ref,capabilities,config,active,created_by,updated_by)
    values(p_organization_id,p_store_id,v_catalog.kind,v_catalog.adapter_key,v_catalog.display_name,p_environment,nullif(trim(coalesce(p_secret_ref,'')),''),nullif(trim(coalesce(p_webhook_secret_ref,'')),''),v_catalog.capabilities,coalesce(p_config,'{}'::jsonb),true,p_actor_user_id,p_actor_user_id)
    returning * into v_row;
  else
    update public.integrations set environment=p_environment,secret_ref=nullif(trim(coalesce(p_secret_ref,'')),''),webhook_secret_ref=nullif(trim(coalesce(p_webhook_secret_ref,'')),''),capabilities=v_catalog.capabilities,config=coalesce(p_config,'{}'::jsonb),active=true,updated_by=p_actor_user_id,updated_at=now() where id=v_row.id returning * into v_row;
  end if;
  return v_row;
end;
$$;
revoke all on function public.install_catalog_integration_internal(uuid,uuid,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.install_catalog_integration_internal(uuid,uuid,text,text,text,text,jsonb,uuid) to service_role;
