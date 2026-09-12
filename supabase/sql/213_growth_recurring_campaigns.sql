-- PedeAqui — #1021 Campanhas agendadas/recorrentes e supressão operacional.

alter table public.store_operational_settings
  add column if not exists promotional_min_interval_hours integer not null default 24 check (promotional_min_interval_hours between 1 and 168),
  add column if not exists promotional_daily_limit integer not null default 1 check (promotional_daily_limit between 1 and 3),
  add column if not exists promotional_weekly_limit integer not null default 3 check (promotional_weekly_limit between 1 and 10);

alter table public.campaigns
  add column if not exists schedule_type text not null default 'now' check (schedule_type in ('now','once','daily','weekly')),
  add column if not exists local_send_time time,
  add column if not exists recurrence_weekdays smallint[] not null default '{}'::smallint[],
  add column if not exists schedule_starts_on date,
  add column if not exists schedule_ends_on date,
  add column if not exists next_run_at timestamptz,
  add column if not exists paused_at timestamptz;

alter table public.campaigns drop constraint if exists campaigns_schedule_valid;
alter table public.campaigns add constraint campaigns_schedule_valid check (
  (schedule_type='now') or
  (local_send_time is not null and schedule_starts_on is not null and (schedule_ends_on is null or schedule_ends_on>=schedule_starts_on)
    and (schedule_type<>'weekly' or (cardinality(recurrence_weekdays) between 1 and 7 and recurrence_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])))
);

create table if not exists public.campaign_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  campaign_id uuid not null,
  occurrence_key text not null,
  scheduled_for timestamptz not null,
  content_version integer not null check (content_version>0),
  content_snapshot text not null default '',
  template_name_snapshot text not null,
  template_language_snapshot text not null,
  template_data_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','queued','running','completed','partially_failed','canceled')),
  member_count integer not null default 0 check (member_count>=0),
  eligible_count integer not null default 0 check (eligible_count>=0),
  excluded_count integer not null default 0 check (excluded_count>=0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campaign_occurrences_campaign_fk foreign key (organization_id,store_id,campaign_id)
    references public.campaigns(organization_id,store_id,id) on delete cascade,
  constraint campaign_occurrences_campaign_key_unique unique(campaign_id,occurrence_key),
  constraint campaign_occurrences_org_store_id_unique unique(organization_id,store_id,id)
);
create index if not exists campaign_occurrences_due_idx on public.campaign_occurrences(store_id,status,scheduled_for);
alter table public.campaign_occurrences enable row level security;
revoke all on table public.campaign_occurrences from anon,authenticated;
grant select on table public.campaign_occurrences to authenticated;
grant select,insert,update,delete on table public.campaign_occurrences to service_role;
drop policy if exists campaign_occurrences_view on public.campaign_occurrences;
create policy campaign_occurrences_view on public.campaign_occurrences for select to authenticated
using (private.has_permission(organization_id,store_id,'growth.view'));

alter table public.campaign_recipients add column if not exists occurrence_id uuid;
alter table public.campaign_recipients drop constraint if exists campaign_recipients_occurrence_fk;
alter table public.campaign_recipients add constraint campaign_recipients_occurrence_fk
  foreign key(organization_id,store_id,occurrence_id) references public.campaign_occurrences(organization_id,store_id,id) on delete cascade;
alter table public.campaign_recipients drop constraint if exists campaign_recipients_campaign_customer_unique;
create unique index if not exists campaign_recipients_occurrence_customer_unique
  on public.campaign_recipients(occurrence_id,customer_id) where occurrence_id is not null;
create unique index if not exists campaign_recipients_legacy_customer_unique
  on public.campaign_recipients(campaign_id,customer_id) where occurrence_id is null;

