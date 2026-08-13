-- PedeAqui — Milestone 22 [236]–[238]
-- Configuração transacional de webhooks outbound por unidade.

create or replace function public.integration_configure_webhook_internal(
  p_integration_id uuid,
  p_name text,
  p_endpoint_url text,
  p_signing_secret_ref text,
  p_event_types text[],
  p_actor_user_id uuid default null
) returns public.integration_webhook_subscriptions
language plpgsql security invoker set search_path='' as $$
declare v_integration public.integrations%rowtype; v_result public.integration_webhook_subscriptions%rowtype;
begin
  if char_length(trim(coalesce(p_name,'')))<2 or char_length(trim(p_name))>120 then raise exception 'invalid webhook name'; end if;
  if trim(coalesce(p_endpoint_url,'')) !~ '^https://' or char_length(trim(p_endpoint_url))>1000 then raise exception 'outbound webhook endpoint must use HTTPS'; end if;
  if char_length(trim(coalesce(p_signing_secret_ref,'')))<2 or char_length(trim(p_signing_secret_ref))>240 then raise exception 'signing secret reference is required'; end if;
  if p_event_types is null or cardinality(p_event_types)<1 or cardinality(p_event_types)>100 or exists(select 1 from unnest(p_event_types) e where char_length(trim(e))<2 or char_length(trim(e))>120) then raise exception 'invalid webhook event filter'; end if;
  select * into v_integration from public.integrations where id=p_integration_id and store_id is not null and active=true for update;
  if v_integration.id is null then raise exception 'integration unavailable'; end if;
  select * into v_result from public.integration_webhook_subscriptions where integration_id=v_integration.id and name=trim(p_name) and active=true for update;
  if v_result.id is null then
    insert into public.integration_webhook_subscriptions(organization_id,store_id,integration_id,name,endpoint_url,signing_secret_ref,event_types,active,created_by,updated_by)
    values(v_integration.organization_id,v_integration.store_id,v_integration.id,trim(p_name),trim(p_endpoint_url),trim(p_signing_secret_ref),array(select distinct trim(e) from unnest(p_event_types) e order by 1),true,p_actor_user_id,p_actor_user_id) returning * into v_result;
  else
    update public.integration_webhook_subscriptions set endpoint_url=trim(p_endpoint_url),signing_secret_ref=trim(p_signing_secret_ref),event_types=array(select distinct trim(e) from unnest(p_event_types) e order by 1),updated_by=p_actor_user_id,updated_at=now() where id=v_result.id returning * into v_result;
  end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_result.organization_id,v_result.store_id,p_actor_user_id,'integration.webhook_configured','integration_webhook_subscription',v_result.id,jsonb_build_object('integration_id',v_result.integration_id,'name',v_result.name,'event_types',v_result.event_types));
  return v_result;
end; $$;
revoke all on function public.integration_configure_webhook_internal(uuid,text,text,text,text[],uuid) from public,anon,authenticated;
grant execute on function public.integration_configure_webhook_internal(uuid,text,text,text,text[],uuid) to service_role;
