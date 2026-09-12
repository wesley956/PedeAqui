-- PedeAqui — #1023 Métricas reais, observabilidade e prova final do Growth.

alter table public.campaign_recipients
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists last_status_at timestamptz;

update public.campaign_recipients
set sent_at = case when status in ('sent','delivered','read') then coalesce(sent_at,processed_at,created_at) else sent_at end,
    delivered_at = case when status in ('delivered','read') then coalesce(delivered_at,processed_at,created_at) else delivered_at end,
    read_at = case when status='read' then coalesce(read_at,processed_at,created_at) else read_at end,
    failed_at = case when status='failed_permanent' then coalesce(failed_at,processed_at,created_at) else failed_at end,
    last_status_at = coalesce(last_status_at,processed_at,created_at)
where last_status_at is null;

create index if not exists campaign_recipients_attribution_idx
  on public.campaign_recipients(organization_id,store_id,campaign_id,customer_id,sent_at)
  where sent_at is not null;

create table if not exists public.growth_operational_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  event_type text not null check (event_type ~ '^[a-z0-9_.-]{3,80}$'),
  outcome text not null check (outcome in ('success','partial','skipped','failed','blocked')),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_.-]{2,100}$'),
  source text not null check (source ~ '^[a-z0-9_.-]{2,80}$'),
  campaign_id uuid,
  rule_id uuid,
  conversation_id uuid,
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts)='object'),
  duration_ms integer check (duration_ms is null or duration_ms>=0),
  occurred_at timestamptz not null default now(),
  constraint growth_operational_events_store_fk foreign key(organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint growth_operational_events_campaign_fk foreign key(organization_id,store_id,campaign_id)
    references public.campaigns(organization_id,store_id,id) on delete cascade,
  constraint growth_operational_events_rule_fk foreign key(organization_id,store_id,rule_id)
    references public.automation_rules(organization_id,store_id,id) on delete cascade,
  constraint growth_operational_events_conversation_fk foreign key(organization_id,store_id,conversation_id)
    references public.conversations(organization_id,store_id,id) on delete cascade
);
create index if not exists growth_operational_events_store_time_idx
  on public.growth_operational_events(organization_id,store_id,occurred_at desc);
create index if not exists growth_operational_events_failure_idx
  on public.growth_operational_events(organization_id,store_id,event_type,outcome,occurred_at desc)
  where outcome in ('failed','blocked','partial');
alter table public.growth_operational_events enable row level security;
revoke all on table public.growth_operational_events from public,anon,authenticated;
grant select on table public.growth_operational_events to authenticated;
grant select,insert,delete on table public.growth_operational_events to service_role;
drop policy if exists growth_operational_events_view on public.growth_operational_events;
create policy growth_operational_events_view on public.growth_operational_events for select to authenticated
using (private.has_permission(organization_id,store_id,'growth.view'));

