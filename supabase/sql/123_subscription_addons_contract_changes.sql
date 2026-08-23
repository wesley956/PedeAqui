-- PedeAqui — PA-DIAG-146–153 e PA-CRUD-001–015
-- Add-ons preservam o plano-base; propostas registram preço anterior/novo, aceite,
-- vigência e ator. Nenhum registro contratual ou financeiro admite hard delete.

create table public.subscription_addons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  feature_id uuid not null references public.features(id) on delete restrict,
  feature_name_snapshot text not null check (char_length(trim(feature_name_snapshot)) between 2 and 120),
  unit_price_cents integer not null check (unit_price_cents between 1 and 100000000),
  quantity integer not null default 1 check (quantity between 1 and 10000),
  currency text not null default 'BRL' check (currency='BRL'),
  status text not null default 'active' check (status in ('scheduled','active','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  accepted_at timestamptz not null,
  accepted_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index subscription_addons_org_idx on public.subscription_addons(organization_id,created_at desc);
create index subscription_addons_subscription_idx on public.subscription_addons(subscription_id,status,starts_at);
create index subscription_addons_feature_idx on public.subscription_addons(feature_id,status);
create index subscription_addons_accepted_by_idx on public.subscription_addons(accepted_by);
create index subscription_addons_created_by_idx on public.subscription_addons(created_by);
create unique index subscription_addons_one_current_feature_idx
  on public.subscription_addons(subscription_id,feature_id) where status in ('scheduled','active');

create table public.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  change_type text not null check (change_type in ('add_on','remove_addon','upgrade','downgrade')),
  status text not null default 'draft' check (status in ('draft','scheduled','applied','cancelled')),
  current_plan_id uuid not null references public.plans(id) on delete restrict,
  current_plan_version_id uuid references public.plan_versions(id) on delete restrict,
  target_plan_id uuid references public.plans(id) on delete restrict,
  target_plan_version_id uuid references public.plan_versions(id) on delete restrict,
  feature_id uuid references public.features(id) on delete restrict,
  feature_name_snapshot text,
  current_base_price_cents integer not null check (current_base_price_cents between 0 and 100000000),
  current_addons_price_cents integer not null default 0 check (current_addons_price_cents between 0 and 100000000),
  proposed_base_price_cents integer not null check (proposed_base_price_cents between 0 and 100000000),
  proposed_addons_price_cents integer not null check (proposed_addons_price_cents between 0 and 100000000),
  proposed_total_price_cents integer generated always as (proposed_base_price_cents+proposed_addons_price_cents) stored,
  currency text not null default 'BRL' check (currency='BRL'),
  effective_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete restrict,
  applied_at timestamptz,
  cancelled_at timestamptz,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='draft' and accepted_at is null and accepted_by is null) or status<>'draft'),
  check ((status in ('scheduled','applied') and accepted_at is not null and accepted_by is not null) or status not in ('scheduled','applied')),
  check ((status='applied' and applied_at is not null) or status<>'applied'),
  check ((status='cancelled' and cancelled_at is not null) or status<>'cancelled'),
  check ((change_type in ('add_on','remove_addon') and feature_id is not null) or change_type in ('upgrade','downgrade')),
  check ((change_type in ('upgrade','downgrade') and target_plan_id is not null and target_plan_version_id is not null) or change_type in ('add_on','remove_addon'))
);
create index subscription_change_requests_org_idx on public.subscription_change_requests(organization_id,created_at desc);
create index subscription_change_requests_subscription_idx on public.subscription_change_requests(subscription_id,status,effective_at);
create index subscription_change_requests_due_idx on public.subscription_change_requests(status,effective_at) where status='scheduled';
create index subscription_change_requests_current_plan_idx on public.subscription_change_requests(current_plan_id);
create index subscription_change_requests_current_version_idx on public.subscription_change_requests(current_plan_version_id) where current_plan_version_id is not null;
create index subscription_change_requests_target_plan_idx on public.subscription_change_requests(target_plan_id) where target_plan_id is not null;
create index subscription_change_requests_target_version_idx on public.subscription_change_requests(target_plan_version_id) where target_plan_version_id is not null;
create index subscription_change_requests_feature_idx on public.subscription_change_requests(feature_id) where feature_id is not null;
create index subscription_change_requests_accepted_by_idx on public.subscription_change_requests(accepted_by) where accepted_by is not null;
create index subscription_change_requests_created_by_idx on public.subscription_change_requests(created_by);

