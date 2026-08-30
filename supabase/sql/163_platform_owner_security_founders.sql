-- PedeAqui — hardening do Clube Fundadores + administração interna

-- Fundadores têm entitlement comercial para todos os módulos; a unidade continua
-- escolhendo o que está habilitado em store_modules. Isso separa direito de usar
-- de configuração operacional e evita ligar tudo automaticamente.
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
  ), founder_entitlement as (
    select sub.id as subscription_id,sub.plan_id,sub.plan_key,sub.status as subscription_status,
      f.id as feature_id,f.key as feature_key,true as enabled,null::bigint as limit_value,
      coalesce(sub.current_period_start,date_trunc('month',p_at)) as period_start,
      coalesce(sub.current_period_end,date_trunc('month',p_at)+interval '1 month') as period_end
    from sub
    join public.features f on f.active=true and f.key=p_feature_key
    where sub.plan_key='founders' and f.key like 'module.%'
  ), addon_entitlement as (
    select sub.id as subscription_id,sub.plan_id,sub.plan_key,sub.status as subscription_status,
      f.id as feature_id,f.key as feature_key,true as enabled,null::bigint as limit_value,
      coalesce(sub.current_period_start,date_trunc('month',p_at)) as period_start,
      coalesce(sub.current_period_end,date_trunc('month',p_at)+interval '1 month') as period_end
    from sub
    join public.subscription_addons a on a.subscription_id=sub.id and a.status='active' and a.starts_at<=p_at and (a.ends_at is null or a.ends_at>p_at)
    join public.features f on f.id=a.feature_id and f.active=true and f.key=p_feature_key
  ), entitlement as (
    select * from founder_entitlement
    union all select * from plan_entitlement
    union all select * from addon_entitlement
    limit 1
  )
  select e.subscription_id,e.plan_id,e.plan_key,e.subscription_status,e.feature_id,e.feature_key,e.enabled,e.limit_value,e.period_start,e.period_end,
    coalesce(c.used,0)::bigint as used
  from entitlement e
  left join public.feature_usage_counters c on c.organization_id=p_organization_id and c.feature_id=e.feature_id and c.period_start=e.period_start;
