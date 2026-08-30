-- PedeAqui — CRM comercial do Painel ADM v1

create table if not exists public.platform_crm_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete restrict,
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  business_name text not null check (char_length(trim(business_name)) between 2 and 160),
  phone text null check (phone is null or char_length(trim(phone)) between 6 and 40),
  email text null check (email is null or char_length(trim(email)) between 5 and 254),
  source text not null default 'manual' check (char_length(trim(source)) between 2 and 80),
  stage text not null default 'new' check (stage in ('new','contacted','demo','proposal','won','lost')),
  estimated_monthly_cents integer null check (estimated_monthly_cents is null or estimated_monthly_cents between 0 and 100000000),
  next_action_at timestamptz null,
  owner_user_id uuid null references auth.users(id) on delete restrict,
  notes text null check (notes is null or char_length(trim(notes))<=4000),
  lost_reason text null check (lost_reason is null or char_length(trim(lost_reason))<=1000),
  converted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stage<>'won' or organization_id is not null),
  check (stage<>'lost' or lost_reason is not null)
);

create unique index if not exists platform_crm_leads_org_unique on public.platform_crm_leads(organization_id) where organization_id is not null;
create index if not exists platform_crm_leads_stage_idx on public.platform_crm_leads(stage,next_action_at,updated_at desc);

