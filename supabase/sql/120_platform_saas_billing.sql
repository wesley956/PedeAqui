-- PedeAqui — PA-DIAG-120–145
-- Financeiro da plataforma: versões de planos, descontos, mensalidades, pagamentos,
-- notificações e Plano Fundadores. Tudo é server-only e auditado.

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete restrict,
  version integer not null check (version > 0),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text,
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents between 0 and 100000000),
  yearly_price_cents integer check (yearly_price_cents is null or yearly_price_cents between 0 and 100000000),
  currency text not null default 'BRL' check (currency = 'BRL'),
  effective_at timestamptz not null default now(),
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint plan_versions_plan_version_unique unique(plan_id,version)
);
create index plan_versions_plan_effective_idx on public.plan_versions(plan_id,effective_at desc,version desc);

create table public.plan_version_features (
  plan_version_id uuid not null references public.plan_versions(id) on delete restrict,
  feature_id uuid not null references public.features(id) on delete restrict,
  enabled boolean not null default true,
  limit_value bigint check (limit_value is null or limit_value >= 0),
  created_at timestamptz not null default now(),
  primary key(plan_version_id,feature_id)
);
create index plan_version_features_feature_idx on public.plan_version_features(feature_id,plan_version_id);

alter table public.plans add column if not exists current_version_id uuid references public.plan_versions(id) on delete restrict;
create index if not exists plans_current_version_idx on public.plans(current_version_id) where current_version_id is not null;

alter table public.organization_subscriptions
  add column if not exists plan_version_id uuid references public.plan_versions(id) on delete restrict,
  add column if not exists founder_slot smallint check (founder_slot is null or founder_slot between 1 and 3),
  add column if not exists grace_period_days smallint not null default 3 check (grace_period_days between 0 and 30),
  add column if not exists access_suspended_at timestamptz,
  add column if not exists access_suspension_reason text check (access_suspension_reason is null or char_length(trim(access_suspension_reason)) between 5 and 500);
create unique index if not exists organization_subscriptions_founder_slot_unique
  on public.organization_subscriptions(founder_slot) where founder_slot is not null;
create index if not exists organization_subscriptions_due_attention_idx
  on public.organization_subscriptions(payment_status,next_due_at,organization_id)
  where payment_status in ('pending','overdue');

create table public.subscription_billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  kind text not null check (kind in ('discount_percent','discount_amount','credit')),
  amount_cents integer,
  percentage numeric(5,2),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cancelled_at timestamptz,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (
    (kind in ('discount_amount','credit') and amount_cents between 1 and 100000000 and percentage is null)
    or (kind='discount_percent' and percentage > 0 and percentage <= 100 and amount_cents is null)
  )
);
create index subscription_billing_adjustments_active_idx
  on public.subscription_billing_adjustments(subscription_id,starts_at,ends_at)
  where cancelled_at is null;
create index subscription_billing_adjustments_org_idx on public.subscription_billing_adjustments(organization_id,created_at desc);

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  plan_version_id uuid references public.plan_versions(id) on delete restrict,
  reference_month date not null check (reference_month=date_trunc('month',reference_month)::date),
  base_amount_cents integer not null check (base_amount_cents between 0 and 100000000),
  discount_amount_cents integer not null default 0 check (discount_amount_cents between 0 and 100000000),
  total_amount_cents integer generated always as (greatest(base_amount_cents-discount_amount_cents,0)) stored,
  currency text not null default 'BRL' check (currency='BRL'),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','paid','overdue','cancelled','waived')),
  paid_at timestamptz,
  cancelled_at timestamptz,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_invoices_org_reference_unique unique(organization_id,reference_month),
  constraint subscription_invoices_org_idem_unique unique(organization_id,idempotency_key),
  check ((status='paid' and paid_at is not null) or status<>'paid'),
  check ((status='cancelled' and cancelled_at is not null) or status<>'cancelled')
);
create index subscription_invoices_subscription_idx on public.subscription_invoices(subscription_id,reference_month desc);
create index subscription_invoices_due_idx on public.subscription_invoices(status,due_at,organization_id)
  where status in ('pending','overdue');
