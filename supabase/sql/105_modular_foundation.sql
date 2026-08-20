-- PedeAqui — ciclo modular [352]–[356]
-- Fundação aditiva e backward-compatible para perfil do negócio e módulos por unidade.
-- Desativar um módulo altera somente disponibilidade; nenhum dado de domínio é removido.

alter table public.stores add column if not exists business_type text not null default 'restaurant';
alter table public.stores add column if not exists module_preset text not null default 'complete';
alter table public.stores add column if not exists module_catalog_version integer not null default 1;
alter table public.stores add column if not exists module_config_revision bigint not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stores_business_type_check') then
    alter table public.stores add constraint stores_business_type_check
      check (business_type in ('restaurant','gas','generic_commerce'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_module_preset_check') then
    alter table public.stores add constraint stores_module_preset_check
      check (module_preset in ('essential','complete','custom'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_module_catalog_version_check') then
    alter table public.stores add constraint stores_module_catalog_version_check
      check (module_catalog_version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_module_config_revision_check') then
    alter table public.stores add constraint stores_module_config_revision_check
      check (module_config_revision >= 0);
  end if;
end $$;

create table if not exists public.store_modules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  module_key text not null check (module_key in (
    'dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production',
    'deliveries','driver','inventory','suppliers','purchases','customers','growth','scale','team','settings'
  )),
  enabled boolean not null default true,
  configuration_source text not null default 'migration'
    check (configuration_source in ('preset','manual','migration','support')),
  catalog_version integer not null default 1 check (catalog_version >= 1),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, module_key),
  constraint store_modules_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint store_modules_core_enabled_check check (
    module_key not in ('dashboard','orders','catalog','customers','settings') or enabled
  )
);

create index if not exists store_modules_org_store_enabled_idx
  on public.store_modules(organization_id, store_id, enabled, module_key);

alter table public.store_modules enable row level security;
revoke all on table public.store_modules from anon, authenticated;
grant select on table public.store_modules to authenticated;
grant select, insert, update, delete on table public.store_modules to service_role;

drop policy if exists store_modules_select_authorized on public.store_modules;
create policy store_modules_select_authorized on public.store_modules
for select to authenticated
using (private.can_access_store(organization_id, store_id));

-- Todos os estabelecimentos existentes eram restaurantes antes deste ciclo. O backfill
-- habilita exatamente todas as superfícies atuais para que a introdução do modelo não
-- esconda nada no primeiro acesso pós-migração.
with module_catalog(module_key) as (
  values
    ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),
    ('deliveries'),('driver'),('inventory'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings')
)
insert into public.store_modules(
  organization_id, store_id, module_key, enabled, configuration_source, catalog_version
)
select s.organization_id, s.id, c.module_key, true, 'migration', 1
from public.stores s
cross join module_catalog c
on conflict (store_id, module_key) do nothing;

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
set search_path = ''
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
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'module changes must be a non-empty array';
  end if;

  select s.module_config_revision, s.business_type
  into v_revision, v_business_type
  from public.stores s
  where s.id = p_store_id and s.organization_id = p_organization_id
  for update;

  if v_revision is null then raise exception 'store not found'; end if;
  if v_revision <> p_expected_revision then raise exception 'module configuration revision conflict'; end if;

  if p_source <> 'support' and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.status = 'active'
      and (
        exists (
          select 1 from public.roles r
          join public.role_permissions rp on rp.role_id = r.id
          join public.permissions p on p.id = rp.permission_id and p.key = 'stores.manage'
          where r.id = m.role_id and r.organization_id = p_organization_id
        )
        or exists (
          select 1 from public.user_store_roles usr
          join public.roles r on r.id = usr.role_id and r.organization_id = usr.organization_id
          join public.role_permissions rp on rp.role_id = r.id
          join public.permissions p on p.id = rp.permission_id and p.key = 'stores.manage'
          where usr.organization_id = p_organization_id
            and usr.store_id = p_store_id
            and usr.user_id = p_actor_user_id
        )
      )
  ) then
    raise exception 'actor cannot manage store modules';
  end if;

  select coalesce(jsonb_object_agg(sm.module_key, sm.enabled), '{}'::jsonb)
  into v_before
  from public.store_modules sm
  where sm.organization_id = p_organization_id and sm.store_id = p_store_id;

  for v_item in select value from jsonb_array_elements(p_changes)
  loop
    v_key := trim(coalesce(v_item->>'module_key',''));
    if v_key not in (
      'dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production',
      'deliveries','driver','inventory','suppliers','purchases','customers','growth','scale','team','settings'
    ) then raise exception 'unknown module key: %', v_key; end if;
    if not (v_item ? 'enabled') then raise exception 'enabled is required for module %', v_key; end if;
    v_enabled := (v_item->>'enabled')::boolean;

    insert into public.store_modules(
      organization_id, store_id, module_key, enabled, configuration_source, catalog_version, updated_by
    ) values (
      p_organization_id, p_store_id, v_key, v_enabled, p_source, 1, p_actor_user_id
    )
    on conflict (store_id, module_key) do update set
      enabled = excluded.enabled,
      configuration_source = excluded.configuration_source,
      catalog_version = excluded.catalog_version,
      updated_by = excluded.updated_by,
      updated_at = now();
  end loop;

  -- Perfis não gastronômicos não podem habilitar Salão por chamada direta.
  if v_business_type <> 'restaurant' and exists (
    select 1 from public.store_modules sm
    where sm.organization_id = p_organization_id and sm.store_id = p_store_id
      and sm.module_key = 'dining' and sm.enabled
  ) then
    raise exception 'dining is not supported by business profile';
  end if;

  -- Defesa em profundidade das dependências declaradas no catálogo TypeScript.
  if exists (
    with dependencies(module_key, dependency_key) as (
      values
        ('dining','orders'),('dining','catalog'),
        ('pdv','orders'),('pdv','catalog'),
        ('cash','orders'),('fiscal','orders'),('production','orders'),
        ('deliveries','orders'),('driver','deliveries'),
        ('purchases','inventory'),('purchases','suppliers'),
        ('growth','customers'),('growth','orders')
    )
    select 1
    from dependencies d
    join public.store_modules m
      on m.organization_id = p_organization_id and m.store_id = p_store_id
      and m.module_key = d.module_key and m.enabled
    left join public.store_modules dep
      on dep.organization_id = p_organization_id and dep.store_id = p_store_id
      and dep.module_key = d.dependency_key and dep.enabled
    where dep.module_key is null
  ) then
    raise exception 'module dependency violation';
  end if;

  -- Bloqueios operacionais: desligar não pode abandonar uma operação crítica aberta.
  if exists (
    select 1 from public.store_modules sm
    where sm.organization_id = p_organization_id and sm.store_id = p_store_id
      and sm.module_key = 'cash' and not sm.enabled
  ) and exists (
    select 1 from public.cash_sessions cs
    where cs.organization_id = p_organization_id and cs.store_id = p_store_id and cs.status = 'open'
  ) then raise exception 'cash_session_open'; end if;

  if exists (
    select 1 from public.store_modules sm
    where sm.organization_id = p_organization_id and sm.store_id = p_store_id
      and sm.module_key = 'dining' and not sm.enabled
  ) and exists (
    select 1 from public.tabs t
    where t.organization_id = p_organization_id and t.store_id = p_store_id and t.status in ('open','settling')
  ) then raise exception 'dining_tab_open'; end if;

  if exists (
    select 1 from public.store_modules sm
    where sm.organization_id = p_organization_id and sm.store_id = p_store_id
      and sm.module_key in ('deliveries','driver') and not sm.enabled
  ) and exists (
    select 1 from public.deliveries d
    where d.organization_id = p_organization_id and d.store_id = p_store_id
      and d.delivered_at is null and d.canceled_at is null
  ) then raise exception 'delivery_in_progress'; end if;

  select coalesce(jsonb_object_agg(sm.module_key, sm.enabled), '{}'::jsonb)
  into v_after
  from public.store_modules sm
  where sm.organization_id = p_organization_id and sm.store_id = p_store_id;

  if v_before = v_after then
    return jsonb_build_object('changed', false, 'revision', v_revision);
  end if;

  v_new_revision := v_revision + 1;
  update public.stores
  set module_config_revision = v_new_revision,
      module_catalog_version = 1,
      module_preset = case when p_source in ('manual','support') then 'custom' else module_preset end,
      updated_at = now()
  where id = p_store_id and organization_id = p_organization_id;

  insert into public.audit_logs(
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_organization_id, p_store_id, p_actor_user_id, 'store.modules.changed', 'store', p_store_id,
    jsonb_build_object('modules', v_before, 'revision', v_revision),
    jsonb_build_object('modules', v_after, 'revision', v_new_revision, 'source', p_source)
  );

  return jsonb_build_object('changed', true, 'revision', v_new_revision);
end;
$$;

revoke all on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint)
from public, anon, authenticated;
grant execute on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint)
to service_role;
