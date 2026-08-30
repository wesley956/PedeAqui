-- PedeAqui — catálogo comercial oficial v1
-- Consolida preços públicos, composição-base dos pacotes e o plano personalizado.
-- Não cria assinaturas e não altera módulos de nenhuma unidade.

-- Preços públicos aprovados. Fundadores permanece protegido em R$ 79,90.
update public.plans
set name='Essencial',
    description='Para pequenos negócios começarem com cardápio, pedidos, clientes e operação essencial.',
    monthly_price_cents=8990,
    currency='BRL',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_tier','essential','public_price',true),
    updated_at=now()
where key='essential';

update public.plans
set name='Profissional',
    description='Plano principal do PedeAqui para delivery e restaurante em operação, com recursos avançados de relacionamento, entregas e produção.',
    monthly_price_cents=12990,
    currency='BRL',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_tier','professional','public_price',true,'recommended',true),
    updated_at=now()
where key='professional';

-- Mantemos a key histórica "management" para não quebrar contratos/rotas; o nome comercial passa a ser Completo.
update public.plans
set name='Completo',
    description='Gestão completa do estabelecimento com operação, PDV, caixa, financeiro, estoque, compras e recursos administrativos avançados.',
    monthly_price_cents=17990,
    currency='BRL',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_tier','complete','public_price',true,'legacy_key','management'),
    updated_at=now()
where key='management';

update public.plans
set monthly_price_cents=7990,
    currency='BRL',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_tier','founders','public_price',false,'price_locked',true,'founder_capacity',3),
    updated_at=now()
where key='founders';

insert into public.plans(key,name,description,active,position,monthly_price_cents,yearly_price_cents,currency,metadata)
values(
  'custom','Personalizado','Monte seu plano: base do PedeAqui com módulos adicionais escolhidos conforme a operação.',true,40,6990,null,'BRL',
  jsonb_build_object('commercial_tier','custom','commercial_mode','custom','public_price',true,'base_price_cents',6990)
)
on conflict(key) do update set
  name=excluded.name,
  description=excluded.description,
  active=true,
  position=excluded.position,
  monthly_price_cents=6990,
  yearly_price_cents=null,
  currency='BRL',
  metadata=coalesce(public.plans.metadata,'{}'::jsonb)||excluded.metadata,
  updated_at=now();

-- Preços avulsos atuais. Fiscal e Vasilhames ficam fora da venda pública até definição específica.
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',1990,'commercial_sellable',true) where key='module.conversations';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',2490,'commercial_sellable',true) where key='module.deliveries';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',1490,'commercial_sellable',true) where key='module.driver';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',1990,'commercial_sellable',true) where key='module.growth';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',1990,'commercial_sellable',true) where key='module.production';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',2990,'commercial_sellable',true) where key='module.pdv';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',2490,'commercial_sellable',true) where key='module.cash';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',2490,'commercial_sellable',true) where key='module.dining';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',2990,'commercial_sellable',true) where key='module.finance';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',2990,'commercial_sellable',true) where key='module.inventory';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',990,'commercial_sellable',true) where key='module.suppliers';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',1990,'commercial_sellable',true) where key='module.purchases';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',1490,'commercial_sellable',true) where key='module.team';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_price_cents',2990,'commercial_sellable',true) where key='module.scale';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_sellable',false,'commercial_maturity','pending') where key='module.fiscal';
update public.features set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('commercial_sellable',false,'commercial_maturity','segmented') where key='module.gas_containers';

-- Liga a composição técnica dos pacotes sem remover features legadas já existentes.
with package_modules(plan_key,module_key) as (
  values
    ('essential','dashboard'),('essential','orders'),('essential','catalog'),('essential','customers'),('essential','settings'),
    ('professional','dashboard'),('professional','orders'),('professional','catalog'),('professional','customers'),('professional','settings'),
    ('professional','conversations'),('professional','deliveries'),('professional','driver'),('professional','growth'),('professional','production'),
    ('management','dashboard'),('management','orders'),('management','catalog'),('management','customers'),('management','settings'),
    ('management','conversations'),('management','deliveries'),('management','driver'),('management','growth'),('management','production'),
    ('management','pdv'),('management','cash'),('management','dining'),('management','finance'),('management','inventory'),
    ('management','suppliers'),('management','purchases'),('management','team'),('management','scale'),
    ('custom','dashboard'),('custom','orders'),('custom','catalog'),('custom','customers'),('custom','settings')
)
insert into public.plan_features(plan_id,feature_id,enabled,updated_at)
select p.id,f.id,true,now()
from package_modules pm
join public.plans p on p.key=pm.plan_key
join public.features f on f.key='module.'||pm.module_key
on conflict(plan_id,feature_id) do update set enabled=true,updated_at=now();