$$;
revoke all on function private.organization_entitlement(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function private.organization_entitlement(uuid,text,timestamptz) to service_role;

-- Reforça a admissão: membro ativo precisa de contrato Fundadores protegido e vaga atribuída.
create or replace function public.founder_club_membership_save_internal(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_status text,
  p_level_key text,
  p_joined_at timestamptz,
  p_admission_reason text,
  p_terms_version text,
  p_actor_user_id uuid,
  p_protocol text,
  p_metadata jsonb default '{}'::jsonb
) returns public.founder_club_memberships
language plpgsql security invoker set search_path='' as $$
declare
  v_row public.founder_club_memberships%rowtype;
  v_before jsonb;
  v_founder_contract boolean:=false;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_status not in ('invited','active','paused','removed') then raise exception 'invalid founder club status'; end if;
  if char_length(trim(coalesce(p_admission_reason,''))) not between 5 and 500 then raise exception 'admission reason required'; end if;
  if char_length(trim(coalesce(p_terms_version,''))) not between 1 and 80 then raise exception 'terms version required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then raise exception 'metadata must be an object'; end if;
  if not exists(select 1 from public.founder_club_levels where key=p_level_key and active=true) then raise exception 'founder club level unavailable'; end if;

  if p_subscription_id is not null then
    select exists(
      select 1 from public.organization_subscriptions s
      join public.plans p on p.id=s.plan_id
      where s.id=p_subscription_id and s.organization_id=p_organization_id
        and p.key='founders' and s.price_locked=true and s.founder_slot is not null
        and s.status in ('trialing','active','past_due')
    ) into v_founder_contract;
  end if;
  if p_status='active' and not v_founder_contract then raise exception 'active founder club membership requires a protected founders slot'; end if;

  select to_jsonb(m) into v_before from public.founder_club_memberships m where m.organization_id=p_organization_id for update;
  insert into public.founder_club_memberships(
    organization_id,subscription_id,status,level_key,joined_at,paused_at,removed_at,admission_source,admission_reason,terms_version,metadata,created_by,updated_by
  ) values(
    p_organization_id,p_subscription_id,p_status,p_level_key,
    case when p_status='active' then coalesce(p_joined_at,now()) else p_joined_at end,
    case when p_status='paused' then now() end,
    case when p_status='removed' then now() end,
    case when v_founder_contract then 'founder_contract' else 'manual_invite' end,
    trim(p_admission_reason),trim(p_terms_version),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id,p_actor_user_id
  )
  on conflict(organization_id) do update set
    subscription_id=excluded.subscription_id,status=excluded.status,level_key=excluded.level_key,
    joined_at=coalesce(public.founder_club_memberships.joined_at,excluded.joined_at),
    paused_at=case when excluded.status='paused' then now() else null end,
    removed_at=case when excluded.status='removed' then now() else null end,
    admission_source=excluded.admission_source,admission_reason=excluded.admission_reason,terms_version=excluded.terms_version,
    metadata=public.founder_club_memberships.metadata||excluded.metadata,updated_by=p_actor_user_id,updated_at=now()
  returning * into v_row;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.founder_club.membership_saved','founder_club_membership',v_row.id,p_organization_id,v_before,to_jsonb(v_row),trim(p_admission_reason),trim(p_protocol));
  return v_row;
end; $$;

-- Gestão da equipe interna da plataforma. Nunca permite remover/rebaixar o último super-admin.
create or replace function public.platform_admin_save_internal(
  p_target_user_id uuid,
  p_role text,
  p_active boolean,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
) returns public.platform_admins
language plpgsql security definer set search_path='' as $$
declare
  v_before public.platform_admins%rowtype;
  v_row public.platform_admins%rowtype;
  v_other_super_admins integer;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_role not in ('super_admin','support') then raise exception 'invalid platform admin role'; end if;
  if not exists(select 1 from auth.users where id=p_target_user_id) then raise exception 'target user not found'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;

  select * into v_before from public.platform_admins where user_id=p_target_user_id for update;
  if v_before.user_id is not null and v_before.active=true and v_before.role='super_admin' and (not p_active or p_role<>'super_admin') then
    select count(*)::integer into v_other_super_admins from public.platform_admins where active=true and role='super_admin' and user_id<>p_target_user_id;
    if v_other_super_admins<1 then raise exception 'cannot remove the last active super admin'; end if;
  end if;

  insert into public.platform_admins(user_id,role,active)
  values(p_target_user_id,p_role,p_active)
  on conflict(user_id) do update set role=excluded.role,active=excluded.active,updated_at=now()
  returning * into v_row;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.admin.saved','platform_admin',p_target_user_id,case when v_before.user_id is null then null else to_jsonb(v_before) end,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

-- Revoga sessões de uma conta de cliente ou da equipe interna sem excluir o usuário.
create or replace function public.platform_user_sessions_revoke_internal(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
) returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer:=0;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if not exists(select 1 from auth.users where id=p_target_user_id) then raise exception 'target user not found'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;
  delete from auth.sessions where user_id=p_target_user_id;
  get diagnostics v_count=row_count;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(p_actor_user_id,'platform.user.sessions_revoked','auth_user',p_target_user_id,jsonb_build_object('revoked_sessions',v_count),trim(p_reason),trim(p_protocol));
  return v_count;
end; $$;

revoke all on function public.founder_club_membership_save_internal(uuid,uuid,text,text,timestamptz,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.founder_club_membership_save_internal(uuid,uuid,text,text,timestamptz,text,text,uuid,text,jsonb) to service_role;
revoke all on function public.platform_admin_save_internal(uuid,text,boolean,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_admin_save_internal(uuid,text,boolean,uuid,text,text) to service_role;
revoke all on function public.platform_user_sessions_revoke_internal(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_user_sessions_revoke_internal(uuid,uuid,text,text) to service_role;
