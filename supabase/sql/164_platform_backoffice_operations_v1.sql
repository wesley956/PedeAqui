-- PedeAqui — backoffice de onboarding, comunicação, configurações e privacidade

create table if not exists public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  category text not null check (char_length(trim(category)) between 2 and 80),
  description text not null check (char_length(trim(description)) between 3 and 1000),
  value jsonb not null,
  active boolean not null default true,
  updated_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings(key,category,description,value,active)
values
  ('billing.pre_notice_days','billing','Dias de antecedência para preparar mensalidade e PIX.',to_jsonb(3),true),
  ('billing.default_grace_days','billing','Tolerância padrão antes de qualquer suspensão administrativa.',to_jsonb(3),true),
  ('founders.rewards.auto_accrual','founders','Ativa regras automáticas de ganho de PedeCoins. Mantido desligado até aprovação das regras.',to_jsonb(false),true),
  ('founders.cashout.enabled','founders','Permite converter saldo de recompensa em dinheiro. Exige revisão fiscal/contábil antes de ativar.',to_jsonb(false),true),
  ('founders.terms_version','founders','Versão de termos usada em novas admissões do Clube Fundadores.',to_jsonb('v1-draft'::text),true)
on conflict(key) do nothing;

create table if not exists public.platform_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  store_id uuid null references public.stores(id) on delete restrict,
  step_key text not null check (step_key ~ '^[a-z0-9][a-z0-9._-]{1,99}$'),
  label text not null check (char_length(trim(label)) between 2 and 160),
  status text not null default 'pending' check (status in ('pending','in_progress','done','blocked','waived')),
  note text null check (note is null or char_length(trim(note))<=2000),
  assigned_to uuid null references auth.users(id) on delete restrict,
  due_at timestamptz null,
  completed_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,store_id,step_key),
  check ((status='done' and completed_at is not null) or status<>'done')
);

create index if not exists platform_onboarding_tasks_status_idx on public.platform_onboarding_tasks(status,due_at);
create index if not exists platform_onboarding_tasks_org_idx on public.platform_onboarding_tasks(organization_id,store_id);

create table if not exists public.platform_customer_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  channel text not null check (channel in ('panel','email','whatsapp')),
  kind text not null check (kind in ('announcement','billing','support','product','onboarding','other')),
  title text not null check (char_length(trim(title)) between 2 and 180),
  body text not null check (char_length(trim(body)) between 3 and 5000),
  status text not null default 'draft' check (status in ('draft','scheduled','sent','cancelled','failed')),
  scheduled_at timestamptz null,
  sent_at timestamptz null,
  last_error text null check (last_error is null or char_length(last_error)<=1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='sent' and sent_at is not null) or status<>'sent'),
  check ((status='scheduled' and scheduled_at is not null) or status<>'scheduled')
);

create index if not exists platform_customer_messages_status_idx on public.platform_customer_messages(status,scheduled_at);
create index if not exists platform_customer_messages_org_idx on public.platform_customer_messages(organization_id,created_at desc);

