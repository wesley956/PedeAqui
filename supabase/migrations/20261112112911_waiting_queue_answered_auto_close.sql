-- Only an actual team reply can resolve a human queue; automated notifications cannot.
create or replace function public.conversation_team_reply_resolved_internal(
  p_organization_id uuid, p_store_id uuid, p_conversation_id uuid
) returns boolean language sql stable set search_path to '' as $function$
  select exists (
    select 1 from public.conversations c
    join lateral (
      select m.created_at from public.messages m
      where m.organization_id=c.organization_id and m.store_id=c.store_id and m.conversation_id=c.id
        and m.direction='outbound' and m.delivery_status in ('sent','delivered','read')
        and (m.sender_type='agent' or (m.sender_type='system' and m.metadata->>'source'='whatsapp_business_app'))
        and coalesce(m.metadata->>'sync_source','') <> 'history'
      order by m.created_at desc limit 1
    ) reply on true
    where c.organization_id=p_organization_id and c.store_id=p_store_id and c.id=p_conversation_id
      and (c.human_attention_requested_at is null or reply.created_at >= c.human_attention_requested_at)
      and exists (select 1 from public.messages inbound where inbound.organization_id=c.organization_id
        and inbound.store_id=c.store_id and inbound.conversation_id=c.id and inbound.direction='inbound'
        and coalesce(inbound.metadata->>'sync_source','') <> 'history' and inbound.created_at <= reply.created_at)
      and not exists (
        select 1 from public.messages inbound where inbound.organization_id=c.organization_id
          and inbound.store_id=c.store_id and inbound.conversation_id=c.id and inbound.direction='inbound'
          and coalesce(inbound.metadata->>'sync_source','') <> 'history' and inbound.created_at > reply.created_at
          and not (inbound.content_type='text' and pg_catalog.lower(pg_catalog.btrim(coalesce(inbound.body,''), ' .!?')) in
            ('ok','okay','obrigado','obrigada','muito obrigado','muito obrigada','valeu','entendi','certo','beleza','blz'))
      )
  );