create or replace function public.growth_record_operational_event_internal(
  p_organization_id uuid,p_store_id uuid,p_event_type text,p_outcome text,p_reason_code text,
  p_source text,p_campaign_id uuid default null,p_rule_id uuid default null,p_conversation_id uuid default null,
  p_counts jsonb default '{}'::jsonb,p_duration_ms integer default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.stores where organization_id=p_organization_id and id=p_store_id) then raise exception 'store scope mismatch'; end if;
  insert into public.growth_operational_events(
    organization_id,store_id,event_type,outcome,reason_code,source,campaign_id,rule_id,conversation_id,counts,duration_ms
  ) values(
    p_organization_id,p_store_id,lower(trim(p_event_type)),p_outcome,nullif(lower(trim(coalesce(p_reason_code,''))),''),
    lower(trim(p_source)),p_campaign_id,p_rule_id,p_conversation_id,coalesce(p_counts,'{}'::jsonb),p_duration_ms
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.growth_record_operational_event_internal(uuid,uuid,text,text,text,text,uuid,uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.growth_record_operational_event_internal(uuid,uuid,text,text,text,text,uuid,uuid,uuid,jsonb,integer) to service_role;

create or replace function public.growth_campaign_metrics_internal(
  p_organization_id uuid,p_store_id uuid,p_window_days integer default 30,p_attribution_days integer default 7
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_since timestamptz; v_campaigns jsonb; v_automations jsonb; v_benefits jsonb; v_operations jsonb;
begin
  if p_window_days not between 1 and 366 or p_attribution_days not between 1 and 30 then raise exception 'invalid metrics window'; end if;
  if not exists(select 1 from public.stores where organization_id=p_organization_id and id=p_store_id) then raise exception 'store scope mismatch'; end if;
  v_since:=now()-make_interval(days=>p_window_days);

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_campaigns from (
    select c.created_at,jsonb_build_object(
      'campaign_id',c.id,'prepared',count(cr.id),
      'queued',count(cr.id) filter(where cr.status in ('queued','sending','failed_transient')),
      'sent',count(cr.id) filter(where cr.sent_at is not null),
      'delivered',count(cr.id) filter(where cr.delivered_at is not null),
      'read',count(cr.id) filter(where cr.read_at is not null),
      'failed',count(cr.id) filter(where cr.status='failed_permanent'),
      'suppressed',count(cr.id) filter(where cr.last_error_code in ('active_human_conversation','active_order','whatsapp_order_active','daily_limit','weekly_limit','minimum_interval','campaign_paused')),
      'opted_out',count(cr.id) filter(where cr.status='skipped_opt_out'),
      'invalid_contact',count(cr.id) filter(where cr.status='skipped_invalid_contact'),
      'responses',(
        select count(*) from public.campaign_recipients rx where rx.campaign_id=c.id and rx.sent_at is not null and exists(
          select 1 from public.contacts ct join public.messages m on m.organization_id=ct.organization_id and m.store_id=ct.store_id and m.contact_id=ct.id
          where ct.organization_id=c.organization_id and ct.store_id=c.store_id and ct.customer_id=rx.customer_id and m.direction='inbound'
            and m.created_at>=rx.sent_at and m.created_at<rx.sent_at+make_interval(days=>p_attribution_days)
        )
      ),
      'assisted_orders',(
        select count(distinct o.id) from public.orders o join public.campaign_recipients rx on rx.organization_id=o.organization_id and rx.store_id=o.store_id and rx.customer_id=o.customer_id
        where rx.campaign_id=c.id and rx.sent_at is not null and o.order_status='completed' and o.completed_at>=rx.sent_at and o.completed_at<rx.sent_at+make_interval(days=>p_attribution_days)
      ),
      'assisted_revenue_cents',coalesce((
        select sum(x.total_cents) from (select distinct o.id,o.total_cents from public.orders o join public.campaign_recipients rx on rx.organization_id=o.organization_id and rx.store_id=o.store_id and rx.customer_id=o.customer_id
          where rx.campaign_id=c.id and rx.sent_at is not null and o.order_status='completed' and o.completed_at>=rx.sent_at and o.completed_at<rx.sent_at+make_interval(days=>p_attribution_days)) x
      ),0),
      'coupons_used',(
        select count(distinct r.id) from public.coupon_redemptions r join public.campaign_recipients rx on rx.organization_id=r.organization_id and rx.store_id=r.store_id and rx.customer_id=r.customer_id
        where rx.campaign_id=c.id and rx.sent_at is not null and r.status='consumed' and r.consumed_at>=rx.sent_at and r.consumed_at<rx.sent_at+make_interval(days=>p_attribution_days)
      )
    ) row_data
    from public.campaigns c left join public.campaign_recipients cr on cr.campaign_id=c.id
    where c.organization_id=p_organization_id and c.store_id=p_store_id and c.created_at>=v_since
    group by c.id,c.organization_id,c.store_id,c.created_at
  ) metrics;

  select jsonb_build_object(
    'executed',count(*),'completed',count(*) filter(where status='completed'),'skipped',count(*) filter(where status='skipped'),
    'failed',count(*) filter(where status='failed'),'processing',count(*) filter(where status='processing')
  ) into v_automations from public.automation_runs where organization_id=p_organization_id and store_id=p_store_id and started_at>=v_since;

  select jsonb_build_object(
    'cashback_earned_cents',coalesce((select sum(amount_cents) from public.cashback_transactions where organization_id=p_organization_id and store_id=p_store_id and transaction_type='earn' and created_at>=v_since),0),
    'cashback_redeemed_cents',abs(coalesce((select sum(amount_cents) from public.cashback_transactions where organization_id=p_organization_id and store_id=p_store_id and transaction_type='redeem' and created_at>=v_since),0)),
    'points_earned',coalesce((select sum(points) from public.loyalty_transactions where organization_id=p_organization_id and store_id=p_store_id and transaction_type='earn' and created_at>=v_since),0),
    'points_redeemed',abs(coalesce((select sum(points) from public.loyalty_transactions where organization_id=p_organization_id and store_id=p_store_id and transaction_type='redeem' and created_at>=v_since),0))
  ) into v_benefits;

  select coalesce(jsonb_agg(jsonb_build_object('event_type',event_type,'outcome',outcome,'reason_code',reason_code,'count',total) order by total desc),'[]'::jsonb)
  into v_operations from (
    select event_type,outcome,reason_code,count(*) total from public.growth_operational_events
    where organization_id=p_organization_id and store_id=p_store_id and occurred_at>=v_since
    group by event_type,outcome,reason_code
  ) events;

  return jsonb_build_object(
    'window_days',p_window_days,'attribution_days',p_attribution_days,'generated_at',now(),
    'methodology','Retornos, respostas, cupons e receita são assistidos quando ocorrem após o envio dentro da janela; não representam causalidade garantida.',
    'campaigns',v_campaigns,'automations',v_automations,'benefits',v_benefits,'operations',v_operations
  );
end $$;
revoke all on function public.growth_campaign_metrics_internal(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.growth_campaign_metrics_internal(uuid,uuid,integer,integer) to service_role;

create or replace function public.campaign_update_delivery_internal(
  p_store_id uuid,p_provider_message_id text,p_status text,p_error_code text default null,p_reason text default null
) returns public.campaign_recipients language plpgsql security invoker set search_path='' as $$
declare v_row public.campaign_recipients%rowtype; v_old_rank integer; v_new_rank integer;
begin
  if p_status not in ('sent','delivered','read','failed') then raise exception 'invalid campaign delivery status'; end if;
  select * into v_row from public.campaign_recipients where store_id=p_store_id and provider_message_id=p_provider_message_id for update;
  if v_row.id is null then return null; end if;
  v_old_rank:=case v_row.status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  v_new_rank:=case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else -1 end;
  if p_status<>'failed' and v_old_rank>=v_new_rank then return v_row; end if;
  update public.campaign_recipients set
    status=case when p_status='failed' then 'failed_permanent' else p_status end,
    sent_at=case when p_status in ('sent','delivered','read') then coalesce(sent_at,now()) else sent_at end,
    delivered_at=case when p_status in ('delivered','read') then coalesce(delivered_at,now()) else delivered_at end,
    read_at=case when p_status='read' then coalesce(read_at,now()) else read_at end,
    failed_at=case when p_status='failed' then coalesce(failed_at,now()) else failed_at end,last_status_at=now(),
    last_error_code=case when p_status='failed' then left(nullif(trim(coalesce(p_error_code,'')),''),120) else last_error_code end,
    reason=case when p_status='failed' then left(nullif(trim(coalesce(p_reason,'')),''),500) else reason end,processed_at=coalesce(processed_at,now())
  where id=v_row.id returning * into v_row;
  return v_row;
end $$;
revoke all on function public.campaign_update_delivery_internal(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.campaign_update_delivery_internal(uuid,text,text,text,text) to service_role;

create or replace function public.campaign_finish_internal(
  p_recipient_id uuid,p_worker_id text,p_status text,p_provider_message_id text,p_error_code text,p_reason text,p_retry_after_seconds integer
) returns void language plpgsql security invoker set search_path='' as $$
declare v_row public.campaign_recipients%rowtype; v_remaining integer; v_failed boolean;
begin
  if p_status not in ('sent','delivered','read','failed_transient','failed_permanent','skipped_opt_out','skipped_invalid_contact') then raise exception 'invalid campaign recipient result'; end if;
  select * into v_row from public.campaign_recipients where id=p_recipient_id for update;
  if v_row.id is null or v_row.lease_owner is distinct from trim(p_worker_id) then raise exception 'campaign recipient lease mismatch'; end if;
  update public.campaign_recipients set status=p_status,provider_message_id=p_provider_message_id,last_error_code=p_error_code,reason=left(p_reason,500),
    sent_at=case when p_status in ('sent','delivered','read') then coalesce(sent_at,now()) else sent_at end,
    delivered_at=case when p_status in ('delivered','read') then coalesce(delivered_at,now()) else delivered_at end,
    read_at=case when p_status='read' then coalesce(read_at,now()) else read_at end,
    failed_at=case when p_status='failed_permanent' or (p_status='failed_transient' and attempts>=5) then coalesce(failed_at,now()) else failed_at end,last_status_at=now(),
    next_attempt_at=case when p_status='failed_transient' and attempts<5 then now()+make_interval(secs=>greatest(coalesce(p_retry_after_seconds,60),30)) else null end,
    processed_at=case when p_status='failed_transient' and attempts<5 then null else now() end,lease_owner=null,lease_expires_at=null where id=v_row.id;
  if p_status='failed_transient' and v_row.attempts>=5 then update public.campaign_recipients set status='failed_permanent',processed_at=now(),failed_at=coalesce(failed_at,now()),last_status_at=now() where id=v_row.id; end if;
  select count(*) into v_remaining from public.campaign_recipients where coalesce(occurrence_id,v_row.campaign_id)=coalesce(v_row.occurrence_id,v_row.campaign_id) and status in ('queued','sending','failed_transient');
  select exists(select 1 from public.campaign_recipients where coalesce(occurrence_id,v_row.campaign_id)=coalesce(v_row.occurrence_id,v_row.campaign_id) and status='failed_permanent') into v_failed;
  if v_remaining=0 then
    if v_row.occurrence_id is not null then update public.campaign_occurrences set status=case when coalesce(v_failed,false) then 'partially_failed' else 'completed' end,completed_at=now() where id=v_row.occurrence_id; end if;
    update public.campaigns c set status=case when exists(select 1 from public.campaign_recipients x where x.campaign_id=c.id and x.status='failed_permanent') then 'partially_failed' else 'completed' end,completed_at=now(),updated_at=now()
    where c.id=v_row.campaign_id and c.status<>'canceled' and c.next_run_at is null
      and not exists(select 1 from public.automation_rules r where r.organization_id=c.organization_id and r.store_id=c.store_id and r.active and r.action_type='campaign' and r.action_config->>'campaign_id'=c.id::text);
  end if;
end $$;
revoke all on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) to service_role;