create or replace function private.campaign_next_run(
  p_store_id uuid,p_schedule_type text,p_local_time time,p_weekdays smallint[],p_starts_on date,p_ends_on date,p_after timestamptz
) returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare v_timezone text; v_local_after timestamp; v_date date; v_candidate timestamptz; v_offset integer;
begin
  select timezone into v_timezone from public.stores where id=p_store_id;
  if v_timezone is null or p_schedule_type='now' then return null; end if;
  v_local_after:=p_after at time zone v_timezone;
  if p_schedule_type='once' then
    v_candidate:=(p_starts_on+p_local_time) at time zone v_timezone;
    return case when v_candidate>p_after then v_candidate else null end;
  end if;
  for v_offset in 0..370 loop
    v_date:=greatest(p_starts_on,v_local_after::date)+v_offset;
    exit when p_ends_on is not null and v_date>p_ends_on;
    if p_schedule_type='daily' or (p_schedule_type='weekly' and extract(isodow from v_date)::smallint=any(p_weekdays)) then
      v_candidate:=(v_date+p_local_time) at time zone v_timezone;
      if v_candidate>p_after then return v_candidate; end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function private.campaign_next_run(uuid,text,time,smallint[],date,date,timestamptz) from public,anon,authenticated;
grant execute on function private.campaign_next_run(uuid,text,time,smallint[],date,date,timestamptz) to service_role;

create or replace function public.campaign_schedule_internal(p_campaign_id uuid,p_actor_user_id uuid)
returns public.campaigns language plpgsql security invoker set search_path='' as $$
declare v_campaign public.campaigns%rowtype; v_result public.campaigns%rowtype;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.schedule_type='now' then return v_campaign; end if;
  if v_campaign.channel<>'whatsapp' or nullif(trim(v_campaign.template_name),'') is null then raise exception 'approved WhatsApp template is required'; end if;
  update public.campaigns set status='scheduled',paused_at=null,
    next_run_at=private.campaign_next_run(store_id,schedule_type,local_send_time,recurrence_weekdays,schedule_starts_on,schedule_ends_on,now()-interval '1 second'),
    scheduled_at=private.campaign_next_run(store_id,schedule_type,local_send_time,recurrence_weekdays,schedule_starts_on,schedule_ends_on,now()-interval '1 second'),
    updated_by=p_actor_user_id,updated_at=now() where id=v_campaign.id returning * into v_result;
  if v_result.next_run_at is null then raise exception 'campaign schedule has no future occurrence'; end if;
  return v_result;
end $$;
revoke all on function public.campaign_schedule_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.campaign_schedule_internal(uuid,uuid) to service_role;

create or replace function public.campaign_pause_internal(p_campaign_id uuid,p_paused boolean,p_actor_user_id uuid)
returns public.campaigns language plpgsql security invoker set search_path='' as $$
declare v_campaign public.campaigns%rowtype; v_result public.campaigns%rowtype;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null or v_campaign.schedule_type='now' or v_campaign.status in ('completed','partially_failed','canceled') then raise exception 'campaign cannot be paused'; end if;
  update public.campaigns set paused_at=case when p_paused then now() else null end,
    next_run_at=case when p_paused then next_run_at else private.campaign_next_run(store_id,schedule_type,local_send_time,recurrence_weekdays,schedule_starts_on,schedule_ends_on,now()) end,
    scheduled_at=case when p_paused then scheduled_at else private.campaign_next_run(store_id,schedule_type,local_send_time,recurrence_weekdays,schedule_starts_on,schedule_ends_on,now()) end,
    updated_by=p_actor_user_id,updated_at=now() where id=v_campaign.id returning * into v_result;
  return v_result;
