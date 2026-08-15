-- PedeAqui — [326]
-- Saudação automática do WhatsApp com link de cardápio gerado pelo servidor.

alter table public.store_conversation_settings
  add column if not exists greeting_enabled boolean not null default false,
  add column if not exists greeting_template text not null default 'Olá! 👋 Bem-vindo ao {restaurante}. Para ver nosso cardápio e fazer seu pedido, acesse: {link}. Se precisar falar com alguém, é só me avisar.',
  add column if not exists greeting_fallback_message text not null default 'Olá! Nosso cardápio online não está disponível para pedidos neste momento. Vou encaminhar seu atendimento para nossa equipe.';

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_greeting_template_check;
alter table public.store_conversation_settings
  add constraint store_conversation_settings_greeting_template_check check (
    char_length(trim(greeting_template)) between 20 and 1000
    and position('{link}' in greeting_template) > 0
    and greeting_template !~* '(https?://|www\.)'
  );

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_greeting_fallback_check;
alter table public.store_conversation_settings
  add constraint store_conversation_settings_greeting_fallback_check check (
    char_length(trim(greeting_fallback_message)) between 10 and 800
    and greeting_fallback_message !~* '(https?://|www\.)'
  );

create or replace function public.conversation_claim_bot_outbound_internal(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_claimed boolean := false;
begin
  if char_length(trim(coalesce(p_body,''))) < 1 or char_length(p_body) > 16000 then
    raise exception 'invalid message body';
  end if;
  if char_length(trim(coalesce(p_client_message_id,''))) < 8 or char_length(trim(p_client_message_id)) > 180 then
    raise exception 'invalid client message id';
  end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if v_conversation.id is null then raise exception 'conversation not found'; end if;
  if v_conversation.status <> 'bot' then
    return jsonb_build_object('claimed', false, 'reason', 'conversation_not_bot');
  end if;

  select * into v_message
  from public.messages
  where organization_id = v_conversation.organization_id
    and client_message_id = trim(p_client_message_id)
  for update;

  if v_message.id is null then
    insert into public.messages (
      organization_id, store_id, conversation_id, contact_id, provider,
      direction, sender_type, content_type, body, client_message_id, delivery_status
    ) values (
      v_conversation.organization_id, v_conversation.store_id, v_conversation.id, v_conversation.contact_id,
      case when v_conversation.channel = 'whatsapp' then 'meta_cloud' else 'internal' end,
      'outbound', 'bot', 'text', p_body, trim(p_client_message_id), 'pending'
    )
    on conflict (organization_id, client_message_id) where client_message_id is not null
    do nothing
    returning * into v_message;

    if v_message.id is null then
      select * into v_message
      from public.messages
      where organization_id = v_conversation.organization_id
        and client_message_id = trim(p_client_message_id)
      for update;
    else
      v_claimed := true;
      update public.conversations
      set last_message_at = now(), version = version + 1, updated_at = now()
      where id = v_conversation.id;

      insert into public.domain_events (
        organization_id, store_id, event_type, entity_type, entity_id, payload
      ) values (
        v_conversation.organization_id, v_conversation.store_id,
        'conversation.automation_message_pending', 'message', v_message.id,
        jsonb_build_object('conversation_id', v_conversation.id, 'client_message_id', trim(p_client_message_id))
      );
    end if;
  elsif v_message.delivery_status = 'failed' then
    update public.messages
    set delivery_status = 'pending',
        error_code = null,
        error_message = null,
        updated_at = now()
    where id = v_message.id
    returning * into v_message;
    v_claimed := true;
  end if;

  return jsonb_build_object(
    'claimed', v_claimed,
    'message_id', v_message.id,
    'delivery_status', v_message.delivery_status,
    'conversation_id', v_conversation.id
  );
end;
$$;

revoke all on function public.conversation_claim_bot_outbound_internal(uuid,text,text)
from public, anon, authenticated;
grant execute on function public.conversation_claim_bot_outbound_internal(uuid,text,text)
to service_role;
