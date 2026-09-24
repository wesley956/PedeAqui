-- WPP-11: canonical outbound template message creation for the Inbox.
-- Additive only. Keeps tenant/store/ownership rules aligned with existing outbound RPCs.

create or replace function public.conversation_create_outbound_template_internal(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text,
  p_template_name text,
  p_template_language text,
  p_actor_user_id uuid
) returns public.messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
begin
  if char_length(trim(coalesce(p_body,''))) < 1 or char_length(p_body) > 16000 then
    raise exception 'invalid message body';
  end if;
  if char_length(trim(coalesce(p_client_message_id,''))) < 8 or char_length(trim(p_client_message_id)) > 180 then
    raise exception 'invalid client message id';
  end if;
  if p_actor_user_id is null then raise exception 'agent message requires actor'; end if;
  if trim(coalesce(p_template_name,'')) !~ '^[a-z0-9_]{1,512}$' then
    raise exception 'invalid template name';
  end if;
  if trim(coalesce(p_template_language,'')) !~ '^[a-z]{2}_[A-Z]{2}$' then
    raise exception 'invalid template language';
  end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if v_conversation.id is null then raise exception 'conversation not found'; end if;
  if v_conversation.channel <> 'whatsapp' then raise exception 'template send requires whatsapp channel'; end if;
  if v_conversation.status <> 'human'
     or v_conversation.assigned_user_id is distinct from p_actor_user_id then
    raise exception 'agent must own human conversation';
  end if;

  insert into public.messages (
    organization_id, store_id, conversation_id, contact_id, provider,
    direction, sender_type, sender_user_id, content_type, body,
    client_message_id, delivery_status, metadata
  ) values (
    v_conversation.organization_id, v_conversation.store_id, v_conversation.id, v_conversation.contact_id,
    case when v_conversation.channel = 'whatsapp' then 'meta_cloud' else 'internal' end,
    'outbound', 'agent', p_actor_user_id, 'template', p_body,
    trim(p_client_message_id), 'pending',
    jsonb_build_object(
      'template_name', trim(p_template_name),
      'template_language', trim(p_template_language)
    )
  )
  on conflict (organization_id, client_message_id) where client_message_id is not null
  do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message
    from public.messages
    where organization_id = v_conversation.organization_id
      and client_message_id = trim(p_client_message_id);
    return v_message;
  end if;

  update public.conversations
  set last_message_at = now(), version = version + 1, updated_at = now()
  where id = v_conversation.id;

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    v_conversation.organization_id, v_conversation.store_id,
    'conversation.template_pending', 'message', v_message.id,
    jsonb_build_object(
      'conversation_id', v_conversation.id,
      'template_name', trim(p_template_name),
      'template_language', trim(p_template_language)
    ),
    p_actor_user_id
  );

  return v_message;
end;
$$;

revoke all on function public.conversation_create_outbound_template_internal(uuid,text,text,text,text,uuid)
from public, anon, authenticated;
grant execute on function public.conversation_create_outbound_template_internal(uuid,text,text,text,text,uuid)
to service_role;
