-- PedeAqui — Milestone 23 [242]–[244]
-- Entitlements e limites são server-side e independentes de RBAC.

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
    join public.plans p on p.id=s.plan_id and p.active=true
    where s.organization_id=p_organization_id
      and (
        (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at>p_at))
        or (s.status='active' and (s.current_period_end is null or s.current_period_end>p_at))
        or (s.status='past_due' and s.grace_ends_at is not null and s.grace_ends_at>p_at)
      )
    order by s.created_at desc limit 1
  ), entitlement as (
    select sub.id as subscription_id,sub.plan_id,sub.plan_key,sub.status as subscription_status,
      f.id as feature_id,f.key as feature_key,pf.enabled,pf.limit_value,
      coalesce(sub.current_period_start,date_trunc('month',p_at)) as period_start,
      coalesce(sub.current_period_end,date_trunc('month',p_at)+interval '1 month') as period_end
    from sub
    join public.plan_features pf on pf.plan_id=sub.plan_id and pf.enabled=true
    join public.features f on f.id=pf.feature_id and f.active=true and f.key=p_feature_key
  )
  select e.subscription_id,e.plan_id,e.plan_key,e.subscription_status,e.feature_id,e.feature_key,e.enabled,e.limit_value,e.period_start,e.period_end,
    coalesce(c.used,0)::bigint as used
  from entitlement e
  left join public.feature_usage_counters c on c.organization_id=p_organization_id and c.feature_id=e.feature_id and c.period_start=e.period_start;