create table if not exists public.platform_data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  domain_key text not null unique check (domain_key ~ '^[a-z0-9][a-z0-9._-]{1,99}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text not null check (char_length(trim(description)) between 3 and 1000),
  retention_days integer null check (retention_days is null or retention_days between 1 and 36500),
  disposition text not null default 'review' check (disposition in ('review','archive','anonymize','delete')),
  active boolean not null default false,
  legal_basis text null check (legal_basis is null or char_length(trim(legal_basis))<=1000),
  updated_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_data_retention_policies(domain_key,name,description,retention_days,disposition,active)
values
  ('crm','CRM comercial','Dados de prospecção e relacionamento pré-contrato.',null,'review',false),
  ('billing','Cobrança SaaS','Mensalidades, pagamentos e trilha financeira da assinatura.',null,'review',false),
  ('audit','Auditoria','Registros necessários para segurança, rastreabilidade e investigação.',null,'review',false),
  ('support','Suporte','Dados e evidências utilizados em atendimento e diagnóstico.',null,'review',false)
on conflict(domain_key) do nothing;

create table if not exists public.platform_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete restrict,
  requester_user_id uuid null references auth.users(id) on delete restrict,
  requester_reference text null check (requester_reference is null or char_length(trim(requester_reference))<=254),
  request_type text not null check (request_type in ('access','export','correction','anonymization','deletion','other')),
  status text not null default 'received' check (status in ('received','reviewing','approved','rejected','processing','completed','cancelled')),
  legal_hold boolean not null default false,
  reason text not null check (char_length(trim(reason)) between 5 and 2000),
  decision_note text null check (decision_note is null or char_length(trim(decision_note))<=2000),
  protocol text not null unique check (char_length(trim(protocol)) between 3 and 120),
  requested_at timestamptz not null default now(),
  decided_at timestamptz null,
  completed_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_privacy_requests_status_idx on public.platform_privacy_requests(status,requested_at desc);

create or replace function public.platform_setting_save_internal(
  p_key text,p_category text,p_description text,p_value jsonb,p_active boolean,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.platform_settings
language plpgsql security invoker set search_path='' as $$
declare v_before public.platform_settings%rowtype; v_row public.platform_settings%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_key !~ '^[a-z0-9][a-z0-9._-]{2,119}$' then raise exception 'invalid platform setting key'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;
  select * into v_before from public.platform_settings where key=p_key for update;
  insert into public.platform_settings(key,category,description,value,active,updated_by)
  values(p_key,trim(p_category),trim(p_description),p_value,p_active,p_actor_user_id)
  on conflict(key) do update set category=excluded.category,description=excluded.description,value=excluded.value,active=excluded.active,updated_by=p_actor_user_id,updated_at=now()
  returning * into v_row;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,organization_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.setting.saved','platform_setting',null,case when v_before.key is null then null else to_jsonb(v_before) end,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

create or replace function public.platform_onboarding_task_save_internal(
  p_organization_id uuid,p_store_id uuid,p_step_key text,p_label text,p_status text,p_note text,p_due_at timestamptz,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.platform_onboarding_tasks
language plpgsql security invoker set search_path='' as $$
declare v_before public.platform_onboarding_tasks%rowtype; v_row public.platform_onboarding_tasks%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_status not in ('pending','in_progress','done','blocked','waived') then raise exception 'invalid onboarding status'; end if;
  if p_store_id is not null and not exists(select 1 from public.stores where id=p_store_id and organization_id=p_organization_id) then raise exception 'store does not belong to organization'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;
  select * into v_before from public.platform_onboarding_tasks where organization_id=p_organization_id and store_id is not distinct from p_store_id and step_key=p_step_key for update;
  insert into public.platform_onboarding_tasks(organization_id,store_id,step_key,label,status,note,assigned_to,due_at,completed_at,created_by,updated_by)
  values(p_organization_id,p_store_id,p_step_key,trim(p_label),p_status,nullif(trim(coalesce(p_note,'')),''),p_actor_user_id,p_due_at,case when p_status='done' then now() end,p_actor_user_id,p_actor_user_id)
  on conflict(organization_id,store_id,step_key) do update set label=excluded.label,status=excluded.status,note=excluded.note,assigned_to=p_actor_user_id,due_at=excluded.due_at,
    completed_at=case when excluded.status='done' then coalesce(public.platform_onboarding_tasks.completed_at,now()) else null end,updated_by=p_actor_user_id,updated_at=now()
  returning * into v_row;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.onboarding.task_saved','platform_onboarding_task',v_row.id,p_organization_id,case when v_before.id is null then null else to_jsonb(v_before) end,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

create or replace function public.platform_customer_message_save_internal(
  p_message_id uuid,p_organization_id uuid,p_channel text,p_kind text,p_title text,p_body text,p_status text,p_scheduled_at timestamptz,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.platform_customer_messages
language plpgsql security invoker set search_path='' as $$
declare v_before public.platform_customer_messages%rowtype; v_row public.platform_customer_messages%rowtype; v_id uuid:=coalesce(p_message_id,gen_random_uuid());
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_channel not in ('panel','email','whatsapp') then raise exception 'invalid message channel'; end if;
  if p_kind not in ('announcement','billing','support','product','onboarding','other') then raise exception 'invalid message kind'; end if;
  if p_status not in ('draft','scheduled','cancelled') then raise exception 'message can only be saved as draft, scheduled or cancelled'; end if;
  if p_status='scheduled' and p_scheduled_at is null then raise exception 'scheduled message requires a date'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;
  if p_message_id is not null then select * into v_before from public.platform_customer_messages where id=p_message_id for update; end if;
  insert into public.platform_customer_messages(id,organization_id,channel,kind,title,body,status,scheduled_at,created_by,updated_by)
  values(v_id,p_organization_id,p_channel,p_kind,trim(p_title),trim(p_body),p_status,p_scheduled_at,p_actor_user_id,p_actor_user_id)
  on conflict(id) do update set organization_id=excluded.organization_id,channel=excluded.channel,kind=excluded.kind,title=excluded.title,body=excluded.body,status=excluded.status,scheduled_at=excluded.scheduled_at,updated_by=p_actor_user_id,updated_at=now()
  returning * into v_row;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.customer_message.saved','platform_customer_message',v_row.id,p_organization_id,case when v_before.id is null then null else to_jsonb(v_before) end,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

alter table public.platform_settings enable row level security;
alter table public.platform_onboarding_tasks enable row level security;
alter table public.platform_customer_messages enable row level security;
alter table public.platform_data_retention_policies enable row level security;
alter table public.platform_privacy_requests enable row level security;
revoke all on table public.platform_settings,public.platform_onboarding_tasks,public.platform_customer_messages,public.platform_data_retention_policies,public.platform_privacy_requests from public,anon,authenticated;
grant select,insert,update on table public.platform_settings,public.platform_onboarding_tasks,public.platform_customer_messages,public.platform_data_retention_policies,public.platform_privacy_requests to service_role;
revoke all on function public.platform_setting_save_internal(text,text,text,jsonb,boolean,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_setting_save_internal(text,text,text,jsonb,boolean,uuid,text,text) to service_role;
revoke all on function public.platform_onboarding_task_save_internal(uuid,uuid,text,text,text,text,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_onboarding_task_save_internal(uuid,uuid,text,text,text,text,timestamptz,uuid,text,text) to service_role;
revoke all on function public.platform_customer_message_save_internal(uuid,uuid,text,text,text,text,text,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_customer_message_save_internal(uuid,uuid,text,text,text,text,text,timestamptz,uuid,text,text) to service_role;
