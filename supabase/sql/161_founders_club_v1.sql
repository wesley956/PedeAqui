-- PedeAqui — Clube Fundadores v1
-- Camada de relacionamento separada do plano comercial.
-- Não define regra automática de PedeCoins/cashback; apenas cria a fundação auditável.

create table if not exists public.platform_global_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 3 and 160),
  entity_type text not null check (char_length(trim(entity_type)) between 2 and 120),
  entity_id uuid null,
  organization_id uuid null references public.organizations(id) on delete restrict,
  before_data jsonb null,
  after_data jsonb null,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  created_at timestamptz not null default now()
);

create index if not exists platform_global_audit_created_idx on public.platform_global_audit(created_at desc);
create index if not exists platform_global_audit_org_idx on public.platform_global_audit(organization_id,created_at desc);

create table if not exists public.founder_club_levels (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text null check (description is null or char_length(trim(description)) <= 1000),
  rank integer not null default 0 check (rank between 0 and 10000),
  min_tenure_months integer not null default 0 check (min_tenure_months between 0 and 1200),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.founder_club_levels(key,name,description,rank,min_tenure_months,active,metadata)
values('founder','Fundador','Nível inicial do Clube Fundadores. Progressões futuras serão configuradas sem alterar contratos.',0,0,true,jsonb_build_object('automatic_progression',false))
on conflict(key) do update set name=excluded.name,description=excluded.description,active=true,updated_at=now();

create table if not exists public.founder_club_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  subscription_id uuid null unique references public.organization_subscriptions(id) on delete restrict,
  status text not null default 'invited' check (status in ('invited','active','paused','removed')),
  level_key text not null default 'founder' references public.founder_club_levels(key) on delete restrict,
  joined_at timestamptz null,
  paused_at timestamptz null,
  removed_at timestamptz null,
  admission_source text not null default 'manual_invite' check (admission_source in ('manual_invite','founder_contract','migration')),
  admission_reason text not null check (char_length(trim(admission_reason)) between 5 and 500),
  terms_version text not null check (char_length(trim(terms_version)) between 1 and 80),
  reward_unit text not null default 'pede_coin' check (reward_unit='pede_coin'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='active' and joined_at is not null and removed_at is null) or status<>'active'),
  check ((status='paused' and paused_at is not null) or status<>'paused'),
  check ((status='removed' and removed_at is not null) or status<>'removed')
);

create index if not exists founder_club_memberships_status_idx on public.founder_club_memberships(status,joined_at);

create table if not exists public.founder_club_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.founder_club_memberships(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_type text not null check (entry_type in ('earn','redeem','adjustment','expire')),
  amount_units integer not null check (amount_units<>0 and abs(amount_units)<=100000000),
  reward_unit text not null default 'pede_coin' check (reward_unit='pede_coin'),
  reference_type text null check (reference_type is null or char_length(trim(reference_type)) between 2 and 100),
  reference_id text null check (reference_id is null or char_length(trim(reference_id)) between 1 and 180),
  description text not null check (char_length(trim(description)) between 3 and 500),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(membership_id,idempotency_key),
  check ((entry_type='earn' and amount_units>0) or (entry_type in ('redeem','expire') and amount_units<0) or entry_type='adjustment')
);

create index if not exists founder_club_reward_ledger_member_idx on public.founder_club_reward_ledger(membership_id,created_at desc);

create table if not exists public.founder_club_benefits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 2 and 140),
  description text not null check (char_length(trim(description)) between 3 and 1200),
  kind text not null check (kind in ('discount','service','advertising','feature_access','cashback','other')),
  cost_units integer null check (cost_units is null or cost_units>=0),
  active boolean not null default false,
  stock_limit integer null check (stock_limit is null or stock_limit>=0),
  starts_at timestamptz null,
  ends_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at>starts_at)
);

