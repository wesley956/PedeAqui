-- #1318: recover only technical/no-reply handoffs when a customer explicitly starts again.
-- Never steal a human handoff, a WhatsApp Business interaction or an active order.
create or replace function public.conversation_recover_unanswered_bot_internal(
  p_conversation_id uuid,
  p_inbound_message_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_last_transition public.conversation_state_history%rowtype;
  v_contact public.contacts%rowtype;
  v_settings public.store_conversation_settings%rowtype;
begin
  select * into v_conversation from public.conversations
    where id = p_conversation_id for update;
  if v_conversation.id is null or v_conversation.status <> 'waiting_agent'
    or v_conversation.assigned_user_id is not null
    or v_conversation.human_attention_requested_at is not null then
    return false;
  end if;

  select * into v_message from public.messages
    where id = p_inbound_message_id
      and conversation_id = v_conversation.id
      and organization_id = v_conversation.organization_id
      and store_id = v_conversation.store_id
      and direction = 'inbound' and sender_type = 'contact';
  if v_message.id is null or v_message.content_type not in ('text','interactive')
    or pg_catalog.lower(pg_catalog.btrim(v_message.body)) not in
      ('oi','olá','ola','menu','bom dia','boa tarde','boa noite') then
    return false;
  end if;

  -- A later incoming message may already have superseded this one.
  if exists (select 1 from public.messages newer
    where newer.conversation_id = v_conversation.id
      and newer.direction = 'inbound' and newer.created_at > v_message.created_at) then
    return false;
  end if;

  select * into v_last_transition from public.conversation_state_history
    where conversation_id = v_conversation.id
    order by created_at desc, id desc limit 1;
  if v_last_transition.id is null or v_last_transition.to_state <> 'waiting_agent'
    or v_last_transition.source <> 'system'
    or v_last_transition.reason <> 'Inbound sem resposta automática; encaminhado para atendimento'
    or v_last_transition.created_at > pg_catalog.now() - interval '10 minutes'
    or v_message.created_at <= v_last_transition.created_at then
    return false;
  end if;

  select * into v_settings from public.store_conversation_settings
    where organization_id = v_conversation.organization_id
      and store_id = v_conversation.store_id;
  if v_settings.store_id is null or not v_settings.whatsapp_enabled
    or not v_settings.default_bot_enabled then return false; end if;

  -- A real team reply, a pending send, or any active order forbids recovery.
  if exists (select 1 from public.messages m
    where m.conversation_id = v_conversation.id
      and m.created_at >= v_last_transition.created_at
      and m.direction = 'outbound'
      and (m.sender_type = 'agent'
        or (m.sender_type = 'system' and m.metadata->>'source' = 'whatsapp_business_app')
        or m.delivery_status = 'pending')) then
    return false;
  end if;
  if exists (select 1 from public.automation_sessions a
    where a.conversation_id = v_conversation.id
      and a.state = 'active'
      and (a.expires_at is null or a.expires_at > pg_catalog.now())
      and a.context->>'channel' = 'whatsapp_order') then
    return false;
  end if;

  select * into v_contact from public.contacts
    where id = v_conversation.contact_id and store_id = v_conversation.store_id;
  if exists (select 1 from public.orders o
    where o.store_id = v_conversation.store_id
      and o.organization_id = v_conversation.organization_id
      and o.order_status not in ('completed','rejected','canceled')
      and ((v_contact.customer_id is not null and o.customer_id = v_contact.customer_id)
        or (v_contact.phone_normalized is not null
          and pg_catalog.regexp_replace(o.customer_phone_snapshot,'[^0-9]','','g') = v_contact.phone_normalized))) then
    return false;
  end if;

  perform public.conversation_transition_internal(
    v_conversation.id, 'bot', null,
    'Recuperação após falha de resposta automática; cliente iniciou novo contato',
    null, 'system'
  );
  return true;
end;
$function$;

revoke all on function public.conversation_recover_unanswered_bot_internal(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.conversation_recover_unanswered_bot_internal(uuid,uuid) to service_role;
