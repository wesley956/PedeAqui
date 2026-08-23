-- PedeAqui — concorrência segura entre cancelamento e worker de campanhas [PA-C01-013..015]
-- Recipients já reivindicados preservam o lease para o worker encerrar sem ressuscitar a campanha.

create or replace function public.campaign_cancel_internal(p_campaign_id uuid,p_actor_user_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_campaign public.campaigns%rowtype;
  v_canceled integer:=0;
begin
  if p_actor_user_id is null then raise exception 'campaign actor is required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'campaign cancel reason is required'; end if;
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.status in ('completed','partially_failed','canceled') then raise exception 'campaign is already closed'; end if;
  update public.campaign_recipients
  set status='canceled',reason=left(trim(p_reason),500),processed_at=now(),next_attempt_at=null,lease_owner=null,lease_expires_at=null
  where campaign_id=v_campaign.id and status in ('eligible','queued','failed_transient','pending');
  get diagnostics v_canceled=row_count;
  update public.campaigns set status='canceled',canceled_at=now(),updated_by=p_actor_user_id,updated_at=now()
  where id=v_campaign.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_campaign.organization_id,v_campaign.store_id,p_actor_user_id,'growth.campaign_canceled','campaign',v_campaign.id,
    to_jsonb(v_campaign),jsonb_build_object('status','canceled','reason',trim(p_reason),'recipients_canceled',v_canceled));
  return jsonb_build_object('campaign_id',v_campaign.id,'status','canceled','recipients_canceled',v_canceled);
end $$;
revoke all on function public.campaign_cancel_internal(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.campaign_cancel_internal(uuid,uuid,text) to service_role;

create or replace function public.campaign_finish_internal(
  p_recipient_id uuid,p_worker_id text,p_status text,p_provider_message_id text,p_error_code text,p_reason text,p_retry_after_seconds integer
) returns void language plpgsql security invoker set search_path='' as $$
declare v_row public.campaign_recipients%rowtype; v_remaining integer;
begin
  if p_status not in ('sent','delivered','read','failed_transient','failed_permanent','skipped_opt_out','skipped_invalid_contact') then raise exception 'invalid campaign recipient result'; end if;
  select * into v_row from public.campaign_recipients where id=p_recipient_id for update;
  if v_row.id is null or v_row.lease_owner is distinct from trim(p_worker_id) then raise exception 'campaign recipient lease mismatch'; end if;
  update public.campaign_recipients set status=p_status,provider_message_id=p_provider_message_id,last_error_code=p_error_code,reason=left(p_reason,500),
    next_attempt_at=case when p_status='failed_transient' and attempts<5 then now()+make_interval(secs=>greatest(coalesce(p_retry_after_seconds,60),30)) else null end,
    processed_at=case when p_status in ('failed_transient') and attempts<5 then null else now() end,lease_owner=null,lease_expires_at=null where id=v_row.id;
  if p_status='failed_transient' and v_row.attempts>=5 then update public.campaign_recipients set status='failed_permanent',processed_at=now() where id=v_row.id; end if;
  select count(*) into v_remaining from public.campaign_recipients where campaign_id=v_row.campaign_id and status in ('queued','sending','failed_transient');
  if v_remaining=0 then
    update public.campaigns c set status=case when exists(select 1 from public.campaign_recipients x where x.campaign_id=c.id and x.status='failed_permanent') then 'partially_failed' else 'completed' end,completed_at=now(),updated_at=now()
    where c.id=v_row.campaign_id and c.status<>'canceled';
  end if;
end $$;
revoke all on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) to service_role;
