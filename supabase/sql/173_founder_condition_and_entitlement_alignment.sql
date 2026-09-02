-- Fundador é uma condição comercial sobre um plano-base público.
-- Migra assinaturas Fundador atuais para o menor plano público que cubra os módulos comerciais já ativos,
-- preservando preço contratado, trava de preço e founder_slot.
with founder_subscriptions as (
  select os.id as subscription_id, os.organization_id
  from public.organization_subscriptions os
  join public.plans current_plan on current_plan.id = os.plan_id
  where os.founder_slot is not null
    and os.status in ('trialing','active','past_due')
    and current_plan.key = 'founders'
),
required_features as (
  select fs.subscription_id, count(distinct f.id)::int as required_count
  from founder_subscriptions fs
  left join public.stores s
    on s.organization_id = fs.organization_id
   and s.status = 'active'
  left join public.store_modules sm
    on sm.store_id = s.id
   and sm.enabled = true
  left join public.features f
    on f.active = true
   and f.metadata->>'module_key' = sm.module_key
   and coalesce((f.metadata->>'commercial_sellable')::boolean, false) = true
  group by fs.subscription_id
),
candidate_plans as (
  select
    fs.subscription_id,
    p.id as plan_id,
    p.current_version_id,
    p.monthly_price_cents,
    p.position,
    rf.required_count,
    count(distinct pf.feature_id) filter (where pf.enabled = true and reqf.id is not null)::int as covered_count
  from founder_subscriptions fs
  join required_features rf on rf.subscription_id = fs.subscription_id
  cross join public.plans p
  left join public.stores s
    on s.organization_id = fs.organization_id
   and s.status = 'active'
  left join public.store_modules sm
    on sm.store_id = s.id
   and sm.enabled = true
  left join public.features reqf
    on reqf.active = true
   and reqf.metadata->>'module_key' = sm.module_key
   and coalesce((reqf.metadata->>'commercial_sellable')::boolean, false) = true
  left join public.plan_features pf
    on pf.plan_id = p.id
   and pf.feature_id = reqf.id
  where p.active = true
    and p.key in ('essential','professional','management')
  group by fs.subscription_id,p.id,p.current_version_id,p.monthly_price_cents,p.position,rf.required_count
),
chosen_plan as (
  select distinct on (subscription_id)
    subscription_id, plan_id, current_version_id
  from candidate_plans
  where covered_count = required_count
  order by subscription_id, monthly_price_cents asc nulls last, position asc
)
update public.organization_subscriptions os
set plan_id = cp.plan_id,
    plan_version_id = cp.current_version_id,
    metadata = coalesce(os.metadata,'{}'::jsonb) || jsonb_build_object(
      'founder_condition_model','base_plan_with_locked_price',
      'founder_condition_migrated_at',now()
    ),
    updated_at = now()
from chosen_plan cp
where os.id = cp.subscription_id;

-- O antigo plano Fundadores deixa de ser vendável/selecionável. Histórico é preservado.
update public.plans
set active = false,
    updated_at = now()
where key = 'founders' and active = true;

-- A atribuição de Fundador não troca mais o plano-base e não possui limite de vagas.
create or replace function public.subscription_founder_assign_internal(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
)
returns public.organization_subscriptions
language plpgsql
set search_path to ''
as $function$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_slot smallint;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  perform pg_advisory_xact_lock(hashtextextended('pedeaqui:founder-slots',0));

  select * into v_sub
  from public.organization_subscriptions
  where organization_id = p_organization_id
    and status in ('trialing','active','past_due')
  order by created_at desc
  limit 1
  for update;

  if v_sub.id is null then
    raise exception 'active subscription not found';
  end if;

  if v_sub.founder_slot is not null then
    return v_sub;
  end if;

  select (coalesce(max(founder_slot),0) + 1)::smallint
    into v_slot
  from public.organization_subscriptions
  where founder_slot is not null;

  update public.organization_subscriptions
  set founder_slot = v_slot,
      agreed_price_cents = 7990,
      price_locked = true,
      price_locked_at = coalesce(price_locked_at,now()),
      price_lock_reason = 'Condição Fundador PedeAqui: preço-base protegido',
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('founder_condition_model','base_plan_with_locked_price'),
      updated_at = now()
  where id = v_sub.id
  returning * into v_sub;

  insert into public.platform_financial_audit(
    organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol
  ) values (
    p_organization_id,p_actor_user_id,'platform.founder.assigned','organization_subscription',v_sub.id,
    jsonb_build_object(
      'founder_slot',v_slot,
      'base_plan_id',v_sub.plan_id,
      'agreed_price_cents',7990,
      'price_locked',true,
      'model','base_plan_with_locked_price'
    ),
    trim(p_reason),trim(p_protocol)
  );

  return v_sub;
end;
$function$;

-- Entitlement passa a ser sempre plano-base + adicionais aprovados.
-- Remove a exceção antiga que concedia todos os módulos ao plano técnico 'founders'.
create or replace function private.organization_entitlement(
  p_organization_id uuid,
  p_feature_key text,
  p_at timestamp with time zone default now()
)
returns table(
  subscription_id uuid,
  plan_id uuid,
  plan_key text,
  subscription_status text,
  feature_id uuid,
  feature_key text,
  enabled boolean,
  limit_value bigint,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  used bigint
)
language sql
stable
set search_path to ''
as $function$
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
    order by s.created_at desc
    limit 1
  ),
  plan_entitlement as (
    select
      sub.id as subscription_id,sub.plan_id,sub.plan_key,sub.status as subscription_status,
      f.id as feature_id,f.key as feature_key,
      coalesce(pvf.enabled,pf.enabled,false) as enabled,
      coalesce(pvf.limit_value,pf.limit_value) as limit_value,
      coalesce(sub.current_period_start,date_trunc('month',p_at)) as period_start,
      coalesce(sub.current_period_end,date_trunc('month',p_at)+interval '1 month') as period_end
    from sub
    join public.features f on f.active=true and f.key=p_feature_key
    left join public.plan_version_features pvf
      on sub.plan_version_id is not null
     and pvf.plan_version_id=sub.plan_version_id
     and pvf.feature_id=f.id
    left join public.plan_features pf
      on sub.plan_version_id is null
     and pf.plan_id=sub.plan_id
     and pf.feature_id=f.id
    where coalesce(pvf.enabled,pf.enabled,false)=true
  ),
  addon_entitlement as (
    select
      sub.id as subscription_id,sub.plan_id,sub.plan_key,sub.status as subscription_status,
      f.id as feature_id,f.key as feature_key,true as enabled,null::bigint as limit_value,
      coalesce(sub.current_period_start,date_trunc('month',p_at)) as period_start,
      coalesce(sub.current_period_end,date_trunc('month',p_at)+interval '1 month') as period_end
    from sub
    join public.subscription_addons a
      on a.subscription_id=sub.id
     and a.status='active'
     and a.starts_at<=p_at
     and (a.ends_at is null or a.ends_at>p_at)
    join public.features f on f.id=a.feature_id and f.active=true and f.key=p_feature_key
  ),
  entitlement as (
    select * from plan_entitlement
    union all
    select * from addon_entitlement
    limit 1
  )
  select
    e.subscription_id,e.plan_id,e.plan_key,e.subscription_status,e.feature_id,e.feature_key,
    e.enabled,e.limit_value,e.period_start,e.period_end,coalesce(c.used,0)::bigint
  from entitlement e
  left join public.feature_usage_counters c
    on c.organization_id=p_organization_id
   and c.feature_id=e.feature_id
   and c.period_start=e.period_start;
$function$;