$$;
revoke all on function private.organization_entitlement(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function private.organization_entitlement(uuid,text,timestamptz) to service_role;

create or replace function public.organization_entitlement_internal(
  p_organization_id uuid,
  p_feature_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v record;
begin
  select * into v from private.organization_entitlement(p_organization_id,trim(p_feature_key),p_at);
  if v.feature_id is null then
    return jsonb_build_object('enabled',false,'feature_key',trim(p_feature_key),'limit_value',null,'used',0,'remaining',0,'plan_key',null,'subscription_status',null);
  end if;
  return jsonb_build_object(
    'enabled',v.enabled,'feature_key',v.feature_key,'limit_value',v.limit_value,'used',v.used,
    'remaining',case when v.limit_value is null then null else greatest(v.limit_value-v.used,0) end,
    'plan_key',v.plan_key,'subscription_status',v.subscription_status,'period_start',v.period_start,'period_end',v.period_end
  );
end; $$;
revoke all on function public.organization_entitlement_internal(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.organization_entitlement_internal(uuid,text,timestamptz) to service_role;

create or replace function public.feature_usage_consume_internal(
  p_organization_id uuid,
  p_feature_key text,
  p_quantity bigint,
  p_idempotency_key text,
  p_source_type text default null,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_existing public.feature_usage_events%rowtype;
  v_ent record;
  v_counter public.feature_usage_counters%rowtype;
  v_new_used bigint;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'usage quantity must be positive'; end if;
  if char_length(trim(coalesce(p_idempotency_key,'')))<8 or char_length(trim(p_idempotency_key))>240 then raise exception 'invalid usage idempotency key'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then raise exception 'invalid usage metadata'; end if;

  select * into v_existing from public.feature_usage_events where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    select * into v_counter from public.feature_usage_counters where organization_id=p_organization_id and feature_id=v_existing.feature_id and period_start=v_existing.period_start;
    return jsonb_build_object('event_id',v_existing.id,'used',coalesce(v_counter.used,0),'idempotent',true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||trim(p_feature_key),0));
  select * into v_ent from private.organization_entitlement(p_organization_id,trim(p_feature_key),now());
  if v_ent.feature_id is null or not v_ent.enabled then raise exception 'feature is not entitled for organization'; end if;

  insert into public.feature_usage_counters(organization_id,feature_id,period_start,period_end,used)
  values(p_organization_id,v_ent.feature_id,v_ent.period_start,v_ent.period_end,0)
  on conflict(organization_id,feature_id,period_start) do nothing;
  select * into v_counter from public.feature_usage_counters where organization_id=p_organization_id and feature_id=v_ent.feature_id and period_start=v_ent.period_start for update;
  v_new_used:=v_counter.used+p_quantity;
  if v_ent.limit_value is not null and v_new_used>v_ent.limit_value then raise exception 'feature usage limit exceeded'; end if;

  insert into public.feature_usage_events(organization_id,feature_id,period_start,quantity,event_type,idempotency_key,source_type,source_id,metadata)
  values(p_organization_id,v_ent.feature_id,v_ent.period_start,p_quantity,'consume',trim(p_idempotency_key),nullif(trim(coalesce(p_source_type,'')),''),p_source_id,coalesce(p_metadata,'{}'::jsonb))
  returning * into v_existing;
  update public.feature_usage_counters set used=v_new_used,updated_at=now() where organization_id=p_organization_id and feature_id=v_ent.feature_id and period_start=v_ent.period_start;
  return jsonb_build_object('event_id',v_existing.id,'used',v_new_used,'limit_value',v_ent.limit_value,'remaining',case when v_ent.limit_value is null then null else v_ent.limit_value-v_new_used end,'idempotent',false);
end; $$;
revoke all on function public.feature_usage_consume_internal(uuid,text,bigint,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.feature_usage_consume_internal(uuid,text,bigint,text,text,uuid,jsonb) to service_role;

create or replace function public.feature_usage_correct_internal(
  p_organization_id uuid,
  p_feature_key text,
  p_quantity bigint,
  p_idempotency_key text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_existing public.feature_usage_events%rowtype; v_ent record; v_counter public.feature_usage_counters%rowtype; v_new_used bigint;
begin
  if p_quantity is null or p_quantity=0 then raise exception 'correction quantity cannot be zero'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 or char_length(trim(p_reason))>500 then raise exception 'usage correction reason is required'; end if;
  select * into v_existing from public.feature_usage_events where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then select * into v_counter from public.feature_usage_counters where organization_id=p_organization_id and feature_id=v_existing.feature_id and period_start=v_existing.period_start; return jsonb_build_object('event_id',v_existing.id,'used',coalesce(v_counter.used,0),'idempotent',true); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||trim(p_feature_key),0));
  select * into v_ent from private.organization_entitlement(p_organization_id,trim(p_feature_key),now());
  if v_ent.feature_id is null then raise exception 'feature is not entitled for organization'; end if;
  select * into v_counter from public.feature_usage_counters where organization_id=p_organization_id and feature_id=v_ent.feature_id and period_start=v_ent.period_start for update;
  if v_counter.organization_id is null then raise exception 'usage counter not found for correction'; end if;
  v_new_used:=v_counter.used+p_quantity; if v_new_used<0 then raise exception 'usage correction would make counter negative'; end if;
  if v_ent.limit_value is not null and v_new_used>v_ent.limit_value then raise exception 'usage correction would exceed feature limit'; end if;
  insert into public.feature_usage_events(organization_id,feature_id,period_start,quantity,event_type,idempotency_key,metadata)
  values(p_organization_id,v_ent.feature_id,v_ent.period_start,p_quantity,'correction',trim(p_idempotency_key),coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('reason',trim(p_reason))) returning * into v_existing;
  update public.feature_usage_counters set used=v_new_used,updated_at=now() where organization_id=p_organization_id and feature_id=v_ent.feature_id and period_start=v_ent.period_start;
  return jsonb_build_object('event_id',v_existing.id,'used',v_new_used,'limit_value',v_ent.limit_value,'idempotent',false);
end; $$;
revoke all on function public.feature_usage_correct_internal(uuid,text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.feature_usage_correct_internal(uuid,text,bigint,text,text,jsonb) to service_role;