create table if not exists public.founder_club_redemptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.founder_club_memberships(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  benefit_id uuid not null references public.founder_club_benefits(id) on delete restrict,
  status text not null default 'requested' check (status in ('requested','approved','fulfilled','rejected','cancelled')),
  units_spent integer not null check (units_spent>=0),
  ledger_entry_id uuid null unique references public.founder_club_reward_ledger(id) on delete restrict,
  request_note text null check (request_note is null or char_length(trim(request_note))<=500),
  decision_note text null check (decision_note is null or char_length(trim(decision_note))<=500),
  requested_at timestamptz not null default now(),
  decided_at timestamptz null,
  fulfilled_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  decided_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.founder_club_member_balances as
select m.id as membership_id,m.organization_id,m.status,m.level_key,m.joined_at,m.reward_unit,
  coalesce(sum(l.amount_units),0)::bigint as balance_units,
  count(l.id)::bigint as ledger_entries
from public.founder_club_memberships m
left join public.founder_club_reward_ledger l on l.membership_id=m.id
group by m.id,m.organization_id,m.status,m.level_key,m.joined_at,m.reward_unit;

create or replace function private.founder_club_immutable_row()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'founder club history is immutable';
end; $$;

drop trigger if exists founder_club_reward_ledger_immutable on public.founder_club_reward_ledger;
create trigger founder_club_reward_ledger_immutable before update or delete on public.founder_club_reward_ledger
for each row execute function private.founder_club_immutable_row();

drop trigger if exists founder_club_global_audit_immutable on public.platform_global_audit;
create trigger founder_club_global_audit_immutable before update or delete on public.platform_global_audit
for each row execute function private.founder_club_immutable_row();

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
        and p.key='founders' and s.price_locked=true and s.status in ('trialing','active','past_due')
    ) into v_founder_contract;
  end if;
  if p_status='active' and not v_founder_contract then raise exception 'active founder club membership requires a protected founders subscription'; end if;

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
    subscription_id=excluded.subscription_id,
    status=excluded.status,
    level_key=excluded.level_key,
    joined_at=coalesce(public.founder_club_memberships.joined_at,excluded.joined_at),
    paused_at=case when excluded.status='paused' then now() else null end,
    removed_at=case when excluded.status='removed' then now() else null end,
    admission_source=excluded.admission_source,
    admission_reason=excluded.admission_reason,
    terms_version=excluded.terms_version,
    metadata=public.founder_club_memberships.metadata||excluded.metadata,
    updated_by=p_actor_user_id,
    updated_at=now()
  returning * into v_row;

  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.founder_club.membership_saved','founder_club_membership',v_row.id,p_organization_id,v_before,to_jsonb(v_row),trim(p_admission_reason),trim(p_protocol));
  return v_row;
end; $$;

create or replace function public.founder_club_reward_append_internal(
  p_membership_id uuid,
  p_entry_type text,
  p_amount_units integer,
  p_description text,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.founder_club_reward_ledger
language plpgsql security invoker set search_path='' as $$
declare
  v_membership public.founder_club_memberships%rowtype;
  v_row public.founder_club_reward_ledger%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_entry_type not in ('earn','redeem','adjustment','expire') then raise exception 'invalid founder reward entry type'; end if;
  if p_amount_units=0 or abs(p_amount_units)>100000000 then raise exception 'invalid founder reward amount'; end if;
  if p_entry_type='earn' and p_amount_units<1 then raise exception 'earn entry must be positive'; end if;
  if p_entry_type in ('redeem','expire') and p_amount_units>-1 then raise exception 'redeem/expire entry must be negative'; end if;
  if char_length(trim(coalesce(p_description,''))) not between 3 and 500 then raise exception 'description required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'idempotency key required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;

  select * into v_membership from public.founder_club_memberships where id=p_membership_id for update;
  if v_membership.id is null then raise exception 'founder club membership not found'; end if;

  select * into v_row from public.founder_club_reward_ledger where membership_id=p_membership_id and idempotency_key=trim(p_idempotency_key);
  if v_row.id is not null then return v_row; end if;

  insert into public.founder_club_reward_ledger(
    membership_id,organization_id,entry_type,amount_units,reward_unit,reference_type,reference_id,description,idempotency_key,metadata,created_by
  ) values(
    v_membership.id,v_membership.organization_id,p_entry_type,p_amount_units,v_membership.reward_unit,
    nullif(trim(coalesce(p_reference_type,'')),''),nullif(trim(coalesce(p_reference_id,'')),''),trim(p_description),trim(p_idempotency_key),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id
  ) returning * into v_row;

  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,after_data,reason,protocol)
  values(p_actor_user_id,'platform.founder_club.reward_appended','founder_club_reward_ledger',v_row.id,v_membership.organization_id,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

alter table public.platform_global_audit enable row level security;
alter table public.founder_club_levels enable row level security;
alter table public.founder_club_memberships enable row level security;
alter table public.founder_club_reward_ledger enable row level security;
alter table public.founder_club_benefits enable row level security;
alter table public.founder_club_redemptions enable row level security;

revoke all on table public.platform_global_audit,public.founder_club_levels,public.founder_club_memberships,public.founder_club_reward_ledger,public.founder_club_benefits,public.founder_club_redemptions from public,anon,authenticated;
revoke all on table public.founder_club_member_balances from public,anon,authenticated;
grant select,insert on table public.platform_global_audit to service_role;
grant select,insert,update on table public.founder_club_levels,public.founder_club_memberships,public.founder_club_benefits,public.founder_club_redemptions to service_role;
grant select,insert on table public.founder_club_reward_ledger to service_role;
grant select on table public.founder_club_member_balances to service_role;

revoke all on function public.founder_club_membership_save_internal(uuid,uuid,text,text,timestamptz,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.founder_club_membership_save_internal(uuid,uuid,text,text,timestamptz,text,text,uuid,text,jsonb) to service_role;
revoke all on function public.founder_club_reward_append_internal(uuid,text,integer,text,text,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.founder_club_reward_append_internal(uuid,text,integer,text,text,uuid,text,text,text,text,jsonb) to service_role;
