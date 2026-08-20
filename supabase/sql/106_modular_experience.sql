-- PedeAqui — ciclo modular [357]–[361]
-- Preferência de experiência por usuário, onboarding modular atômico e aplicação segura de presets.

create table if not exists public.user_store_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_mode text not null default 'standard' check (experience_mode in ('standard','easy')),
  preference_version integer not null default 1 check (preference_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id),
  constraint user_store_preferences_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade
);
create index if not exists user_store_preferences_user_idx on public.user_store_preferences(user_id, organization_id, store_id);
alter table public.user_store_preferences enable row level security;
revoke all on table public.user_store_preferences from anon, authenticated;
grant select, insert, update on table public.user_store_preferences to authenticated;
grant select, insert, update, delete on table public.user_store_preferences to service_role;

drop policy if exists user_store_preferences_select_own on public.user_store_preferences;
create policy user_store_preferences_select_own on public.user_store_preferences for select to authenticated
using (user_id = (select auth.uid()) and private.can_access_store(organization_id, store_id));
drop policy if exists user_store_preferences_insert_own on public.user_store_preferences;
create policy user_store_preferences_insert_own on public.user_store_preferences for insert to authenticated
with check (user_id = (select auth.uid()) and private.can_access_store(organization_id, store_id));
drop policy if exists user_store_preferences_update_own on public.user_store_preferences;
create policy user_store_preferences_update_own on public.user_store_preferences for update to authenticated
using (user_id = (select auth.uid()) and private.can_access_store(organization_id, store_id))
with check (user_id = (select auth.uid()) and private.can_access_store(organization_id, store_id));

create or replace function private.bootstrap_organization_modular(
  organization_name text, store_name text, store_slug text,
  p_business_type text, p_module_preset text, p_enabled_modules text[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); v_result jsonb; v_org_id uuid; v_store_id uuid;
  v_existing_org_id uuid; v_existing_store_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));
  select m.organization_id, s.id into v_existing_org_id, v_existing_store_id
  from public.organization_members m join public.stores s on s.organization_id=m.organization_id and s.status='active'
  where m.user_id=actor_id and m.status='active' order by s.is_primary desc,s.created_at,s.id limit 1;
  if v_existing_org_id is not null and v_existing_store_id is not null then
    return jsonb_build_object('organization_id',v_existing_org_id,'store_id',v_existing_store_id,'reused',true);
  end if;
  if p_business_type not in ('restaurant','gas','generic_commerce') then raise exception 'invalid business type'; end if;
  if p_module_preset not in ('essential','complete','custom') then raise exception 'invalid module preset'; end if;
  if p_enabled_modules is null then raise exception 'enabled modules are required'; end if;
  if exists (select 1 from unnest(p_enabled_modules) x(module_key) where module_key not in (
    'dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver','inventory','suppliers','purchases','customers','growth','scale','team','settings'
  )) then raise exception 'unknown module key'; end if;
  if not (array['dashboard','orders','catalog','customers','settings']::text[] <@ p_enabled_modules) then raise exception 'core modules are required'; end if;
  if p_business_type <> 'restaurant' and 'dining'=any(p_enabled_modules) then raise exception 'dining is not supported by business profile'; end if;
  if exists (
    with dependencies(module_key,dependency_key) as (values
      ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'))
    select 1 from dependencies d where d.module_key=any(p_enabled_modules) and not(d.dependency_key=any(p_enabled_modules))
  ) then raise exception 'module dependency violation'; end if;

  v_result := private.bootstrap_organization(organization_name,store_name,store_slug);
  v_org_id := (v_result->>'organization_id')::uuid; v_store_id := (v_result->>'store_id')::uuid;
  update public.stores set business_type=p_business_type,module_preset=p_module_preset,module_catalog_version=1,module_config_revision=0,updated_at=now()
  where id=v_store_id and organization_id=v_org_id;
  with module_catalog(module_key) as (values
    ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),('deliveries'),('driver'),('inventory'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings'))
  insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by)
  select v_org_id,v_store_id,c.module_key,c.module_key=any(p_enabled_modules),'preset',1,actor_id from module_catalog c
  on conflict(store_id,module_key) do update set enabled=excluded.enabled,configuration_source=excluded.configuration_source,catalog_version=excluded.catalog_version,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_org_id,v_store_id,actor_id,'organization.modules.bootstrap','store',v_store_id,jsonb_build_object('business_type',p_business_type,'preset',p_module_preset,'enabled_modules',to_jsonb(p_enabled_modules)));
  return v_result || jsonb_build_object('business_type',p_business_type,'module_preset',p_module_preset,'reused',false);
end; $$;
revoke all on function private.bootstrap_organization_modular(text,text,text,text,text,text[]) from public;
grant execute on function private.bootstrap_organization_modular(text,text,text,text,text,text[]) to authenticated;

create or replace function public.bootstrap_organization_modular(
  organization_name text,store_name text,store_slug text,p_business_type text,p_module_preset text,p_enabled_modules text[]
) returns jsonb language sql security invoker set search_path='' as $$
  select private.bootstrap_organization_modular(organization_name,store_name,store_slug,p_business_type,p_module_preset,p_enabled_modules);
$$;
revoke all on function public.bootstrap_organization_modular(text,text,text,text,text,text[]) from public;
grant execute on function public.bootstrap_organization_modular(text,text,text,text,text,text[]) to authenticated;

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
  from (values ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),('deliveries'),('driver'),('inventory'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings')) c(module_key);
  v_result := public.set_store_modules_internal(p_organization_id,p_store_id,v_changes,'preset',p_actor_user_id,p_expected_revision);
  v_changed := coalesce((v_result->>'changed')::boolean,false); v_revision := coalesce((v_result->>'revision')::bigint,p_expected_revision);
  if v_old_preset is distinct from p_module_preset then
    if not v_changed then v_revision := v_revision+1; end if;
    update public.stores set module_preset=p_module_preset,module_config_revision=v_revision,module_catalog_version=1,updated_at=now() where organization_id=p_organization_id and id=p_store_id;
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_organization_id,p_store_id,p_actor_user_id,'store.modules.preset_changed','store',p_store_id,jsonb_build_object('preset',v_old_preset),jsonb_build_object('preset',p_module_preset,'revision',v_revision));
  end if;
  return jsonb_build_object('changed',v_changed or v_old_preset is distinct from p_module_preset,'revision',v_revision,'preset',p_module_preset);
end; $$;
revoke all on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) to service_role;