create index subscription_invoices_plan_version_idx on public.subscription_invoices(plan_version_id) where plan_version_id is not null;

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.subscription_invoices(id) on delete restrict,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  currency text not null default 'BRL' check (currency='BRL'),
  method text not null check (method in ('manual','pix','boleto','card')),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded','cancelled')),
  provider_key text,
  provider_reference text,
  paid_at timestamptz,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_payments_org_idem_unique unique(organization_id,idempotency_key),
  check ((status='paid' and paid_at is not null) or status<>'paid')
);
create index subscription_payments_invoice_idx on public.subscription_payments(invoice_id,created_at desc);
create index subscription_payments_org_idx on public.subscription_payments(organization_id,created_at desc);
create unique index subscription_payments_provider_unique_idx
  on public.subscription_payments(provider_key,provider_reference)
  where provider_key is not null and provider_reference is not null;

create table public.subscription_billing_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  invoice_id uuid references public.subscription_invoices(id) on delete restrict,
  channel text not null check (channel in ('panel','whatsapp')),
  kind text not null check (kind in ('due_soon','due_today','overdue','suspended','reactivated')),
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  last_error text,
  idempotency_key text not null unique check (char_length(trim(idempotency_key)) between 8 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscription_billing_notifications_queue_idx
  on public.subscription_billing_notifications(status,scheduled_at,channel) where status='pending';
create index subscription_billing_notifications_org_idx on public.subscription_billing_notifications(organization_id,created_at desc);
create index subscription_billing_notifications_invoice_idx on public.subscription_billing_notifications(invoice_id) where invoice_id is not null;

create table public.platform_financial_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(trim(action)) between 3 and 120),
  entity_type text not null check (char_length(trim(entity_type)) between 3 and 80),
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  protocol text not null check (char_length(trim(protocol)) between 3 and 120),
  created_at timestamptz not null default now()
);
create index platform_financial_audit_org_idx on public.platform_financial_audit(organization_id,created_at desc,id);
create index platform_financial_audit_entity_idx on public.platform_financial_audit(entity_type,entity_id,created_at desc);

alter table public.plan_versions enable row level security;
alter table public.plan_version_features enable row level security;
alter table public.subscription_billing_adjustments enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_billing_notifications enable row level security;
alter table public.platform_financial_audit enable row level security;

revoke all on table public.plan_versions,public.plan_version_features,public.subscription_billing_adjustments,
  public.subscription_invoices,public.subscription_payments,public.subscription_billing_notifications,
  public.platform_financial_audit from anon,authenticated;
grant select,insert,update,delete on table public.plan_versions,public.plan_version_features,public.subscription_billing_adjustments,
  public.subscription_invoices,public.subscription_payments,public.subscription_billing_notifications,
  public.platform_financial_audit to service_role;

create policy plan_versions_browser_deny on public.plan_versions for all to anon,authenticated using(false) with check(false);
create policy plan_version_features_browser_deny on public.plan_version_features for all to anon,authenticated using(false) with check(false);
create policy subscription_billing_adjustments_browser_deny on public.subscription_billing_adjustments for all to anon,authenticated using(false) with check(false);
create policy subscription_invoices_browser_deny on public.subscription_invoices for all to anon,authenticated using(false) with check(false);
create policy subscription_payments_browser_deny on public.subscription_payments for all to anon,authenticated using(false) with check(false);
create policy subscription_billing_notifications_browser_deny on public.subscription_billing_notifications for all to anon,authenticated using(false) with check(false);
create policy platform_financial_audit_browser_deny on public.platform_financial_audit for all to anon,authenticated using(false) with check(false);