create table if not exists public.platform_crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.platform_crm_leads(id) on delete restrict,
  organization_id uuid null references public.organizations(id) on delete restrict,
  kind text not null check (kind in ('note','call','whatsapp','email','demo','proposal','stage_change','follow_up','conversion')),
  summary text not null check (char_length(trim(summary)) between 3 and 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists platform_crm_activities_lead_idx on public.platform_crm_activities(lead_id,created_at desc);

create or replace function private.platform_crm_activity_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'CRM activity history is immutable';
end; $$;

drop trigger if exists platform_crm_activities_immutable on public.platform_crm_activities;
create trigger platform_crm_activities_immutable before update or delete on public.platform_crm_activities
for each row execute function private.platform_crm_activity_immutable();

create or replace function public.platform_crm_lead_save_internal(
  p_lead_id uuid,
  p_organization_id uuid,
  p_contact_name text,
  p_business_name text,
  p_phone text,
  p_email text,
  p_source text,
  p_stage text,
  p_estimated_monthly_cents integer,
  p_next_action_at timestamptz,
  p_owner_user_id uuid,
  p_notes text,
  p_lost_reason text,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
) returns public.platform_crm_leads
language plpgsql security invoker set search_path='' as $$
declare
  v_row public.platform_crm_leads%rowtype;
  v_before public.platform_crm_leads%rowtype;
  v_id uuid:=coalesce(p_lead_id,gen_random_uuid());
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_stage not in ('new','contacted','demo','proposal','won','lost') then raise exception 'invalid CRM stage'; end if;
  if char_length(trim(coalesce(p_contact_name,''))) not between 2 and 120 then raise exception 'contact name required'; end if;
  if char_length(trim(coalesce(p_business_name,''))) not between 2 and 160 then raise exception 'business name required'; end if;
  if p_stage='won' and p_organization_id is null then raise exception 'won lead requires organization'; end if;
  if p_stage='lost' and char_length(trim(coalesce(p_lost_reason,'')))<3 then raise exception 'lost reason required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;

  if p_lead_id is not null then select * into v_before from public.platform_crm_leads where id=p_lead_id for update; end if;

  insert into public.platform_crm_leads(
    id,organization_id,contact_name,business_name,phone,email,source,stage,estimated_monthly_cents,next_action_at,owner_user_id,notes,lost_reason,converted_at,created_by,updated_by
  ) values(
    v_id,p_organization_id,trim(p_contact_name),trim(p_business_name),nullif(trim(coalesce(p_phone,'')),''),nullif(lower(trim(coalesce(p_email,''))),''),
    trim(coalesce(nullif(p_source,''),'manual')),p_stage,p_estimated_monthly_cents,p_next_action_at,p_owner_user_id,nullif(trim(coalesce(p_notes,'')),''),
    case when p_stage='lost' then trim(p_lost_reason) else null end,case when p_stage='won' then coalesce(v_before.converted_at,now()) else null end,p_actor_user_id,p_actor_user_id
  )
  on conflict(id) do update set
    organization_id=excluded.organization_id,contact_name=excluded.contact_name,business_name=excluded.business_name,phone=excluded.phone,email=excluded.email,
    source=excluded.source,stage=excluded.stage,estimated_monthly_cents=excluded.estimated_monthly_cents,next_action_at=excluded.next_action_at,
    owner_user_id=excluded.owner_user_id,notes=excluded.notes,lost_reason=excluded.lost_reason,
    converted_at=case when excluded.stage='won' then coalesce(public.platform_crm_leads.converted_at,now()) else public.platform_crm_leads.converted_at end,
    updated_by=p_actor_user_id,updated_at=now()
  returning * into v_row;

  if v_before.id is null then
    insert into public.platform_crm_activities(lead_id,organization_id,kind,summary,metadata,created_by)
    values(v_row.id,v_row.organization_id,'note','Lead criado no funil comercial',jsonb_build_object('stage',v_row.stage,'reason',trim(p_reason),'protocol',trim(p_protocol)),p_actor_user_id);
  elsif v_before.stage is distinct from v_row.stage then
    insert into public.platform_crm_activities(lead_id,organization_id,kind,summary,metadata,created_by)
    values(v_row.id,v_row.organization_id,'stage_change','Etapa comercial alterada',jsonb_build_object('from',v_before.stage,'to',v_row.stage,'reason',trim(p_reason),'protocol',trim(p_protocol)),p_actor_user_id);
  end if;

  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.crm.lead_saved','platform_crm_lead',v_row.id,v_row.organization_id,case when v_before.id is null then null else to_jsonb(v_before) end,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

create or replace function public.platform_crm_activity_append_internal(
  p_lead_id uuid,
  p_kind text,
  p_summary text,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text,
  p_metadata jsonb default '{}'::jsonb
) returns public.platform_crm_activities
language plpgsql security invoker set search_path='' as $$
declare
  v_lead public.platform_crm_leads%rowtype;
  v_row public.platform_crm_activities%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_kind not in ('note','call','whatsapp','email','demo','proposal','follow_up') then raise exception 'invalid CRM activity kind'; end if;
  if char_length(trim(coalesce(p_summary,''))) not between 3 and 1000 then raise exception 'activity summary required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;
  select * into v_lead from public.platform_crm_leads where id=p_lead_id;
  if v_lead.id is null then raise exception 'CRM lead not found'; end if;

  insert into public.platform_crm_activities(lead_id,organization_id,kind,summary,metadata,created_by)
  values(v_lead.id,v_lead.organization_id,p_kind,trim(p_summary),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id)
  returning * into v_row;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,after_data,reason,protocol)
  values(p_actor_user_id,'platform.crm.activity_added','platform_crm_activity',v_row.id,v_lead.organization_id,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

alter table public.platform_crm_leads enable row level security;
alter table public.platform_crm_activities enable row level security;
revoke all on table public.platform_crm_leads,public.platform_crm_activities from public,anon,authenticated;
grant select,insert,update on table public.platform_crm_leads to service_role;
grant select,insert on table public.platform_crm_activities to service_role;
revoke all on function public.platform_crm_lead_save_internal(uuid,uuid,text,text,text,text,text,text,integer,timestamptz,uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_crm_lead_save_internal(uuid,uuid,text,text,text,text,text,text,integer,timestamptz,uuid,text,text,uuid,text,text) to service_role;
revoke all on function public.platform_crm_activity_append_internal(uuid,text,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_crm_activity_append_internal(uuid,text,text,uuid,text,text,jsonb) to service_role;
