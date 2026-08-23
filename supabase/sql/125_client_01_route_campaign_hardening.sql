-- PedeAqui — hardening do perfil operacional Cliente 01 [PA-C01-001..015]
-- Complementa a migration 124 sem alterar defaults nem ativar recursos em lojas existentes.

create index if not exists store_operational_settings_org_store_idx
  on public.store_operational_settings(organization_id, store_id);
create index if not exists store_operational_settings_updated_by_idx
  on public.store_operational_settings(updated_by) where updated_by is not null;

create index if not exists driver_route_sessions_driver_scope_idx
  on public.driver_route_sessions(organization_id, store_id, driver_id);
create index if not exists driver_route_sessions_created_by_idx
  on public.driver_route_sessions(created_by) where created_by is not null;
create index if not exists driver_route_sessions_ended_by_idx
  on public.driver_route_sessions(ended_by) where ended_by is not null;

create index if not exists driver_route_deliveries_session_scope_idx
  on public.driver_route_deliveries(organization_id, store_id, route_session_id);
create index if not exists driver_route_deliveries_delivery_scope_idx
  on public.driver_route_deliveries(organization_id, store_id, delivery_id);

create index if not exists customer_marketing_preferences_customer_scope_idx
  on public.customer_marketing_preferences(organization_id, customer_id);
create index if not exists customer_marketing_preferences_updated_by_idx
  on public.customer_marketing_preferences(updated_by) where updated_by is not null;

create index if not exists campaigns_segment_scope_idx
  on public.campaigns(organization_id, store_id, segment_id) where segment_id is not null;
create index if not exists campaigns_created_by_idx
  on public.campaigns(created_by) where created_by is not null;
create index if not exists campaigns_updated_by_idx
  on public.campaigns(updated_by) where updated_by is not null;
create index if not exists campaign_recipients_customer_scope_idx
  on public.campaign_recipients(organization_id, customer_id);

-- Uma rota somente pode nascer depois da transição canônica para "saiu para entrega".
create or replace function public.driver_route_start_internal(p_delivery_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_driver public.drivers%rowtype;
  v_settings public.store_operational_settings%rowtype;
  v_session public.driver_route_sessions%rowtype;
begin
  if p_actor_user_id is null then raise exception 'route actor is required'; end if;
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if v_delivery.id is null or v_delivery.driver_id is null then raise exception 'delivery not found or unassigned'; end if;
  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if v_order.id is null or v_order.fulfillment_status<>'out_for_delivery' then
    raise exception 'route can only start after delivery is out for delivery';
  end if;
  select * into v_driver from public.drivers where id=v_delivery.driver_id and user_id=p_actor_user_id and active and deleted_at is null;
  if v_driver.id is null then raise exception 'delivery is not assigned to current driver'; end if;
  select * into v_settings from public.store_operational_settings where store_id=v_delivery.store_id;
  if not coalesce(v_settings.deliveries_driver_tracking_enabled,false)
    or not private.store_module_enabled(v_delivery.organization_id,v_delivery.store_id,'driver') then
    raise exception 'driver tracking is disabled';
  end if;
  select * into v_session from public.driver_route_sessions where driver_id=v_driver.id and status='active' for update;
  if v_session.id is null then
    insert into public.driver_route_sessions(organization_id,store_id,driver_id,retention_until,created_by)
    values(v_delivery.organization_id,v_delivery.store_id,v_driver.id,now()+make_interval(days=>v_settings.deliveries_tracking_retention_days),p_actor_user_id)
    returning * into v_session;
    insert into public.driver_route_events(organization_id,store_id,route_session_id,event_type)
    values(v_session.organization_id,v_session.store_id,v_session.id,'route_started');
  end if;
  insert into public.driver_route_deliveries(organization_id,store_id,route_session_id,delivery_id)
  values(v_session.organization_id,v_session.store_id,v_session.id,v_delivery.id) on conflict do nothing;
  return jsonb_build_object('session_id',v_session.id,'status',v_session.status,'tracking_enabled',true);
end $$;
revoke all on function public.driver_route_start_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.driver_route_start_internal(uuid,uuid) to service_role;

-- Cancelamento é a exclusão de domínio: preserva histórico e cancela somente itens ainda não enviados.
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
  if v_campaign.status in ('completed','partially_failed','canceled') then
    raise exception 'campaign is already closed';
  end if;
  update public.campaign_recipients
  set status='canceled',reason=left(trim(p_reason),500),processed_at=now(),next_attempt_at=null,lease_owner=null,lease_expires_at=null
  where campaign_id=v_campaign.id and status in ('eligible','queued','sending','failed_transient','pending');
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