-- Cria uma versão imutável do catálogo v1 quando houver super_admin ativo.
-- Em ambientes vazios sem usuário administrativo, a versão poderá ser criada pelo ADM depois do bootstrap.
do $$
declare
  v_actor uuid;
  v_plan record;
  v_version integer;
  v_version_id uuid;
begin
  select user_id into v_actor
  from public.platform_admins
  where active=true and role='super_admin'
  order by created_at
  limit 1;

  if v_actor is null then return; end if;

  for v_plan in
    select p.* from public.plans p where p.key in ('essential','professional','management','custom') order by p.position,p.key
  loop
    if exists(select 1 from public.plan_versions pv where pv.plan_id=v_plan.id and pv.protocol='PA-CATALOG-V1-'||upper(v_plan.key)) then
      continue;
    end if;

    select coalesce(max(version),0)+1 into v_version from public.plan_versions where plan_id=v_plan.id;
    insert into public.plan_versions(plan_id,version,name,description,monthly_price_cents,yearly_price_cents,currency,effective_at,reason,protocol,created_by)
    values(v_plan.id,v_version,v_plan.name,v_plan.description,v_plan.monthly_price_cents,v_plan.yearly_price_cents,'BRL',now(),'Catálogo comercial oficial v1 do PedeAqui.','PA-CATALOG-V1-'||upper(v_plan.key),v_actor)
    returning id into v_version_id;

    insert into public.plan_version_features(plan_version_id,feature_id,enabled,limit_value)
    select v_version_id,pf.feature_id,pf.enabled,pf.limit_value
    from public.plan_features pf
    where pf.plan_id=v_plan.id;

    update public.plans set current_version_id=v_version_id,updated_at=now() where id=v_plan.id;
  end loop;
end $$;

-- Corrige o preset personalizado sem exigir que o super_admin seja membro comum da organização.
-- O motor modular continua responsável por dependências, permissões internas e bloqueadores operacionais.
create or replace function public.set_store_module_preset_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_module_preset text,
  p_enabled_modules text[],
  p_actor_user_id uuid,
  p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_changes jsonb;
  v_result jsonb;
  v_old_preset text;
  v_revision bigint;
  v_changed boolean;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_module_preset not in ('essential','complete','custom') then raise exception 'invalid restorable preset'; end if;
  if p_enabled_modules is null then raise exception 'enabled modules are required'; end if;
  if not (array['dashboard','orders','catalog','customers','settings']::text[] <@ p_enabled_modules) then raise exception 'core modules are required'; end if;

  select s.module_preset into v_old_preset
  from public.stores s
  where s.organization_id=p_organization_id and s.id=p_store_id and s.status='active';
  if v_old_preset is null then raise exception 'store not found'; end if;

  select jsonb_agg(jsonb_build_object('module_key',c.module_key,'enabled',c.module_key=any(p_enabled_modules))) into v_changes
  from (values
    ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),
    ('deliveries'),('driver'),('inventory'),('gas_containers'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings')
  ) c(module_key);

  -- "preset" mantém o caminho administrativo server-side; "manual" exigiria stores.manage do membro da organização.
  v_result:=public.set_store_modules_internal(p_organization_id,p_store_id,v_changes,'preset',p_actor_user_id,p_expected_revision);
  v_changed:=coalesce((v_result->>'changed')::boolean,false);
  v_revision:=coalesce((v_result->>'revision')::bigint,p_expected_revision);

  if v_old_preset is distinct from p_module_preset then
    if not v_changed then v_revision:=v_revision+1; end if;
    update public.stores
    set module_preset=p_module_preset,module_config_revision=v_revision,module_catalog_version=2,updated_at=now()
    where organization_id=p_organization_id and id=p_store_id;

    insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_organization_id,p_store_id,p_actor_user_id,'store.modules.preset_changed','store',p_store_id,
      jsonb_build_object('preset',v_old_preset),jsonb_build_object('preset',p_module_preset,'revision',v_revision));
  end if;

  return jsonb_build_object('changed',v_changed or v_old_preset is distinct from p_module_preset,'revision',v_revision,'preset',p_module_preset);
end; $$;

revoke all on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) to service_role;
