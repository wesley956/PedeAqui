-- PedeAqui — composer comercial v1
-- Pacote, pacote + módulos e personalizado para organizações com uma única unidade ativa.
-- Não cria contratos automaticamente durante a migration.

-- Catálogo comercial dos módulos. O metadata é informativo: NÃO ativa gate no app.
with module_features(key,name,metadata) as (
  values
    ('module.dashboard','Dashboard',jsonb_build_object('source','module_catalog','module_key','dashboard','kind','core','group','operation','commercial_sellable',false)),
    ('module.orders','Pedidos',jsonb_build_object('source','module_catalog','module_key','orders','kind','core','group','operation','commercial_sellable',false)),
    ('module.conversations','Conversas',jsonb_build_object('source','module_catalog','module_key','conversations','kind','optional','group','relationship','commercial_sellable',true)),
    ('module.dining','Salão e mesas',jsonb_build_object('source','module_catalog','module_key','dining','kind','segmented','group','operation','commercial_sellable',true,'dependencies',jsonb_build_array('orders','catalog'),'supported_business_types',jsonb_build_array('restaurant'))),
    ('module.catalog','Cardápio e catálogo',jsonb_build_object('source','module_catalog','module_key','catalog','kind','core','group','management','commercial_sellable',false)),
    ('module.pdv','PDV',jsonb_build_object('source','module_catalog','module_key','pdv','kind','optional','group','operation','commercial_sellable',true,'dependencies',jsonb_build_array('orders','catalog'))),
    ('module.cash','Caixa',jsonb_build_object('source','module_catalog','module_key','cash','kind','optional','group','management','commercial_sellable',true,'dependencies',jsonb_build_array('orders'))),
    ('module.finance','Financeiro',jsonb_build_object('source','module_catalog','module_key','finance','kind','optional','group','management','commercial_sellable',true)),
    ('module.fiscal','Fiscal',jsonb_build_object('source','module_catalog','module_key','fiscal','kind','optional','group','management','commercial_sellable',true,'dependencies',jsonb_build_array('orders'))),
    ('module.production','Produção',jsonb_build_object('source','module_catalog','module_key','production','kind','optional','group','operation','commercial_sellable',true,'dependencies',jsonb_build_array('orders'))),
    ('module.deliveries','Entregas',jsonb_build_object('source','module_catalog','module_key','deliveries','kind','optional','group','operation','commercial_sellable',true,'dependencies',jsonb_build_array('orders'))),
    ('module.driver','Entregadores',jsonb_build_object('source','module_catalog','module_key','driver','kind','optional','group','operation','commercial_sellable',true,'dependencies',jsonb_build_array('deliveries'))),
    ('module.inventory','Estoque',jsonb_build_object('source','module_catalog','module_key','inventory','kind','optional','group','supplies','commercial_sellable',true)),
    ('module.gas_containers','Vasilhames',jsonb_build_object('source','module_catalog','module_key','gas_containers','kind','segmented','group','supplies','commercial_sellable',true,'supported_business_types',jsonb_build_array('gas'))),
    ('module.suppliers','Fornecedores',jsonb_build_object('source','module_catalog','module_key','suppliers','kind','optional','group','supplies','commercial_sellable',true)),
    ('module.purchases','Compras',jsonb_build_object('source','module_catalog','module_key','purchases','kind','optional','group','supplies','commercial_sellable',true,'dependencies',jsonb_build_array('inventory','suppliers'))),
    ('module.customers','Clientes',jsonb_build_object('source','module_catalog','module_key','customers','kind','core','group','relationship','commercial_sellable',false)),
    ('module.growth','Marketing e fidelização',jsonb_build_object('source','module_catalog','module_key','growth','kind','optional','group','relationship','commercial_sellable',true,'dependencies',jsonb_build_array('customers','orders'))),
    ('module.scale','Escala e BI',jsonb_build_object('source','module_catalog','module_key','scale','kind','optional','group','administration','commercial_sellable',true)),
    ('module.team','Equipe',jsonb_build_object('source','module_catalog','module_key','team','kind','optional','group','administration','commercial_sellable',true)),
    ('module.settings','Configurações',jsonb_build_object('source','module_catalog','module_key','settings','kind','core','group','administration','commercial_sellable',false))
)
insert into public.features(key,name,description,active,metadata)
select key,name,'Módulo comercial do PedeAqui.',true,metadata from module_features
on conflict(key) do update set
  name=excluded.name,
  active=true,
  metadata=coalesce(public.features.metadata,'{}'::jsonb)||excluded.metadata,
  updated_at=now();