$function$;
revoke all on function public.conversation_team_reply_resolved_internal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.conversation_team_reply_resolved_internal(uuid,uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.conversation_auto_close_candidates_internal(p_limit integer DEFAULT 100)
 RETURNS TABLE(conversation_id uuid, expected_version bigint)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select c.id, c.version
  from public.conversations c
  join public.store_conversation_settings s
    on s.organization_id = c.organization_id
   and s.store_id = c.store_id
  join public.contacts ct
    on ct.organization_id = c.organization_id
   and ct.store_id = c.store_id
   and ct.id = c.contact_id
  where s.conversation_auto_close_enabled
    and c.status in ('bot', 'human', 'waiting_agent')
    and (c.status='bot' or public.conversation_team_reply_resolved_internal(c.organization_id,c.store_id,c.id))
    and exists (
      select 1 from public.messages live
      where live.organization_id = c.organization_id
        and live.store_id = c.store_id
        and live.conversation_id = c.id
        and coalesce(live.metadata ->> 'sync_source', '') <> 'history'
    )
    and coalesce(c.last_message_at, c.opened_at) <= pg_catalog.now() - pg_catalog.make_interval(
      mins => case when c.status in ('human','waiting_agent') then s.human_auto_close_minutes else s.bot_auto_close_minutes end
    )
    and not exists (
      select 1
      from public.automation_sessions a
      where a.organization_id = c.organization_id
        and a.store_id = c.store_id
        and a.conversation_id = c.id
        and a.state = 'active'
        and (a.expires_at is null or a.expires_at > pg_catalog.now())
        and a.context ->> 'channel' = 'whatsapp_order'
        and a.step in ('order_items','order_name','order_fulfillment','order_address','order_payment','order_confirmation')
    )
    and not exists (
      select 1 from public.messages m
      where m.organization_id = c.organization_id
        and m.store_id = c.store_id
        and m.conversation_id = c.id
        and m.direction = 'outbound'
        and m.delivery_status = 'pending'
    )
    and (
      not s.keep_open_while_order_active
      or not exists (
        select 1 from public.orders o
        where o.organization_id = c.organization_id
          and o.store_id = c.store_id
          and o.order_status not in ('completed','rejected','canceled')
          and (
            (ct.customer_id is not null and o.customer_id = ct.customer_id)
            or (
              ct.phone_normalized is not null
              and pg_catalog.regexp_replace(o.customer_phone_snapshot, '[^0-9]', '', 'g') = ct.phone_normalized
            )
          )
      )
    )
  order by coalesce(c.last_message_at, c.opened_at), c.id
  limit greatest(1, least(coalesce(p_limit, 100), 250));
$function$
;

CREATE OR REPLACE FUNCTION public.conversation_auto_close_internal(p_conversation_id uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_conversation public.conversations%rowtype;
  v_settings public.store_conversation_settings%rowtype;
  v_contact public.contacts%rowtype;
  v_timeout integer;
  v_message public.messages%rowtype;
begin
  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if v_conversation.id is null then
    return jsonb_build_object('closed', false, 'reason', 'not_found');
  end if;
  if v_conversation.version is distinct from p_expected_version then
    return jsonb_build_object('closed', false, 'reason', 'version_changed');
  end if;
  if v_conversation.status not in ('bot','human','waiting_agent') then
    return jsonb_build_object('closed', false, 'reason', 'state_ineligible');
  end if;
  if v_conversation.status in ('human','waiting_agent') and not public.conversation_team_reply_resolved_internal(
    v_conversation.organization_id,v_conversation.store_id,v_conversation.id
  ) then return jsonb_build_object('closed',false,'reason','customer_waiting_for_team'); end if;
  if not exists (
    select 1 from public.messages live
    where live.organization_id = v_conversation.organization_id
      and live.store_id = v_conversation.store_id
      and live.conversation_id = v_conversation.id
      and coalesce(live.metadata ->> 'sync_source', '') <> 'history'
  ) then
    return jsonb_build_object('closed', false, 'reason', 'history_only');
  end if;

  select * into v_settings
  from public.store_conversation_settings
  where organization_id = v_conversation.organization_id
    and store_id = v_conversation.store_id;
  if v_settings.store_id is null or not v_settings.conversation_auto_close_enabled then
    return jsonb_build_object('closed', false, 'reason', 'disabled');
  end if;

  v_timeout := case
    when v_conversation.status in ('human','waiting_agent') then v_settings.human_auto_close_minutes
    else v_settings.bot_auto_close_minutes
  end;
  if coalesce(v_conversation.last_message_at, v_conversation.opened_at)
      > pg_catalog.now() - pg_catalog.make_interval(mins => v_timeout) then
    return jsonb_build_object('closed', false, 'reason', 'activity_changed');
  end if;

  if exists (
    select 1 from public.automation_sessions a
    where a.organization_id = v_conversation.organization_id
      and a.store_id = v_conversation.store_id
      and a.conversation_id = v_conversation.id
      and a.state = 'active'
      and (a.expires_at is null or a.expires_at > pg_catalog.now())
      and a.context ->> 'channel' = 'whatsapp_order'
      and a.step in ('order_items','order_name','order_fulfillment','order_address','order_payment','order_confirmation')
  ) then
    return jsonb_build_object('closed', false, 'reason', 'whatsapp_order_active');
  end if;

  if exists (
    select 1 from public.messages m
    where m.organization_id = v_conversation.organization_id
      and m.store_id = v_conversation.store_id
      and m.conversation_id = v_conversation.id
      and m.direction = 'outbound'
      and m.delivery_status = 'pending'
  ) then
    return jsonb_build_object('closed', false, 'reason', 'outbound_pending');
  end if;

  select * into v_contact
  from public.contacts
  where organization_id = v_conversation.organization_id
    and store_id = v_conversation.store_id
    and id = v_conversation.contact_id;

  if v_settings.keep_open_while_order_active and exists (
    select 1 from public.orders o
    where o.organization_id = v_conversation.organization_id
      and o.store_id = v_conversation.store_id
      and o.order_status not in ('completed','rejected','canceled')
      and (
        (v_contact.customer_id is not null and o.customer_id = v_contact.customer_id)
        or (
          v_contact.phone_normalized is not null
          and pg_catalog.regexp_replace(o.customer_phone_snapshot, '[^0-9]', '', 'g') = v_contact.phone_normalized
        )
      )
  ) then
    return jsonb_build_object('closed', false, 'reason', 'canonical_order_active');
  end if;

  if v_settings.send_auto_close_message
    and v_conversation.channel = 'whatsapp'
    and v_settings.whatsapp_enabled
    and v_settings.whatsapp_phone_number_id is not null
    and v_settings.access_token_secret_ref is not null
    and v_contact.external_id is not null
    and exists (
      select 1 from public.messages inbound
      where inbound.organization_id = v_conversation.organization_id
        and inbound.store_id = v_conversation.store_id
        and inbound.conversation_id = v_conversation.id
        and inbound.direction = 'inbound'
        and inbound.created_at >= pg_catalog.now() - interval '24 hours'
        and coalesce(inbound.metadata ->> 'sync_source', '') <> 'history'
    )
  then
    select * into v_message
    from public.conversation_create_outbound_internal(
      v_conversation.id,
      v_settings.auto_close_message,
      'auto:conversation-close:' || v_conversation.id::text || ':' || v_conversation.version::text,
      'system',
      null
    );
  end if;

  perform public.conversation_transition_internal(
    v_conversation.id,
    'closed',
    null,
    'Encerramento automático por inatividade (' || v_timeout::text || ' min)',
    null,
    'system'
  );

  update public.automation_sessions
  set state = 'expired', context = '{}'::jsonb, expires_at = pg_catalog.now(),
      version = version + 1, updated_at = pg_catalog.now()
  where organization_id = v_conversation.organization_id
    and store_id = v_conversation.store_id
    and conversation_id = v_conversation.id
    and state in ('active','paused');

  return jsonb_build_object(
    'closed', true,
    'conversation_id', v_conversation.id,
    'organization_id', v_conversation.organization_id,
    'store_id', v_conversation.store_id,
    'previous_state', v_conversation.status,
    'timeout_minutes', v_timeout,
    'message_id', v_message.id,
    'message_body', case when v_message.id is null then null else v_message.body end,
    'recipient', case when v_message.id is null then null else v_contact.external_id end,
    'phone_number_id', case when v_message.id is null then null else v_settings.whatsapp_phone_number_id end,
    'access_token_secret_ref', case when v_message.id is null then null else v_settings.access_token_secret_ref end
  );
end;
$function$
;
