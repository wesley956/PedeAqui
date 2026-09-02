-- PedeAqui — reconciliação do hotfix remoto 20260902053415.
-- Mantém o trial como contrato da assinatura e evita duplicar a autoridade em public.stores.

create or replace function private.bootstrap_commercial_organization(
  p_organization_name text,
  p_store_name text,
  p_store_slug text,
  p_business_type text,
  p_plan_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_existing_org_id uuid;
  v_existing_store_id uuid;
  v_plan public.plans%rowtype;
  v_trial_days integer := 15;
  v_setting jsonb;
  v_started_at timestamptz := now();
  v_trial_ends_at timestamptz;
  v_result jsonb;
  v_org_id uuid;
  v_store_id uuid;
  v_subscription_id uuid;
  v_modules text[];
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text,0));

  select m.organization_id,s.id
    into v_existing_org_id,v_existing_store_id
  from public.organization_members m
  join public.stores s
    on s.organization_id=m.organization_id and s.status='active'
  where m.user_id=v_actor_id and m.status='active'
  order by s.is_primary desc,s.created_at,s.id
  limit 1;

  if v_existing_org_id is not null and v_existing_store_id is not null then
    return jsonb_build_object(
      'organization_id',v_existing_org_id,
      'store_id',v_existing_store_id,
      'reused',true
    );
  end if;

  if p_plan_key not in ('essential','professional','management') then
    raise exception 'invalid commercial plan';
  end if;

  select * into v_plan
  from public.plans
  where key=p_plan_key and active=true;
  if v_plan.id is null then raise exception 'commercial plan unavailable'; end if;
  if v_plan.monthly_price_cents is null then raise exception 'commercial plan has no monthly price'; end if;

  select value into v_setting
  from public.platform_settings
  where key='commercial_trial_days' and active=true
  limit 1;

  if v_setting is not null then
    begin
      if jsonb_typeof(v_setting)='number' then
        v_trial_days := (v_setting::text)::integer;
      elsif jsonb_typeof(v_setting)='string' then
        v_trial_days := trim(both '"' from v_setting::text)::integer;
      elsif jsonb_typeof(v_setting)='object' and v_setting ? 'days' then
        v_trial_days := (v_setting->>'days')::integer;
      end if;
    exception when others then
      v_trial_days := 15;
    end;
  end if;
  if v_trial_days<1 or v_trial_days>90 then v_trial_days:=15; end if;
  v_trial_ends_at := v_started_at + make_interval(days=>v_trial_days);

  v_modules := private.commercial_plan_modules(v_plan.id,p_business_type);

  v_result := private.bootstrap_organization(p_organization_name,p_store_name,p_store_slug);
  v_org_id := (v_result->>'organization_id')::uuid;
  v_store_id := (v_result->>'store_id')::uuid;

  insert into public.organization_subscriptions(
    organization_id,plan_id,plan_version_id,status,billing_interval,
    current_period_start,current_period_end,trial_ends_at,next_due_at,
    agreed_price_cents,price_currency,price_locked,payment_status,grace_period_days,
    idempotency_key,metadata
  ) values (
    v_org_id,v_plan.id,v_plan.current_version_id,'trialing','month',
    v_started_at,v_trial_ends_at,v_trial_ends_at,v_trial_ends_at,
    v_plan.monthly_price_cents,coalesce(v_plan.currency,'BRL'),false,'not_started',3,
    'commercial-onboarding:'||v_org_id::text,
    jsonb_build_object(
      'source','commercial_onboarding',
      'selected_plan_key',v_plan.key,
      'trial_days',v_trial_days,
      'atomic_bootstrap',true
    )
  ) returning id into v_subscription_id;

  update public.stores
  set business_type=p_business_type,
      module_preset='custom',
      module_catalog_version=2,
      module_config_revision=0,
      updated_at=v_started_at
  where id=v_store_id and organization_id=v_org_id;

  with module_catalog(module_key) as (values
    ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),
    ('deliveries'),('driver'),('inventory'),('gas_containers'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings')
  )
  insert into public.store_modules(
    organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by
  )
  select v_org_id,v_store_id,c.module_key,c.module_key=any(v_modules),'preset',2,v_actor_id
  from module_catalog c
  on conflict(store_id,module_key) do update
    set enabled=excluded.enabled,
        configuration_source=excluded.configuration_source,
        catalog_version=excluded.catalog_version,
        updated_by=excluded.updated_by,
        updated_at=v_started_at;

  insert into public.subscription_history(
    organization_id,subscription_id,from_status,to_status,event_type,idempotency_key,metadata
  ) values (
    v_org_id,v_subscription_id,null,'trialing','commercial_onboarding_started',
    'commercial-onboarding-started:'||v_subscription_id::text,
    jsonb_build_object('plan_key',v_plan.key,'trial_days',v_trial_days,'trial_ends_at',v_trial_ends_at)
  );

  insert into public.audit_logs(
    organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data
  ) values (
    v_org_id,v_store_id,v_actor_id,'organization.commercial_bootstrap','store',v_store_id,
    jsonb_build_object(
      'business_type',p_business_type,
      'plan_key',v_plan.key,
      'subscription_id',v_subscription_id,
      'enabled_modules',to_jsonb(v_modules),
      'trial_days',v_trial_days,
      'trial_ends_at',v_trial_ends_at,
      'catalog_version',2
    )
  );

  return v_result || jsonb_build_object(
    'reused',false,
    'subscription_id',v_subscription_id,
    'plan_key',v_plan.key,
    'trial_ends_at',v_trial_ends_at,
    'enabled_modules',to_jsonb(v_modules)
  );
end;
$function$;

revoke all on function private.bootstrap_commercial_organization(text,text,text,text,text) from public,anon;
grant execute on function private.bootstrap_commercial_organization(text,text,text,text,text) to authenticated,service_role;
