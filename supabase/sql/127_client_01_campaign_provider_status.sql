-- PedeAqui — reconciliação idempotente de status da Meta em campanhas [PA-C01-013]

create unique index if not exists campaign_recipients_provider_message_unique
  on public.campaign_recipients(store_id, provider_message_id)
  where provider_message_id is not null;

create or replace function public.campaign_update_delivery_internal(
  p_store_id uuid,p_provider_message_id text,p_status text,p_error_code text default null,p_reason text default null
) returns public.campaign_recipients language plpgsql security invoker set search_path='' as $$
declare
  v_row public.campaign_recipients%rowtype;
  v_old_rank integer;
  v_new_rank integer;
begin
  if p_status not in ('sent','delivered','read','failed') then raise exception 'invalid campaign delivery status'; end if;
  select * into v_row from public.campaign_recipients
  where store_id=p_store_id and provider_message_id=p_provider_message_id for update;
  if v_row.id is null then return null; end if;
  v_old_rank:=case v_row.status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  v_new_rank:=case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else -1 end;
  if p_status<>'failed' and v_old_rank>=v_new_rank then return v_row; end if;
  update public.campaign_recipients set
    status=case when p_status='failed' then 'failed_permanent' else p_status end,
    last_error_code=case when p_status='failed' then left(nullif(trim(coalesce(p_error_code,'')),''),120) else last_error_code end,
    reason=case when p_status='failed' then left(nullif(trim(coalesce(p_reason,'')),''),500) else reason end,
    processed_at=coalesce(processed_at,now())
  where id=v_row.id returning * into v_row;
  return v_row;
end $$;
revoke all on function public.campaign_update_delivery_internal(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.campaign_update_delivery_internal(uuid,text,text,text,text) to service_role;