end $$;
revoke all on function public.campaign_pause_internal(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.campaign_pause_internal(uuid,boolean,uuid) to service_role;

create or replace function public.campaign_update_content_internal(
  p_campaign_id uuid,p_content text,p_template_name text,p_template_language text,p_template_data jsonb,p_actor_user_id uuid
) returns public.campaigns language plpgsql security invoker set search_path='' as $$
declare v_campaign public.campaigns%rowtype; v_result public.campaigns%rowtype;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null or v_campaign.status not in ('draft','scheduled') then raise exception 'campaign content cannot be edited'; end if;
  if exists(select 1 from public.campaign_recipients where campaign_id=v_campaign.id and status in ('queued','sending','failed_transient')) then raise exception 'wait for the current occurrence before editing'; end if;
  if nullif(trim(p_template_name),'') is null or p_template_name !~ '^[a-z0-9_]{1,512}$' or p_template_language !~ '^[a-z]{2}_[A-Z]{2}$' then raise exception 'invalid campaign template'; end if;
  update public.campaigns set content=left(coalesce(p_content,''),4000),template_name=trim(p_template_name),template_language=p_template_language,
    template_data=coalesce(p_template_data,'{}'::jsonb),content_version=content_version+1,updated_by=p_actor_user_id,updated_at=now()
  where id=v_campaign.id returning * into v_result;
  return v_result;
end $$;
revoke all on function public.campaign_update_content_internal(uuid,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.campaign_update_content_internal(uuid,text,text,text,jsonb,uuid) to service_role;

create or replace function public.growth_schedule_due_campaigns_internal(p_limit integer default 20)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_campaign public.campaigns%rowtype; v_occurrence public.campaign_occurrences%rowtype; v_created integer:=0; v_members integer; v_eligible integer; v_excluded integer;
begin
  if p_limit not between 1 and 100 then raise exception 'invalid schedule limit'; end if;
  for v_campaign in select c.* from public.campaigns c
    join public.store_operational_settings s on s.organization_id=c.organization_id and s.store_id=c.store_id and s.growth_campaigns_enabled
    where c.status='scheduled' and c.paused_at is null and c.next_run_at<=now()
      and private.store_module_enabled(c.organization_id,c.store_id,'growth')
    order by c.next_run_at for update of c skip locked limit p_limit
  loop
    insert into public.campaign_occurrences(organization_id,store_id,campaign_id,occurrence_key,scheduled_for,content_version,content_snapshot,template_name_snapshot,template_language_snapshot,template_data_snapshot,status,started_at)
    values(v_campaign.organization_id,v_campaign.store_id,v_campaign.id,to_char(v_campaign.next_run_at at time zone 'UTC','YYYYMMDDHH24MISSOF'),v_campaign.next_run_at,v_campaign.content_version,v_campaign.content,v_campaign.template_name,v_campaign.template_language,v_campaign.template_data,'running',now())
    on conflict(campaign_id,occurrence_key) do nothing returning * into v_occurrence;
    if v_occurrence.id is not null then
      if v_campaign.segment_id is null then
        insert into public.campaign_recipients(organization_id,store_id,campaign_id,occurrence_id,customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,status,reason,metadata,idempotency_key,next_attempt_at,processed_at)
        select v_campaign.organization_id,v_campaign.store_id,v_campaign.id,v_occurrence.id,c.id,c.name,
          case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then c.phone_normalized else null end,c.email,
          case when p.status='opted_out' then 'skipped_opt_out' when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then 'queued' else 'skipped_invalid_contact' end,
          case when p.status='opted_out' then 'Cliente solicitou opt-out' when p.status is distinct from 'consented' then 'Consentimento promocional ausente' when not coalesce(c.phone_normalized ~ '^[0-9]{8,20}$',false) then 'Telefone inválido ou ausente' else null end,
          jsonb_build_object('snapshot_source','scheduled_occurrence','occurrence_id',v_occurrence.id),
          'campaign:'||v_campaign.id::text||':occurrence:'||v_occurrence.id::text||':customer:'||c.id::text||':v'||v_campaign.content_version::text,
          case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then now() else null end,
          case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then null else now() end
        from public.customers c
        left join public.customer_marketing_preferences p on p.organization_id=v_campaign.organization_id and p.store_id=v_campaign.store_id and p.customer_id=c.id and p.channel='whatsapp'
        where c.organization_id=v_campaign.organization_id and c.deleted_at is null
          and exists(select 1 from public.orders o where o.organization_id=v_campaign.organization_id and o.store_id=v_campaign.store_id and o.customer_id=c.id and o.order_status='completed')
        on conflict(occurrence_id,customer_id) where occurrence_id is not null do nothing;
      else
        insert into public.campaign_recipients(organization_id,store_id,campaign_id,occurrence_id,customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,status,reason,metadata,idempotency_key,next_attempt_at,processed_at)
        select v_campaign.organization_id,v_campaign.store_id,v_campaign.id,v_occurrence.id,g.customer_id,g.name,
          case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then c.phone_normalized else null end,g.email,
          case when p.status='opted_out' then 'skipped_opt_out' when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then 'queued' else 'skipped_invalid_contact' end,
          case when p.status='opted_out' then 'Cliente solicitou opt-out' when p.status is distinct from 'consented' then 'Consentimento promocional ausente' when not coalesce(c.phone_normalized ~ '^[0-9]{8,20}$',false) then 'Telefone inválido ou ausente' else null end,
          jsonb_build_object('snapshot_source','scheduled_occurrence','occurrence_id',v_occurrence.id),
          'campaign:'||v_campaign.id::text||':occurrence:'||v_occurrence.id::text||':customer:'||g.customer_id::text||':v'||v_campaign.content_version::text,
          case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then now() else null end,
          case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then null else now() end
        from public.growth_segment_customers_internal(v_campaign.segment_id) g
        join public.customers c on c.organization_id=v_campaign.organization_id and c.id=g.customer_id
        left join public.customer_marketing_preferences p on p.organization_id=v_campaign.organization_id and p.store_id=v_campaign.store_id and p.customer_id=g.customer_id and p.channel='whatsapp'
        where g.orders_count>0 on conflict(occurrence_id,customer_id) where occurrence_id is not null do nothing;
      end if;
      select count(*),count(*) filter(where status='queued'),count(*) filter(where status like 'skipped_%') into v_members,v_eligible,v_excluded from public.campaign_recipients where occurrence_id=v_occurrence.id;
      update public.campaign_occurrences set status=case when v_eligible=0 then 'completed' else 'queued' end,member_count=v_members,eligible_count=v_eligible,excluded_count=v_excluded,completed_at=case when v_eligible=0 then now() else null end where id=v_occurrence.id;
      v_created:=v_created+1;
    end if;
    update public.campaigns set next_run_at=private.campaign_next_run(store_id,schedule_type,local_send_time,recurrence_weekdays,schedule_starts_on,schedule_ends_on,v_campaign.next_run_at+interval '1 second'),
      scheduled_at=coalesce(private.campaign_next_run(store_id,schedule_type,local_send_time,recurrence_weekdays,schedule_starts_on,schedule_ends_on,v_campaign.next_run_at+interval '1 second'),scheduled_at),updated_at=now() where id=v_campaign.id;
    update public.campaigns set status='completed',completed_at=now(),updated_at=now()
      where id=v_campaign.id and next_run_at is null and v_eligible=0;
  end loop;
  return jsonb_build_object('occurrences_created',v_created);
end $$;
revoke all on function public.growth_schedule_due_campaigns_internal(integer) from public,anon,authenticated;
grant execute on function public.growth_schedule_due_campaigns_internal(integer) to service_role;

create or replace function public.campaign_suppression_internal(p_recipient_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_row public.campaign_recipients%rowtype; v_settings public.store_operational_settings%rowtype;
begin
  select * into v_row from public.campaign_recipients where id=p_recipient_id;
  if v_row.id is null then raise exception 'recipient not found'; end if;
  select * into v_settings from public.store_operational_settings where organization_id=v_row.organization_id and store_id=v_row.store_id;
  if exists(select 1 from public.campaigns c where c.id=v_row.campaign_id and (c.paused_at is not null or c.status not in ('running','scheduled'))) then return jsonb_build_object('suppressed',true,'reason','campaign_paused','retry_after_seconds',1800); end if;
  if exists(select 1 from public.conversations cv join public.contacts ct on ct.organization_id=cv.organization_id and ct.store_id=cv.store_id and ct.id=cv.contact_id
    where cv.organization_id=v_row.organization_id and cv.store_id=v_row.store_id and ct.customer_id=v_row.customer_id and cv.status in ('human','waiting_agent')) then return jsonb_build_object('suppressed',true,'reason','active_human_conversation','retry_after_seconds',1800); end if;
  if exists(select 1 from public.orders o where o.organization_id=v_row.organization_id and o.store_id=v_row.store_id and o.customer_id=v_row.customer_id and o.order_status not in ('completed','canceled','rejected')) then return jsonb_build_object('suppressed',true,'reason','active_order','retry_after_seconds',1800); end if;
  if exists(select 1 from public.automation_sessions a join public.conversations cv on cv.id=a.conversation_id join public.contacts ct on ct.id=cv.contact_id
    where a.organization_id=v_row.organization_id and a.store_id=v_row.store_id and ct.customer_id=v_row.customer_id and a.state='active' and (a.expires_at is null or a.expires_at>now()) and a.context->>'channel'='whatsapp_order') then return jsonb_build_object('suppressed',true,'reason','whatsapp_order_active','retry_after_seconds',1800); end if;
  if (select count(*) from public.campaign_recipients x where x.organization_id=v_row.organization_id and x.store_id=v_row.store_id and x.customer_id=v_row.customer_id and x.id<>v_row.id and x.status in ('sent','delivered','read') and x.processed_at>=now()-interval '1 day')>=v_settings.promotional_daily_limit then return jsonb_build_object('suppressed',true,'reason','daily_limit','retry_after_seconds',21600); end if;
  if (select count(*) from public.campaign_recipients x where x.organization_id=v_row.organization_id and x.store_id=v_row.store_id and x.customer_id=v_row.customer_id and x.id<>v_row.id and x.status in ('sent','delivered','read') and x.processed_at>=now()-interval '7 days')>=v_settings.promotional_weekly_limit then return jsonb_build_object('suppressed',true,'reason','weekly_limit','retry_after_seconds',86400); end if;
  if exists(select 1 from public.campaign_recipients x where x.organization_id=v_row.organization_id and x.store_id=v_row.store_id and x.customer_id=v_row.customer_id and x.id<>v_row.id and x.status in ('sent','delivered','read') and x.processed_at>=now()-make_interval(hours=>v_settings.promotional_min_interval_hours)) then return jsonb_build_object('suppressed',true,'reason','minimum_interval','retry_after_seconds',3600); end if;
  return jsonb_build_object('suppressed',false);
end $$;
revoke all on function public.campaign_suppression_internal(uuid) from public,anon,authenticated;
grant execute on function public.campaign_suppression_internal(uuid) to service_role;

create or replace function public.campaign_defer_internal(p_recipient_id uuid,p_worker_id text,p_reason text,p_retry_after_seconds integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update public.campaign_recipients set status='queued',reason=left(p_reason,500),next_attempt_at=now()+make_interval(secs=>greatest(p_retry_after_seconds,300)),lease_owner=null,lease_expires_at=null
  where id=p_recipient_id and lease_owner=trim(p_worker_id);
  if not found then raise exception 'campaign recipient lease mismatch'; end if;
end $$;
revoke all on function public.campaign_defer_internal(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.campaign_defer_internal(uuid,text,text,integer) to service_role;

create or replace function public.campaign_claim_internal(p_worker_id text,p_limit integer)
returns setof public.campaign_recipients language plpgsql security invoker set search_path='' as $$
begin
  if char_length(trim(coalesce(p_worker_id,''))) not between 8 and 180 then raise exception 'invalid worker id'; end if;
  if p_limit not between 1 and 100 then raise exception 'invalid claim limit'; end if;
  return query with ranked as (
    select cr.id,cr.store_id,cr.organization_id,cr.customer_id,
      row_number() over(partition by cr.store_id order by cr.next_attempt_at nulls first,cr.created_at) store_position,
      row_number() over(partition by cr.organization_id,cr.store_id,cr.customer_id order by cr.next_attempt_at nulls first,cr.created_at) customer_position,
      greatest(s.campaign_rate_per_minute-(select count(*) from public.campaign_recipients sent where sent.store_id=cr.store_id and sent.status in ('sent','delivered','read') and sent.processed_at>=now()-interval '1 minute'),0) available_slots
    from public.campaign_recipients cr
    join public.store_operational_settings s on s.store_id=cr.store_id and s.growth_campaigns_enabled
    join public.campaigns c on c.id=cr.campaign_id and c.status in ('running','scheduled') and c.paused_at is null
    where cr.status in ('queued','failed_transient') and coalesce(cr.next_attempt_at,now())<=now()
      and (cr.lease_expires_at is null or cr.lease_expires_at<now())
      and private.store_module_enabled(cr.organization_id,cr.store_id,'growth')
      and not exists(select 1 from public.campaign_recipients active where active.organization_id=cr.organization_id and active.store_id=cr.store_id and active.customer_id=cr.customer_id and active.status='sending')
  ), candidates as (
    select cr.id from public.campaign_recipients cr join ranked r on r.id=cr.id
    where r.store_position<=r.available_slots and r.customer_position=1
      and pg_try_advisory_xact_lock(hashtextextended(r.organization_id::text||':'||r.store_id::text||':'||r.customer_id::text,0))
    order by cr.next_attempt_at nulls first,cr.created_at for update of cr skip locked limit p_limit
  ) update public.campaign_recipients cr set status='sending',attempts=attempts+1,lease_owner=trim(p_worker_id),lease_expires_at=now()+interval '2 minutes'
    from candidates x where cr.id=x.id returning cr.*;
end $$;
revoke all on function public.campaign_claim_internal(text,integer) from public,anon,authenticated;
grant execute on function public.campaign_claim_internal(text,integer) to service_role;

create or replace function public.campaign_finish_internal(
  p_recipient_id uuid,p_worker_id text,p_status text,p_provider_message_id text,p_error_code text,p_reason text,p_retry_after_seconds integer
) returns void language plpgsql security invoker set search_path='' as $$
declare v_row public.campaign_recipients%rowtype; v_remaining integer; v_failed boolean;
begin
  if p_status not in ('sent','delivered','read','failed_transient','failed_permanent','skipped_opt_out','skipped_invalid_contact') then raise exception 'invalid campaign recipient result'; end if;
  select * into v_row from public.campaign_recipients where id=p_recipient_id for update;
  if v_row.id is null or v_row.lease_owner is distinct from trim(p_worker_id) then raise exception 'campaign recipient lease mismatch'; end if;
  update public.campaign_recipients set status=p_status,provider_message_id=p_provider_message_id,last_error_code=p_error_code,reason=left(p_reason,500),
    next_attempt_at=case when p_status='failed_transient' and attempts<5 then now()+make_interval(secs=>greatest(coalesce(p_retry_after_seconds,60),30)) else null end,
    processed_at=case when p_status='failed_transient' and attempts<5 then null else now() end,lease_owner=null,lease_expires_at=null where id=v_row.id;
  if p_status='failed_transient' and v_row.attempts>=5 then update public.campaign_recipients set status='failed_permanent',processed_at=now() where id=v_row.id; end if;
  select count(*) into v_remaining from public.campaign_recipients where coalesce(occurrence_id,v_row.campaign_id)=coalesce(v_row.occurrence_id,v_row.campaign_id) and status in ('queued','sending','failed_transient');
  select exists(select 1 from public.campaign_recipients where coalesce(occurrence_id,v_row.campaign_id)=coalesce(v_row.occurrence_id,v_row.campaign_id) and status='failed_permanent') into v_failed;
  if v_remaining=0 then
    if v_row.occurrence_id is not null then update public.campaign_occurrences set status=case when coalesce(v_failed,false) then 'partially_failed' else 'completed' end,completed_at=now() where id=v_row.occurrence_id; end if;
    update public.campaigns c set status=case when exists(select 1 from public.campaign_recipients x where x.campaign_id=c.id and x.status='failed_permanent') then 'partially_failed' else 'completed' end,completed_at=now(),updated_at=now()
    where c.id=v_row.campaign_id and c.status<>'canceled' and c.next_run_at is null;
  end if;
end $$;
revoke all on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) to service_role;