-- Preserva a versão imutável do plano do assinante e passa a considerar add-ons ativos.
-- Um plano retirado de novas vendas (active=false) continua válido para contratos já ativos.
create or replace function private.organization_entitlement(
  p_organization_id uuid,
  p_feature_key text,
  p_at timestamptz default now()
) returns table(
  subscription_id uuid,
  plan_id uuid,
  plan_key text,
  subscription_status text,
  feature_id uuid,
  feature_key text,
  enabled boolean,
  limit_value bigint,
  period_start timestamptz,
  period_end timestamptz,
  used bigint
)
language sql stable security invoker set search_path='' as $$
  with sub as (
    select s.*,p.key as plan_key
    from public.organization_subscriptions s
    join public.plans p on p.id=s.plan_id
    where s.organization_id=p_organization_id
      and (
        (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at>p_at))
        or (s.status='active' and (s.current_period_end is null or s.current_period_end>p_at))
        or (s.status='past_due' and s.grace_ends_at is not null and s.grace_ends_at>p_at)
      )
    order by s.created_at desc limit 1
  ), plan_entitlement as (
    select sub.id as subscription_id,sub.plan_id,sub.plan_key,sub.status as subscription_status,
      f.id as feature_id,f.key as feature_key,coalesce(pvf.enabled,pf.enabled,false) as enabled,
      coalesce(pvf.limit_value,pf.limit_value) as limit_value,
      coalesce(sub.current_period_start,date_trunc('month',p_at)) as period_start,
      coalesce(sub.current_period_end,date_trunc('month',p_at)+interval '1 month') as period_end
    from sub
    join public.features f on f.active=true and f.key=p_feature_key
    left join public.plan_version_features pvf on sub.plan_version_id is not null and pvf.plan_version_id=sub.plan_version_id and pvf.feature_id=f.id
    left join public.plan_features pf on sub.plan_version_id is null and pf.plan_id=sub.plan_id and pf.feature_id=f.id
    where coalesce(pvf.enabled,pf.enabled,false)=true
  ), addon_entitlement as (
    select sub.id as subscription_id,sub.plan_id,sub.plan_key,sub.status as subscription_status,
      f.id as feature_id,f.key as feature_key,true as enabled,null::bigint as limit_value,
      coalesce(sub.current_period_start,date_trunc('month',p_at)) as period_start,
      coalesce(sub.current_period_end,date_trunc('month',p_at)+interval '1 month') as period_end
    from sub
    join public.subscription_addons a on a.subscription_id=sub.id and a.status='active' and a.starts_at<=p_at and (a.ends_at is null or a.ends_at>p_at)
    join public.features f on f.id=a.feature_id and f.active=true and f.key=p_feature_key
  ), entitlement as (
    select * from plan_entitlement
    union all
    select * from addon_entitlement
    limit 1
  )
  select e.subscription_id,e.plan_id,e.plan_key,e.subscription_status,e.feature_id,e.feature_key,e.enabled,e.limit_value,e.period_start,e.period_end,
    coalesce(c.used,0)::bigint as used
  from entitlement e
  left join public.feature_usage_counters c on c.organization_id=p_organization_id and c.feature_id=e.feature_id and c.period_start=e.period_start;
