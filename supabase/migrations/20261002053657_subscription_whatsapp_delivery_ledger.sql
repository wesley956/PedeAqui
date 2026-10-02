-- Official platform billing only. Never reclaimed automatically after send starts.
create table public.subscription_whatsapp_deliveries (
  notification_id uuid primary key references public.subscription_billing_notifications(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  state text not null check (state in ('ready','sending','sent','rejected','unknown')),
  attempt_token uuid not null default gen_random_uuid(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  external_message_id text,
  result_code text,
  updated_at timestamptz not null default now()
);
create index subscription_whatsapp_deliveries_org_idx on public.subscription_whatsapp_deliveries(organization_id,updated_at);
alter table public.subscription_whatsapp_deliveries enable row level security;
revoke all on public.subscription_whatsapp_deliveries from public,anon,authenticated;
grant select,insert,update on public.subscription_whatsapp_deliveries to service_role;

create table public.subscription_whatsapp_attempts (
  attempt_token uuid primary key,
  notification_id uuid not null references public.subscription_whatsapp_deliveries(notification_id) on delete restrict,
  state text not null check (state in ('sending','sent','rejected','unknown')),
  external_message_id text,
  result_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscription_whatsapp_attempts_notification_idx on public.subscription_whatsapp_attempts(notification_id,created_at);
alter table public.subscription_whatsapp_attempts enable row level security;
revoke all on public.subscription_whatsapp_attempts from public,anon,authenticated;
grant select,insert,update on public.subscription_whatsapp_attempts to service_role;

create function public.claim_subscription_whatsapp(p_notification_id uuid,p_organization_id uuid,p_subscription_updated_at timestamptz,p_invoice_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_notice public.subscription_billing_notifications; v_subscription public.organization_subscriptions;
  v_invoice public.subscription_invoices; v_token uuid; v_stale boolean := false;
begin
  select * into v_notice from public.subscription_billing_notifications
  where id=p_notification_id and organization_id=p_organization_id and channel='whatsapp'
    and status='pending' and scheduled_at<=now() for update;
  if not found then return null; end if;
  select * into v_subscription from public.organization_subscriptions
  where id=v_notice.subscription_id and organization_id=p_organization_id for share;
  if not found then return null; end if;
  if v_subscription.updated_at is distinct from p_subscription_updated_at then return null; end if;
  if v_notice.kind in ('due_soon','due_today','overdue') then
    select * into v_invoice from public.subscription_invoices where id=v_notice.invoice_id
      and organization_id=p_organization_id and subscription_id=v_notice.subscription_id for share;
    if not found then return null; end if;
    if v_invoice.updated_at is distinct from p_invoice_updated_at then return null; end if;
    v_stale := v_invoice.status not in ('pending','overdue')
      or (v_invoice.status='overdue' and v_notice.kind in ('due_soon','due_today'));
  elsif v_notice.kind='suspended' then
    v_stale := v_subscription.access_suspended_at is null;
  elsif v_notice.kind='reactivated' then
    v_stale := v_subscription.access_suspended_at is not null or v_subscription.status<>'active';
  end if;
  if v_stale then
    update public.subscription_billing_notifications set status='cancelled',updated_at=now() where id=v_notice.id;
    return null;
  end if;
  insert into public.subscription_whatsapp_deliveries(notification_id,organization_id,state)
    values(v_notice.id,p_organization_id,'ready') on conflict(notification_id) do nothing;
  update public.subscription_whatsapp_deliveries set state='sending',updated_at=now()
    where notification_id=v_notice.id and organization_id=p_organization_id and state='ready'
    returning attempt_token into v_token;
  if v_token is not null then
    insert into public.subscription_whatsapp_attempts(attempt_token,notification_id,state) values(v_token,v_notice.id,'sending');
  end if;
  return v_token;
end $$;

create function public.finish_subscription_whatsapp(p_notification_id uuid,p_organization_id uuid,p_attempt_token uuid,
  p_state text,p_external_message_id text default null,p_result_code text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_state not in ('sent','rejected','unknown') or (p_state='sent' and nullif(trim(p_external_message_id),'') is null)
    or (p_state<>'sent' and p_external_message_id is not null) then raise exception 'invalid delivery result'; end if;
  perform 1 from public.subscription_billing_notifications where id=p_notification_id and organization_id=p_organization_id for update;
  if not found then return false; end if;
  update public.subscription_whatsapp_deliveries set state=p_state,external_message_id=p_external_message_id,
    result_code=left(p_result_code,80),updated_at=now()
  where notification_id=p_notification_id and organization_id=p_organization_id and attempt_token=p_attempt_token and state='sending';
  if not found then return false; end if;
  update public.subscription_whatsapp_attempts set state=p_state,external_message_id=p_external_message_id,
    result_code=left(p_result_code,80),updated_at=now() where attempt_token=p_attempt_token and notification_id=p_notification_id;
  update public.subscription_billing_notifications set status=case when p_state='sent' then 'sent' else 'failed' end,
    sent_at=case when p_state='sent' then now() else null end,last_error=left(p_result_code,80),updated_at=now()
    where id=p_notification_id and organization_id=p_organization_id and channel='whatsapp';
  return true;
end $$;

create function public.reprocess_subscription_whatsapp(p_notification_id uuid,p_organization_id uuid,p_actor_user_id uuid,p_reason text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if char_length(trim(p_reason)) not between 5 and 500 then raise exception 'audit reason required'; end if;
  -- Same lock order as claim/finish; unknown/sending/sent can NEVER be retried here.
  perform 1 from public.subscription_billing_notifications where id=p_notification_id and organization_id=p_organization_id for update;
  if not found then return false; end if;
  update public.subscription_whatsapp_deliveries set state='ready',attempt_token=gen_random_uuid(),attempt_count=attempt_count+1,
    external_message_id=null,result_code=null,updated_at=now()
    where notification_id=p_notification_id and organization_id=p_organization_id and state='rejected';
  if not found then return false; end if;
  update public.subscription_billing_notifications set status='pending',last_error=null,updated_at=now()
    where id=p_notification_id and organization_id=p_organization_id and channel='whatsapp';
  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,reason,protocol)
    values(p_organization_id,p_actor_user_id,'billing.whatsapp_reprocess','billing_notification',p_notification_id,
      trim(p_reason),'WHATSAPP-'||p_notification_id::text);
  return true;
end $$;

revoke all on function public.claim_subscription_whatsapp(uuid,uuid,timestamptz,timestamptz),
  public.finish_subscription_whatsapp(uuid,uuid,uuid,text,text,text),
  public.reprocess_subscription_whatsapp(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_subscription_whatsapp(uuid,uuid,timestamptz,timestamptz),
  public.finish_subscription_whatsapp(uuid,uuid,uuid,text,text,text),
  public.reprocess_subscription_whatsapp(uuid,uuid,uuid,text) to service_role;