alter table public.subscription_addons enable row level security;
alter table public.subscription_change_requests enable row level security;
revoke all on table public.subscription_addons,public.subscription_change_requests from anon,authenticated;
grant select,insert,update on table public.subscription_addons,public.subscription_change_requests to service_role;
create policy subscription_addons_browser_deny on public.subscription_addons for all to anon,authenticated using(false) with check(false);
create policy subscription_change_requests_browser_deny on public.subscription_change_requests for all to anon,authenticated using(false) with check(false);

create or replace function private.prevent_contract_delete()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'contract history cannot be deleted'; end;
$$;
revoke all on function private.prevent_contract_delete() from public,anon,authenticated;
create trigger subscription_addons_no_delete before delete on public.subscription_addons
  for each row execute function private.prevent_contract_delete();
create trigger subscription_change_requests_no_delete before delete on public.subscription_change_requests
  for each row execute function private.prevent_contract_delete();

create or replace function public.subscription_change_quote_internal(
  p_organization_id uuid,p_change_type text,p_target_plan_id uuid,p_feature_id uuid,
  p_feature_price_cents integer,p_effective_at timestamptz,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.subscription_change_requests language plpgsql security invoker set search_path='' as $$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_target public.plans%rowtype;
  v_feature public.features%rowtype;
  v_current_base integer;
  v_current_addons integer;
  v_proposed_base integer;
  v_proposed_addons integer;
  v_existing_addon_price integer;
  v_row public.subscription_change_requests%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_change_type not in ('add_on','remove_addon','upgrade','downgrade') then raise exception 'invalid change type'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 or char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'reason and protocol required'; end if;
  if p_effective_at < now()-interval '5 minutes' then raise exception 'effective date cannot be in the past'; end if;
  select * into v_sub from public.organization_subscriptions
    where organization_id=p_organization_id and status in ('trialing','active','past_due')
    order by created_at desc limit 1 for update;
  if v_sub.id is null then raise exception 'active subscription not found'; end if;
  select coalesce(v_sub.agreed_price_cents,pv.monthly_price_cents,p.monthly_price_cents,0)
    into v_current_base from public.plans p left join public.plan_versions pv on pv.id=v_sub.plan_version_id where p.id=v_sub.plan_id;
  select coalesce(sum(unit_price_cents*quantity),0)::integer into v_current_addons
    from public.subscription_addons where subscription_id=v_sub.id and status='active' and starts_at<=now() and (ends_at is null or ends_at>now());
  v_proposed_base:=v_current_base; v_proposed_addons:=v_current_addons;

  if p_change_type in ('upgrade','downgrade') then
    select * into v_target from public.plans where id=p_target_plan_id and active=true;
    if v_target.id is null or v_target.current_version_id is null then raise exception 'target plan unavailable'; end if;
    select coalesce(monthly_price_cents,0) into v_proposed_base from public.plan_versions where id=v_target.current_version_id;
    if p_change_type='upgrade' and v_proposed_base<v_current_base then raise exception 'upgrade cannot reduce base price'; end if;
    if p_change_type='downgrade' and v_proposed_base>v_current_base then raise exception 'downgrade cannot increase base price'; end if;
  else
    select * into v_feature from public.features where id=p_feature_id and active=true;
    if v_feature.id is null then raise exception 'feature unavailable'; end if;
    select unit_price_cents*quantity into v_existing_addon_price from public.subscription_addons
      where subscription_id=v_sub.id and feature_id=p_feature_id and status='active' limit 1;
    if p_change_type='add_on' then
      if v_existing_addon_price is not null then raise exception 'feature already contracted'; end if;
      if p_feature_price_cents is null or p_feature_price_cents not between 1 and 100000000 then raise exception 'invalid feature price'; end if;
      v_proposed_addons:=v_current_addons+p_feature_price_cents;
    else
      if v_existing_addon_price is null then raise exception 'active feature add-on not found'; end if;
      v_proposed_addons:=greatest(v_current_addons-v_existing_addon_price,0);
    end if;
  end if;

  insert into public.subscription_change_requests(
    organization_id,subscription_id,change_type,current_plan_id,current_plan_version_id,target_plan_id,target_plan_version_id,
    feature_id,feature_name_snapshot,current_base_price_cents,current_addons_price_cents,proposed_base_price_cents,
    proposed_addons_price_cents,effective_at,reason,protocol,created_by
  ) values (
    p_organization_id,v_sub.id,p_change_type,v_sub.plan_id,v_sub.plan_version_id,v_target.id,v_target.current_version_id,
    v_feature.id,v_feature.name,v_current_base,v_current_addons,v_proposed_base,v_proposed_addons,p_effective_at,
    trim(p_reason),trim(p_protocol),p_actor_user_id
  ) returning * into v_row;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(p_organization_id,p_actor_user_id,'platform.contract.quote_created','subscription_change_request',v_row.id,
    jsonb_build_object('change_type',v_row.change_type,'current_total_price_cents',v_current_base+v_current_addons,
      'proposed_total_price_cents',v_row.proposed_total_price_cents,'effective_at',v_row.effective_at),trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_change_quote_internal(uuid,text,uuid,uuid,integer,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscription_change_quote_internal(uuid,text,uuid,uuid,integer,timestamptz,uuid,text,text) to service_role;

create or replace function public.subscription_change_accept_internal(
  p_change_id uuid,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.subscription_change_requests language plpgsql security invoker set search_path='' as $$
declare v_row public.subscription_change_requests%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_row from public.subscription_change_requests where id=p_change_id for update;
  if v_row.id is null then raise exception 'change request not found'; end if;
  if v_row.status<>'draft' then raise exception 'only draft changes can be accepted'; end if;
  update public.subscription_change_requests set status='scheduled',accepted_at=now(),accepted_by=p_actor_user_id,
    reason=trim(p_reason),protocol=trim(p_protocol),updated_at=now() where id=v_row.id returning * into v_row;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(v_row.organization_id,p_actor_user_id,'platform.contract.change_accepted','subscription_change_request',v_row.id,
    jsonb_build_object('accepted_at',v_row.accepted_at,'accepted_by',v_row.accepted_by,'effective_at',v_row.effective_at,
      'proposed_total_price_cents',v_row.proposed_total_price_cents),trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_change_accept_internal(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscription_change_accept_internal(uuid,uuid,text,text) to service_role;

create or replace function public.subscription_change_apply_internal(
  p_change_id uuid,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.subscription_change_requests language plpgsql security invoker set search_path='' as $$
declare v_row public.subscription_change_requests%rowtype; v_feature_name text;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_row from public.subscription_change_requests where id=p_change_id for update;
  if v_row.id is null then raise exception 'change request not found'; end if;
  if v_row.status<>'scheduled' or v_row.accepted_at is null then raise exception 'accepted scheduled change required'; end if;
  if v_row.effective_at>now() then raise exception 'change is scheduled for a future date'; end if;

  if v_row.change_type='add_on' then
    select name into v_feature_name from public.features where id=v_row.feature_id;
    insert into public.subscription_addons(organization_id,subscription_id,feature_id,feature_name_snapshot,unit_price_cents,status,
      starts_at,accepted_at,accepted_by,reason,protocol,created_by)
    values(v_row.organization_id,v_row.subscription_id,v_row.feature_id,coalesce(v_feature_name,v_row.feature_name_snapshot),
      v_row.proposed_addons_price_cents-v_row.current_addons_price_cents,'active',v_row.effective_at,v_row.accepted_at,v_row.accepted_by,
      trim(p_reason),trim(p_protocol),p_actor_user_id);
  elsif v_row.change_type='remove_addon' then
    update public.subscription_addons set status='cancelled',ends_at=coalesce(ends_at,v_row.effective_at),updated_at=now()
      where subscription_id=v_row.subscription_id and feature_id=v_row.feature_id and status='active';
  else
    update public.organization_subscriptions set plan_id=v_row.target_plan_id,plan_version_id=v_row.target_plan_version_id,
      agreed_price_cents=case when price_locked then agreed_price_cents else v_row.proposed_base_price_cents end,updated_at=now()
      where id=v_row.subscription_id;
  end if;
  update public.subscription_change_requests set status='applied',applied_at=now(),updated_at=now()
    where id=v_row.id returning * into v_row;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(v_row.organization_id,p_actor_user_id,'platform.contract.change_applied','subscription_change_request',v_row.id,
    jsonb_build_object('change_type',v_row.change_type,'applied_at',v_row.applied_at,'proposed_total_price_cents',v_row.proposed_total_price_cents),
    trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_change_apply_internal(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscription_change_apply_internal(uuid,uuid,text,text) to service_role;

-- O preço-base travado jamais acompanha edições posteriores do plano. Add-ons são
-- cobrados separadamente e faturas/histórico anteriores continuam imutáveis.
create or replace function private.protect_locked_subscription_price()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.price_locked and new.agreed_price_cents is distinct from old.agreed_price_cents then
    raise exception 'locked subscription base price cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_locked_subscription_price() from public,anon,authenticated;
create trigger organization_subscriptions_locked_price_guard before update of agreed_price_cents on public.organization_subscriptions
  for each row execute function private.protect_locked_subscription_price();