$$;
revoke all on function private.organization_entitlement(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function private.organization_entitlement(uuid,text,timestamptz) to service_role;

-- Corrige o caminho já existente de perfil comercial: "custom" precisa ser restaurável
-- com uma lista explícita, mas continua delegando validações e bloqueios ao motor modular.
create or replace function public.set_store_module_preset_internal(
  p_organization_id uuid,p_store_id uuid,p_module_preset text,p_enabled_modules text[],p_actor_user_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_changes jsonb; v_result jsonb; v_old_preset text; v_revision bigint; v_changed boolean;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_module_preset not in ('essential','complete','custom') then raise exception 'invalid restorable preset'; end if;
  if p_enabled_modules is null then raise exception 'enabled modules are required'; end if;
  if not (array['dashboard','orders','catalog','customers','settings']::text[] <@ p_enabled_modules) then raise exception 'core modules are required'; end if;
  select s.module_preset into v_old_preset from public.stores s where s.organization_id=p_organization_id and s.id=p_store_id;
  if v_old_preset is null then raise exception 'store not found'; end if;
  select jsonb_agg(jsonb_build_object('module_key',c.module_key,'enabled',c.module_key=any(p_enabled_modules))) into v_changes
  from (values ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),('deliveries'),('driver'),('inventory'),('gas_containers'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings')) c(module_key);
  v_result := public.set_store_modules_internal(p_organization_id,p_store_id,v_changes,'preset',p_actor_user_id,p_expected_revision);
  v_changed := coalesce((v_result->>'changed')::boolean,false); v_revision := coalesce((v_result->>'revision')::bigint,p_expected_revision);
  if v_old_preset is distinct from p_module_preset then
    if not v_changed then v_revision := v_revision+1; end if;
    update public.stores set module_preset=p_module_preset,module_config_revision=v_revision,module_catalog_version=2,updated_at=now() where organization_id=p_organization_id and id=p_store_id;
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_organization_id,p_store_id,p_actor_user_id,'store.modules.preset_changed','store',p_store_id,jsonb_build_object('preset',v_old_preset),jsonb_build_object('preset',p_module_preset,'revision',v_revision));
  end if;
  return jsonb_build_object('changed',v_changed or v_old_preset is distinct from p_module_preset,'revision',v_revision,'preset',p_module_preset);
end; $$;
revoke all on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) to service_role;

-- Aplica a composição em uma única transação. V1 é deliberadamente single-unit.
-- Add-ons aqui são apenas features module.*; outros add-ons da organização são preservados.
create or replace function public.platform_commercial_composition_apply_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_mode text,
  p_plan_id uuid,
  p_base_price_cents integer,
  p_module_items jsonb,
  p_billing_due_day smallint,
  p_next_due_at timestamptz,
  p_payment_status text,
  p_price_locked boolean,
  p_price_lock_reason text,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text,
  p_idempotency_key text,
  p_expected_module_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.organization_subscriptions%rowtype;
  v_store public.stores%rowtype;
  v_current public.organization_subscriptions%rowtype;
  v_enabled_modules text[];
  v_item jsonb;
  v_module_key text;
  v_price integer;
  v_feature public.features%rowtype;
  v_addon public.subscription_addons%rowtype;
  v_total_addons integer:=0;
  v_active_stores integer;
  v_module_result jsonb;
  v_existing_history public.subscription_history%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_mode not in ('package','package_plus_addons','custom') then raise exception 'invalid commercial composition mode'; end if;
  if p_base_price_cents is null or p_base_price_cents not between 0 and 100000000 then raise exception 'invalid base price'; end if;
  if jsonb_typeof(coalesce(p_module_items,'[]'::jsonb))<>'array' then raise exception 'module items must be an array'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 or char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'reason and protocol required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 180 then raise exception 'idempotency key required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('commercial-composer:'||p_organization_id::text,0));
  select * into v_existing_history from public.subscription_history where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key)||':terms';
  if v_existing_history.id is not null then
    select * into v_sub from public.organization_subscriptions where id=v_existing_history.subscription_id;
    return jsonb_build_object('subscription_id',v_sub.id,'idempotent',true,'total_price_cents',v_sub.agreed_price_cents);
  end if;

  select count(*)::integer into v_active_stores from public.stores where organization_id=p_organization_id and status='active';
  if v_active_stores<>1 then raise exception 'multiunit_commercial_scope_not_configured'; end if;
  select * into v_store from public.stores where id=p_store_id and organization_id=p_organization_id and status='active' for update;
  if v_store.id is null then raise exception 'active store not found'; end if;
  select * into v_plan from public.plans where id=p_plan_id and active=true;
  if v_plan.id is null or v_plan.current_version_id is null then raise exception 'active versioned plan required'; end if;

  select * into v_current from public.organization_subscriptions where organization_id=p_organization_id and status in ('trialing','active','past_due') order by created_at desc limit 1 for update;
  if v_current.id is not null and v_current.price_locked and (v_current.plan_id<>p_plan_id or v_current.agreed_price_cents is distinct from p_base_price_cents or not p_price_locked) then
    raise exception 'protected_price_requires_dedicated_change';
  end if;

  select coalesce(array_agg(distinct trim(item->>'module_key')),'{}'::text[]) into v_enabled_modules
  from jsonb_array_elements(coalesce(p_module_items,'[]'::jsonb)) item
  where coalesce((item->>'enabled')::boolean,true)=true;
  if not (array['dashboard','orders','catalog','customers','settings']::text[] <@ v_enabled_modules) then raise exception 'core modules are required'; end if;

  -- Pacote puro não aceita extras pagos; pacote + extras/custom exigem preço positivo para itens fora da base.
  for v_item in select value from jsonb_array_elements(coalesce(p_module_items,'[]'::jsonb)) loop
    v_module_key:=trim(v_item->>'module_key');
    if v_module_key is null or v_module_key='' or ('module.'||v_module_key) not in (select key from public.features where metadata->>'source'='module_catalog') then raise exception 'unknown commercial module'; end if;
    if coalesce((v_item->>'enabled')::boolean,true)=false then continue; end if;
    v_price:=coalesce((v_item->>'price_cents')::integer,0);
    if p_mode='package' and v_price<>0 then raise exception 'package mode cannot contain paid module extras'; end if;
    if not coalesce((v_item->>'included_in_base')::boolean,false) and p_mode in ('package_plus_addons','custom') and v_price<1 then raise exception 'paid module price is required'; end if;
    if coalesce((v_item->>'included_in_base')::boolean,false) and v_price<>0 then raise exception 'base module cannot have addon price'; end if;
  end loop;

  v_sub:=public.subscription_apply_internal(p_organization_id,v_plan.key,'active',trim(p_idempotency_key)||':subscription','platform.commercial_composition_applied','month',null,null,null,null,false,null,null,null,jsonb_build_object('commercial_mode',p_mode,'store_id',p_store_id));
  v_sub:=public.subscription_terms_update_internal(p_organization_id,p_base_price_cents,p_price_locked,p_price_lock_reason,p_billing_due_day,p_next_due_at,p_payment_status,p_reason,p_protocol,trim(p_idempotency_key)||':terms',p_actor_user_id);

  -- Cancela somente add-ons module.* que não estão mais contratados como extras.
  update public.subscription_addons a set status='cancelled',ends_at=coalesce(ends_at,now()),updated_at=now()
  where a.subscription_id=v_sub.id and a.status in ('scheduled','active')
    and exists(select 1 from public.features f where f.id=a.feature_id and f.key like 'module.%')
    and not exists(
      select 1 from jsonb_array_elements(p_module_items) item
      join public.features f on f.key='module.'||trim(item->>'module_key')
      where f.id=a.feature_id and coalesce((item->>'enabled')::boolean,true)=true
        and not coalesce((item->>'included_in_base')::boolean,false)
    );

  for v_item in select value from jsonb_array_elements(p_module_items) loop
    if coalesce((v_item->>'enabled')::boolean,true)=false or coalesce((v_item->>'included_in_base')::boolean,false) then continue; end if;
    v_module_key:=trim(v_item->>'module_key'); v_price:=(v_item->>'price_cents')::integer;
    select * into v_feature from public.features where key='module.'||v_module_key and active=true;
    select * into v_addon from public.subscription_addons where subscription_id=v_sub.id and feature_id=v_feature.id and status in ('scheduled','active') order by created_at desc limit 1 for update;
    if v_addon.id is null then
      insert into public.subscription_addons(organization_id,subscription_id,feature_id,feature_name_snapshot,unit_price_cents,status,starts_at,accepted_at,accepted_by,reason,protocol,created_by)
      values(p_organization_id,v_sub.id,v_feature.id,v_feature.name,v_price,'active',now(),now(),p_actor_user_id,trim(p_reason),trim(p_protocol),p_actor_user_id)
      returning * into v_addon;
      insert into public.subscription_change_requests(organization_id,subscription_id,change_type,status,current_plan_id,current_plan_version_id,feature_id,feature_name_snapshot,current_base_price_cents,current_addons_price_cents,proposed_base_price_cents,proposed_addons_price_cents,effective_at,accepted_at,accepted_by,applied_at,reason,protocol,created_by)
      values(p_organization_id,v_sub.id,'add_on','applied',v_sub.plan_id,v_sub.plan_version_id,v_feature.id,v_feature.name,p_base_price_cents,v_total_addons,p_base_price_cents,v_total_addons+v_price,now(),now(),p_actor_user_id,now(),trim(p_reason),trim(p_protocol),p_actor_user_id);
    elsif v_addon.unit_price_cents<>v_price then
      update public.subscription_addons set status='cancelled',ends_at=coalesce(ends_at,now()),updated_at=now() where id=v_addon.id;
      insert into public.subscription_addons(organization_id,subscription_id,feature_id,feature_name_snapshot,unit_price_cents,status,starts_at,accepted_at,accepted_by,reason,protocol,created_by)
      values(p_organization_id,v_sub.id,v_feature.id,v_feature.name,v_price,'active',now(),now(),p_actor_user_id,trim(p_reason),trim(p_protocol),p_actor_user_id);
    end if;
    v_total_addons:=v_total_addons+v_price;
  end loop;

  v_module_result:=public.set_store_module_preset_internal(p_organization_id,p_store_id,'custom',v_enabled_modules,p_actor_user_id,p_expected_module_revision);

  update public.organization_subscriptions set metadata=metadata||jsonb_build_object('commercial_mode',p_mode,'commercial_store_id',p_store_id,'commercial_addons_price_cents',v_total_addons,'commercial_total_price_cents',p_base_price_cents+v_total_addons),updated_at=now() where id=v_sub.id returning * into v_sub;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(p_organization_id,p_actor_user_id,'platform.commercial_composition.applied','organization_subscription',v_sub.id,jsonb_build_object('mode',p_mode,'store_id',p_store_id,'base_price_cents',p_base_price_cents,'addons_price_cents',v_total_addons,'total_price_cents',p_base_price_cents+v_total_addons,'modules',p_module_items,'module_result',v_module_result),trim(p_reason),trim(p_protocol));
  return jsonb_build_object('subscription_id',v_sub.id,'store_id',p_store_id,'mode',p_mode,'base_price_cents',p_base_price_cents,'addons_price_cents',v_total_addons,'total_price_cents',p_base_price_cents+v_total_addons,'module_result',v_module_result,'idempotent',false);
end; $$;
revoke all on function public.platform_commercial_composition_apply_internal(uuid,uuid,text,uuid,integer,jsonb,smallint,timestamptz,text,boolean,text,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.platform_commercial_composition_apply_internal(uuid,uuid,text,uuid,integer,jsonb,smallint,timestamptz,text,boolean,text,uuid,text,text,text,bigint) to service_role;