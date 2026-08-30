-- PedeAqui — hardening do compositor comercial + job de renovação

create or replace function public.authorize_internal_job_internal(p_job_key text,p_token text)
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when p_token is null or length(p_token)<>64 then false
    else coalesce(
      extensions.digest(p_token,'sha256') = extensions.digest(
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name=case p_job_key
            when 'campaign_messages' then 'pedeaqui_internal_campaign_messages_token'
            when 'route_retention' then 'pedeaqui_internal_route_retention_token'
            when 'payment_reconciliation' then 'pedeaqui_internal_payment_reconciliation_token'
            when 'subscription_renewals' then 'pedeaqui_internal_subscription_renewals_token'
            else null
          end
          limit 1
        ),
        'sha256'
      ),
      false
    )
  end
$$;
revoke all on function public.authorize_internal_job_internal(text,text) from public,anon,authenticated;
grant execute on function public.authorize_internal_job_internal(text,text) to service_role;

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
  v_package_modules text[];
  v_included_modules text[];
  v_item jsonb;
  v_module_key text;
  v_price integer;
  v_feature public.features%rowtype;
  v_addon public.subscription_addons%rowtype;
  v_total_addons integer:=0;
  v_active_stores integer;
  v_module_result jsonb;
  v_existing_history public.subscription_history%rowtype;
  v_preset text;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_mode not in ('package','package_plus_addons','custom') then raise exception 'invalid commercial composition mode'; end if;
  if p_base_price_cents is null or p_base_price_cents not between 0 and 100000000 then raise exception 'invalid base price'; end if;
  if p_billing_due_day is not null and p_billing_due_day not between 1 and 28 then raise exception 'invalid billing due day'; end if;
  if p_payment_status not in ('not_started','pending','paid','overdue','waived') then raise exception 'invalid payment status'; end if;
  if jsonb_typeof(coalesce(p_module_items,'[]'::jsonb))<>'array' then raise exception 'module items must be an array'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 or char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'reason and protocol required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 180 then raise exception 'idempotency key required'; end if;
  if p_price_locked and char_length(trim(coalesce(p_price_lock_reason,'')))<5 then raise exception 'price lock reason required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('commercial-composer:'||p_organization_id::text,0));
  select * into v_existing_history
  from public.subscription_history
  where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key)||':terms';
  if v_existing_history.id is not null then
    select * into v_sub from public.organization_subscriptions where id=v_existing_history.subscription_id;
    return jsonb_build_object('subscription_id',v_sub.id,'idempotent',true,'total_price_cents',coalesce((v_sub.metadata->>'commercial_total_price_cents')::integer,v_sub.agreed_price_cents));
  end if;

  select count(*)::integer into v_active_stores from public.stores where organization_id=p_organization_id and status='active';
  if v_active_stores<>1 then raise exception 'multiunit_commercial_scope_not_configured'; end if;
  select * into v_store from public.stores where id=p_store_id and organization_id=p_organization_id and status='active' for update;
  if v_store.id is null then raise exception 'active store not found'; end if;
  if p_expected_module_revision is null or p_expected_module_revision<>v_store.module_config_revision then raise exception 'module_config_revision_conflict'; end if;

  select * into v_plan from public.plans where id=p_plan_id and active=true;
  if v_plan.id is null or v_plan.current_version_id is null then raise exception 'active versioned plan required'; end if;
  if p_mode='custom' and v_plan.key<>'custom' then raise exception 'custom mode requires custom plan'; end if;
  if p_mode<>'custom' and v_plan.key='custom' then raise exception 'package mode cannot use custom plan'; end if;
  if p_mode in ('package','package_plus_addons') and v_plan.monthly_price_cents is distinct from p_base_price_cents then raise exception 'package base price must match current plan price'; end if;
  if p_mode='custom' and p_base_price_cents<coalesce(v_plan.monthly_price_cents,6990) then raise exception 'custom base price below minimum'; end if;

  select * into v_current
  from public.organization_subscriptions
  where organization_id=p_organization_id and status in ('trialing','active','past_due')
  order by created_at desc limit 1 for update;
  if v_current.id is not null and v_current.price_locked and (
    v_current.plan_id<>p_plan_id or
    v_current.agreed_price_cents is distinct from p_base_price_cents or
    not p_price_locked
  ) then raise exception 'protected_price_requires_dedicated_change'; end if;

  select coalesce(array_agg(distinct trim(item->>'module_key')),'{}'::text[]) into v_enabled_modules
  from jsonb_array_elements(coalesce(p_module_items,'[]'::jsonb)) item
  where coalesce((item->>'enabled')::boolean,true)=true;
  if not (array['dashboard','orders','catalog','customers','settings']::text[] <@ v_enabled_modules) then raise exception 'core modules are required'; end if;

  select coalesce(array_agg(substring(f.key from 8)),'{}'::text[]) into v_package_modules
  from public.plan_version_features pvf
  join public.features f on f.id=pvf.feature_id
  where pvf.plan_version_id=v_plan.current_version_id and pvf.enabled=true and f.key like 'module.%';

  select coalesce(array_agg(distinct trim(item->>'module_key')),'{}'::text[]) into v_included_modules
  from jsonb_array_elements(coalesce(p_module_items,'[]'::jsonb)) item
  where coalesce((item->>'enabled')::boolean,true)=true and coalesce((item->>'included_in_base')::boolean,false)=true;

  if p_mode='package' and (
    not (v_package_modules <@ v_enabled_modules) or not (v_enabled_modules <@ v_package_modules)
  ) then raise exception 'package module set must match plan version'; end if;
  if p_mode='package_plus_addons' and not (v_package_modules <@ v_included_modules) then raise exception 'package base modules are required'; end if;
  if p_mode in ('package','package_plus_addons') and exists(
    select 1 from unnest(v_included_modules) m where not (m=any(v_package_modules))
  ) then raise exception 'module marked as included is not part of plan version'; end if;
  if p_mode='custom' and exists(
    select 1 from unnest(v_included_modules) m where not (m=any(array['dashboard','orders','catalog','customers','settings']::text[]))
  ) then raise exception 'custom base can only include core modules'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_module_items,'[]'::jsonb)) loop
    v_module_key:=trim(v_item->>'module_key');
    if v_module_key is null or v_module_key='' then raise exception 'unknown commercial module'; end if;
    select * into v_feature from public.features where key='module.'||v_module_key and metadata->>'source'='module_catalog';
    if v_feature.id is null then raise exception 'unknown commercial module'; end if;
    if coalesce((v_item->>'enabled')::boolean,true)=false then continue; end if;

    v_price:=coalesce((v_item->>'price_cents')::integer,0);
    if coalesce((v_item->>'included_in_base')::boolean,false) and v_price<>0 then raise exception 'base module cannot have addon price'; end if;
    if not coalesce((v_item->>'included_in_base')::boolean,false) then
      if p_mode='package' then raise exception 'package mode cannot contain module extras'; end if;
      if coalesce((v_feature.metadata->>'commercial_sellable')::boolean,false)=false then raise exception 'module is not available for commercial add-on'; end if;
      if v_price<1 then raise exception 'paid module price is required'; end if;
    end if;
  end loop;

  v_sub:=public.subscription_apply_internal(
    p_organization_id,v_plan.key,'active',trim(p_idempotency_key)||':subscription','platform.commercial_composition_applied','month',
    null,null,null,null,false,null,null,null,
    jsonb_build_object('commercial_mode',p_mode,'store_id',p_store_id)
  );
  v_sub:=public.subscription_terms_update_internal(
    p_organization_id,p_base_price_cents,p_price_locked,p_price_lock_reason,p_billing_due_day,p_next_due_at,p_payment_status,
    p_reason,p_protocol,trim(p_idempotency_key)||':terms',p_actor_user_id
  );

  -- Registra remoções de add-ons module.* sem apagar histórico.
  insert into public.subscription_change_requests(
    organization_id,subscription_id,change_type,status,current_plan_id,current_plan_version_id,feature_id,feature_name_snapshot,
    current_base_price_cents,current_addons_price_cents,proposed_base_price_cents,proposed_addons_price_cents,effective_at,accepted_at,accepted_by,applied_at,reason,protocol,created_by
  )
  select p_organization_id,v_sub.id,'remove_addon','applied',v_sub.plan_id,v_sub.plan_version_id,a.feature_id,a.feature_name_snapshot,
    p_base_price_cents,0,p_base_price_cents,0,now(),now(),p_actor_user_id,now(),trim(p_reason),trim(p_protocol),p_actor_user_id
  from public.subscription_addons a
  join public.features f on f.id=a.feature_id and f.key like 'module.%'
  where a.subscription_id=v_sub.id and a.status in ('scheduled','active')
    and not exists(
      select 1 from jsonb_array_elements(p_module_items) item
      where f.key='module.'||trim(item->>'module_key')
        and coalesce((item->>'enabled')::boolean,true)=true
        and not coalesce((item->>'included_in_base')::boolean,false)
    );

  update public.subscription_addons a
  set status='cancelled',ends_at=coalesce(ends_at,now()),updated_at=now()
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
    v_module_key:=trim(v_item->>'module_key');
    v_price:=(v_item->>'price_cents')::integer;
    select * into v_feature from public.features where key='module.'||v_module_key and active=true;
    select * into v_addon
    from public.subscription_addons
    where subscription_id=v_sub.id and feature_id=v_feature.id and status in ('scheduled','active')
    order by created_at desc limit 1 for update;

    if v_addon.id is null then
      insert into public.subscription_addons(
        organization_id,subscription_id,feature_id,feature_name_snapshot,unit_price_cents,status,starts_at,accepted_at,accepted_by,reason,protocol,created_by
      ) values(
        p_organization_id,v_sub.id,v_feature.id,v_feature.name,v_price,'active',now(),now(),p_actor_user_id,trim(p_reason),trim(p_protocol),p_actor_user_id
      ) returning * into v_addon;
      insert into public.subscription_change_requests(
        organization_id,subscription_id,change_type,status,current_plan_id,current_plan_version_id,feature_id,feature_name_snapshot,
        current_base_price_cents,current_addons_price_cents,proposed_base_price_cents,proposed_addons_price_cents,effective_at,accepted_at,accepted_by,applied_at,reason,protocol,created_by
      ) values(
        p_organization_id,v_sub.id,'add_on','applied',v_sub.plan_id,v_sub.plan_version_id,v_feature.id,v_feature.name,
        p_base_price_cents,v_total_addons,p_base_price_cents,v_total_addons+v_price,now(),now(),p_actor_user_id,now(),trim(p_reason),trim(p_protocol),p_actor_user_id
      );
    elsif v_addon.unit_price_cents<>v_price then
      update public.subscription_addons set status='cancelled',ends_at=coalesce(ends_at,now()),updated_at=now() where id=v_addon.id;
      insert into public.subscription_addons(
        organization_id,subscription_id,feature_id,feature_name_snapshot,unit_price_cents,status,starts_at,accepted_at,accepted_by,reason,protocol,created_by
      ) values(
        p_organization_id,v_sub.id,v_feature.id,v_feature.name,v_price,'active',now(),now(),p_actor_user_id,trim(p_reason),trim(p_protocol),p_actor_user_id
      );
    end if;
    v_total_addons:=v_total_addons+v_price;
  end loop;

  v_preset:=case when v_plan.key='essential' then 'essential' when v_plan.key='management' then 'complete' else 'custom' end;
  v_module_result:=public.set_store_module_preset_internal(p_organization_id,p_store_id,v_preset,v_enabled_modules,p_actor_user_id,p_expected_module_revision);

  update public.organization_subscriptions
  set metadata=metadata||jsonb_build_object(
    'commercial_mode',p_mode,
    'commercial_store_id',p_store_id,
    'commercial_plan_key',v_plan.key,
    'commercial_plan_label',v_plan.name,
    'commercial_addons_price_cents',v_total_addons,
    'commercial_total_price_cents',p_base_price_cents+v_total_addons
  ),updated_at=now()
  where id=v_sub.id returning * into v_sub;

  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(
    p_organization_id,p_actor_user_id,'platform.commercial_composition.applied','organization_subscription',v_sub.id,
    jsonb_build_object('mode',p_mode,'store_id',p_store_id,'plan_key',v_plan.key,'base_price_cents',p_base_price_cents,
      'addons_price_cents',v_total_addons,'total_price_cents',p_base_price_cents+v_total_addons,'modules',p_module_items,'module_result',v_module_result),
    trim(p_reason),trim(p_protocol)
  );

  return jsonb_build_object(
    'subscription_id',v_sub.id,'store_id',p_store_id,'mode',p_mode,'plan_key',v_plan.key,
    'base_price_cents',p_base_price_cents,'addons_price_cents',v_total_addons,'total_price_cents',p_base_price_cents+v_total_addons,
    'module_result',v_module_result,'idempotent',false
  );
end; $$;

revoke all on function public.platform_commercial_composition_apply_internal(uuid,uuid,text,uuid,integer,jsonb,smallint,timestamptz,text,boolean,text,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.platform_commercial_composition_apply_internal(uuid,uuid,text,uuid,integer,jsonb,smallint,timestamptz,text,boolean,text,uuid,text,text,text,bigint) to service_role;