create or replace function private.require_platform_super_admin(p_actor_user_id uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists (
    select 1 from public.platform_admins
    where user_id=p_actor_user_id and role='super_admin' and active=true
  ) then raise exception 'platform super admin required'; end if;
end;
$$;
revoke all on function private.require_platform_super_admin(uuid) from public,anon,authenticated;

create or replace function private.prevent_financial_ledger_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'financial ledger is immutable'; end;
$$;
revoke all on function private.prevent_financial_ledger_mutation() from public,anon,authenticated;
create trigger plan_versions_immutable before update or delete on public.plan_versions
  for each row execute function private.prevent_financial_ledger_mutation();
create trigger plan_version_features_immutable before update or delete on public.plan_version_features
  for each row execute function private.prevent_financial_ledger_mutation();
create trigger platform_financial_audit_immutable before update or delete on public.platform_financial_audit
  for each row execute function private.prevent_financial_ledger_mutation();

create or replace function public.platform_plan_save_internal(
  p_plan_id uuid,p_key text,p_name text,p_description text,p_monthly_price_cents integer,
  p_yearly_price_cents integer,p_active boolean,p_position integer,p_feature_ids uuid[],
  p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.plans language plpgsql security invoker set search_path='' as $$
declare
  v_plan public.plans%rowtype;
  v_before jsonb;
  v_version integer;
  v_version_id uuid;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if trim(coalesce(p_key,'')) !~ '^[a-z0-9][a-z0-9._-]{1,79}$' then raise exception 'invalid plan key'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'invalid plan name'; end if;
  if p_monthly_price_cents is not null and p_monthly_price_cents not between 0 and 100000000 then raise exception 'invalid monthly price'; end if;
  if p_yearly_price_cents is not null and p_yearly_price_cents not between 0 and 100000000 then raise exception 'invalid yearly price'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 or char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'reason and protocol required'; end if;

  if p_plan_id is not null then
    select * into v_plan from public.plans where id=p_plan_id for update;
    if v_plan.id is null then raise exception 'plan not found'; end if;
    v_before:=to_jsonb(v_plan)-'metadata';
    update public.plans set key=trim(p_key),name=trim(p_name),description=nullif(trim(coalesce(p_description,'')),''),
      monthly_price_cents=p_monthly_price_cents,yearly_price_cents=p_yearly_price_cents,
      active=p_active,position=p_position,updated_at=now() where id=p_plan_id returning * into v_plan;
  else
    insert into public.plans(key,name,description,monthly_price_cents,yearly_price_cents,currency,active,position)
    values(trim(p_key),trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_monthly_price_cents,p_yearly_price_cents,'BRL',p_active,p_position)
    returning * into v_plan;
    v_before:=null;
  end if;

  update public.plan_features set enabled=false,updated_at=now() where plan_id=v_plan.id;
  insert into public.plan_features(plan_id,feature_id,enabled,updated_at)
    select v_plan.id,f.id,true,now() from public.features f where f.id=any(coalesce(p_feature_ids,'{}'::uuid[]))
    on conflict(plan_id,feature_id) do update set enabled=true,updated_at=now();

  select coalesce(max(version),0)+1 into v_version from public.plan_versions where plan_id=v_plan.id;
  insert into public.plan_versions(plan_id,version,name,description,monthly_price_cents,yearly_price_cents,currency,reason,protocol,created_by)
  values(v_plan.id,v_version,v_plan.name,v_plan.description,v_plan.monthly_price_cents,v_plan.yearly_price_cents,'BRL',trim(p_reason),trim(p_protocol),p_actor_user_id)
  returning id into v_version_id;
  insert into public.plan_version_features(plan_version_id,feature_id,enabled,limit_value)
    select v_version_id,pf.feature_id,pf.enabled,pf.limit_value from public.plan_features pf where pf.plan_id=v_plan.id;
  update public.plans set current_version_id=v_version_id where id=v_plan.id;

  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,protocol)
  values(null,p_actor_user_id,case when p_plan_id is null then 'platform.plan.created' else 'platform.plan.updated' end,
    'plan',v_plan.id,v_before,(to_jsonb(v_plan)-'metadata')||jsonb_build_object('version',v_version),trim(p_reason),trim(p_protocol));
  return v_plan;
end;
$$;
revoke all on function public.platform_plan_save_internal(uuid,text,text,text,integer,integer,boolean,integer,uuid[],uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_plan_save_internal(uuid,text,text,text,integer,integer,boolean,integer,uuid[],uuid,text,text) to service_role;

create or replace function public.subscription_adjustment_apply_internal(
  p_organization_id uuid,p_kind text,p_amount_cents integer,p_percentage numeric,p_starts_at timestamptz,p_ends_at timestamptz,
  p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.subscription_billing_adjustments language plpgsql security invoker set search_path='' as $$
declare v_sub public.organization_subscriptions%rowtype; v_row public.subscription_billing_adjustments%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_sub from public.organization_subscriptions where organization_id=p_organization_id and status in ('trialing','active','past_due') order by created_at desc limit 1;
  if v_sub.id is null then raise exception 'active subscription not found'; end if;
  insert into public.subscription_billing_adjustments(organization_id,subscription_id,kind,amount_cents,percentage,starts_at,ends_at,reason,protocol,created_by)
  values(p_organization_id,v_sub.id,p_kind,p_amount_cents,p_percentage,p_starts_at,p_ends_at,trim(p_reason),trim(p_protocol),p_actor_user_id) returning * into v_row;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(p_organization_id,p_actor_user_id,'platform.discount.created','subscription_adjustment',v_row.id,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_adjustment_apply_internal(uuid,text,integer,numeric,timestamptz,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscription_adjustment_apply_internal(uuid,text,integer,numeric,timestamptz,timestamptz,uuid,text,text) to service_role;

create or replace function public.subscription_adjustment_cancel_internal(
  p_adjustment_id uuid,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.subscription_billing_adjustments language plpgsql security invoker set search_path='' as $$
declare v_row public.subscription_billing_adjustments%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  update public.subscription_billing_adjustments set cancelled_at=coalesce(cancelled_at,now()) where id=p_adjustment_id returning * into v_row;
  if v_row.id is null then raise exception 'adjustment not found'; end if;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(v_row.organization_id,p_actor_user_id,'platform.discount.cancelled','subscription_adjustment',v_row.id,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_adjustment_cancel_internal(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscription_adjustment_cancel_internal(uuid,uuid,text,text) to service_role;

create or replace function public.subscription_invoice_save_internal(
  p_organization_id uuid,p_reference_month date,p_base_amount_cents integer,p_discount_amount_cents integer,
  p_due_at timestamptz,p_status text,p_actor_user_id uuid,p_reason text,p_protocol text,p_idempotency_key text
) returns public.subscription_invoices language plpgsql security invoker set search_path='' as $$
declare v_sub public.organization_subscriptions%rowtype; v_row public.subscription_invoices%rowtype; v_before jsonb;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_sub from public.organization_subscriptions where organization_id=p_organization_id order by (status in ('trialing','active','past_due')) desc,created_at desc limit 1;
  if v_sub.id is null then raise exception 'subscription not found'; end if;
  select * into v_row from public.subscription_invoices where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_row.id is not null then return v_row; end if;
  select to_jsonb(i) into v_before from public.subscription_invoices i where i.organization_id=p_organization_id and i.reference_month=date_trunc('month',p_reference_month)::date for update;
  insert into public.subscription_invoices(organization_id,subscription_id,plan_version_id,reference_month,base_amount_cents,discount_amount_cents,due_at,status,paid_at,cancelled_at,reason,protocol,idempotency_key,created_by)
  values(p_organization_id,v_sub.id,v_sub.plan_version_id,date_trunc('month',p_reference_month)::date,p_base_amount_cents,p_discount_amount_cents,p_due_at,p_status,
    case when p_status='paid' then now() end,case when p_status='cancelled' then now() end,trim(p_reason),trim(p_protocol),trim(p_idempotency_key),p_actor_user_id)
  on conflict(organization_id,reference_month) do update set base_amount_cents=excluded.base_amount_cents,discount_amount_cents=excluded.discount_amount_cents,
    due_at=excluded.due_at,status=excluded.status,paid_at=case when excluded.status='paid' then coalesce(public.subscription_invoices.paid_at,now()) else null end,
    cancelled_at=case when excluded.status='cancelled' then coalesce(public.subscription_invoices.cancelled_at,now()) else null end,
    reason=excluded.reason,protocol=excluded.protocol,updated_at=now() returning * into v_row;
  update public.organization_subscriptions set payment_status=case p_status when 'paid' then 'paid' when 'overdue' then 'overdue' when 'waived' then 'waived' else 'pending' end,
    next_due_at=p_due_at,updated_at=now() where id=v_sub.id;
  if p_status in ('pending','overdue') then
    insert into public.subscription_billing_notifications(organization_id,subscription_id,invoice_id,channel,kind,status,scheduled_at,idempotency_key)
    select p_organization_id,v_sub.id,v_row.id,notice.channel,notice.kind,'pending',notice.scheduled_at,
      'billing-notice:'||v_row.id::text||':'||notice.channel||':'||notice.kind
    from (values
      ('panel'::text,'due_soon'::text,p_due_at-interval '3 days'),('whatsapp','due_soon',p_due_at-interval '3 days'),
      ('panel','due_today',p_due_at),('whatsapp','due_today',p_due_at),
      ('panel','overdue',p_due_at+interval '1 day'),('whatsapp','overdue',p_due_at+interval '1 day')
    ) notice(channel,kind,scheduled_at)
    on conflict(idempotency_key) do nothing;
  end if;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,protocol)
  values(p_organization_id,p_actor_user_id,'platform.invoice.saved','subscription_invoice',v_row.id,v_before,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_invoice_save_internal(uuid,date,integer,integer,timestamptz,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.subscription_invoice_save_internal(uuid,date,integer,integer,timestamptz,text,uuid,text,text,text) to service_role;

create or replace function public.subscription_payment_record_internal(
  p_invoice_id uuid,p_amount_cents integer,p_method text,p_status text,p_actor_user_id uuid,p_reason text,p_protocol text,p_idempotency_key text
) returns public.subscription_payments language plpgsql security invoker set search_path='' as $$
declare v_invoice public.subscription_invoices%rowtype; v_row public.subscription_payments%rowtype;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_invoice from public.subscription_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'invoice not found'; end if;
  select * into v_row from public.subscription_payments where organization_id=v_invoice.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_row.id is not null then return v_row; end if;
  insert into public.subscription_payments(organization_id,invoice_id,amount_cents,method,status,paid_at,reason,protocol,idempotency_key,created_by)
  values(v_invoice.organization_id,v_invoice.id,p_amount_cents,p_method,p_status,case when p_status='paid' then now() end,trim(p_reason),trim(p_protocol),trim(p_idempotency_key),p_actor_user_id)
  returning * into v_row;
  if p_status='paid' then
    update public.subscription_invoices set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now() where id=v_invoice.id;
    update public.organization_subscriptions set payment_status='paid',updated_at=now() where id=v_invoice.subscription_id;
  end if;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(v_invoice.organization_id,p_actor_user_id,'platform.payment.recorded','subscription_payment',v_row.id,to_jsonb(v_row)-'provider_reference',trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_payment_record_internal(uuid,integer,text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.subscription_payment_record_internal(uuid,integer,text,text,uuid,text,text,text) to service_role;

create or replace function public.subscription_access_set_internal(
  p_organization_id uuid,p_suspended boolean,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.organization_subscriptions language plpgsql security invoker set search_path='' as $$
declare v_row public.organization_subscriptions%rowtype; v_before jsonb;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_row from public.organization_subscriptions where organization_id=p_organization_id and status in ('trialing','active','past_due') order by created_at desc limit 1 for update;
  if v_row.id is null then raise exception 'active subscription not found'; end if;
  v_before:=jsonb_build_object('status',v_row.status,'access_suspended_at',v_row.access_suspended_at);
  update public.organization_subscriptions set status=case when p_suspended then 'past_due' else 'active' end,
    access_suspended_at=case when p_suspended then coalesce(access_suspended_at,now()) else null end,
    access_suspension_reason=case when p_suspended then trim(p_reason) else null end,updated_at=now()
    where id=v_row.id returning * into v_row;
  insert into public.subscription_billing_notifications(organization_id,subscription_id,channel,kind,status,scheduled_at,idempotency_key)
  select p_organization_id,v_row.id,channel,case when p_suspended then 'suspended' else 'reactivated' end,'pending',now(),
    'billing-access:'||v_row.id::text||':'||case when p_suspended then 'suspended' else 'reactivated' end||':'||channel||':'||extract(epoch from now())::bigint::text
  from (values('panel'::text),('whatsapp'::text)) channels(channel);
  insert into public.subscription_history(organization_id,subscription_id,from_status,to_status,event_type,idempotency_key,metadata)
  values(p_organization_id,v_row.id,v_before->>'status',v_row.status,case when p_suspended then 'platform.subscription_suspended' else 'platform.subscription_reactivated' end,
    'access:'||v_row.id::text||':'||extract(epoch from now())::bigint::text,jsonb_build_object('actor_user_id',p_actor_user_id,'reason',trim(p_reason),'protocol',trim(p_protocol)));
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,protocol)
  values(p_organization_id,p_actor_user_id,case when p_suspended then 'platform.subscription.suspended' else 'platform.subscription.reactivated' end,
    'organization_subscription',v_row.id,v_before,jsonb_build_object('status',v_row.status,'access_suspended_at',v_row.access_suspended_at),trim(p_reason),trim(p_protocol));
  return v_row;
end;
$$;
revoke all on function public.subscription_access_set_internal(uuid,boolean,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscription_access_set_internal(uuid,boolean,uuid,text,text) to service_role;

create or replace function public.subscription_founder_assign_internal(
  p_organization_id uuid,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.organization_subscriptions language plpgsql security invoker set search_path='' as $$
declare v_sub public.organization_subscriptions%rowtype; v_plan public.plans%rowtype; v_slot smallint;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  perform pg_advisory_xact_lock(hashtextextended('pedeaqui:founder-slots',0));
  select * into v_sub from public.organization_subscriptions where organization_id=p_organization_id and status in ('trialing','active','past_due') order by created_at desc limit 1 for update;
  if v_sub.id is null then raise exception 'active subscription not found'; end if;
  if v_sub.founder_slot is not null then return v_sub; end if;
  select * into v_plan from public.plans where key='founders' and active=true;
  if v_plan.id is null then raise exception 'founders plan unavailable'; end if;
  select slot::smallint into v_slot from generate_series(1,3) slot where not exists(select 1 from public.organization_subscriptions where founder_slot=slot) order by slot limit 1;
  if v_slot is null then raise exception 'founders plan capacity reached'; end if;
  update public.organization_subscriptions set plan_id=v_plan.id,plan_version_id=v_plan.current_version_id,founder_slot=v_slot,
    agreed_price_cents=7990,price_locked=true,price_locked_at=coalesce(price_locked_at,now()),price_lock_reason='Um dos três primeiros clientes do PedeAqui',updated_at=now()
    where id=v_sub.id returning * into v_sub;
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(p_organization_id,p_actor_user_id,'platform.founder.assigned','organization_subscription',v_sub.id,
    jsonb_build_object('founder_slot',v_slot,'agreed_price_cents',7990,'price_locked',true),trim(p_reason),trim(p_protocol));
  return v_sub;
end;
$$;
revoke all on function public.subscription_founder_assign_internal(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.subscription_founder_assign_internal(uuid,uuid,text,text) to service_role;

-- O plano nasce com as ferramentas do Essencial; mudanças futuras criam nova versão.
insert into public.plans(key,name,description,active,position,monthly_price_cents,yearly_price_cents,currency,metadata)
values('founders','Fundadores','Exclusivo para os três primeiros clientes, com mensalidade vitalícia de R$ 79,90.',true,5,7990,null,'BRL',jsonb_build_object('founder_capacity',3,'price_locked',true))
on conflict(key) do update set name=excluded.name,description=excluded.description,active=true,position=excluded.position,monthly_price_cents=7990,currency='BRL',metadata=public.plans.metadata||excluded.metadata,updated_at=now();

insert into public.plan_features(plan_id,feature_id,enabled,limit_value)
select founders.id,pf.feature_id,pf.enabled,pf.limit_value
from public.plans founders join public.plans essential on essential.key='essential'
join public.plan_features pf on pf.plan_id=essential.id
where founders.key='founders'
on conflict(plan_id,feature_id) do update set enabled=excluded.enabled,limit_value=excluded.limit_value,updated_at=now();

do $$
declare v_plan public.plans%rowtype; v_version_id uuid; v_actor uuid;
begin
  select user_id into v_actor from public.platform_admins where role='super_admin' and active=true order by created_at limit 1;
  if v_actor is not null then
    for v_plan in select * from public.plans where current_version_id is null order by position,id loop
      insert into public.plan_versions(plan_id,version,name,description,monthly_price_cents,yearly_price_cents,currency,reason,protocol,created_by)
      values(v_plan.id,1,v_plan.name,v_plan.description,v_plan.monthly_price_cents,v_plan.yearly_price_cents,'BRL',
        case when v_plan.key='founders' then 'Criação do Plano Fundadores para os três primeiros clientes' else 'Versão inicial do catálogo comercial existente' end,
        case when v_plan.key='founders' then 'PA-DIAG-144' else 'PA-DIAG-141' end,v_actor)
      returning id into v_version_id;
      insert into public.plan_version_features(plan_version_id,feature_id,enabled,limit_value)
        select v_version_id,feature_id,enabled,limit_value from public.plan_features where plan_id=v_plan.id;
      update public.plans set current_version_id=v_version_id where id=v_plan.id;
    end loop;
  end if;
end $$;

update public.organization_subscriptions s set plan_version_id=p.current_version_id
from public.plans p where p.id=s.plan_id and s.plan_version_id is null and p.current_version_id is not null;

-- Novas assinaturas preservam a versão vigente do plano; contratos antigos não mudam em reajustes.
create or replace function private.subscription_attach_plan_version()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.plan_version_id is null then select current_version_id into new.plan_version_id from public.plans where id=new.plan_id; end if;
  return new;
end;
$$;
revoke all on function private.subscription_attach_plan_version() from public,anon,authenticated;
create trigger organization_subscriptions_attach_plan_version before insert or update of plan_id on public.organization_subscriptions
  for each row execute function private.subscription_attach_plan_version();
