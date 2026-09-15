-- INT-12: a real WhatsApp Business app echo is a manual override.
-- It must suspend bot automation atomically, using the canonical conversation state machine.
-- Return to bot remains manual-only; this migration adds no timeout.

create or replace function private.conversation_pause_bot_on_business_echo()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_status text;
begin
  select status into v_status
  from public.conversations
  where id = new.conversation_id
  for update;

  if v_status = 'bot' then
    perform public.conversation_transition_internal(
      new.conversation_id,
      'waiting_agent',
      null,
      'Resposta enviada pelo WhatsApp Business',
      null,
      'webhook'
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_conversation_pause_bot_on_business_echo on public.messages;
create trigger trg_conversation_pause_bot_on_business_echo
after insert on public.messages
for each row
when (
  new.direction = 'outbound'
  and new.sender_type = 'system'
  and coalesce(new.metadata->>'source', '') = 'whatsapp_business_app'
)
execute function private.conversation_pause_bot_on_business_echo();

revoke all on function private.conversation_pause_bot_on_business_echo() from public;
revoke all on function private.conversation_pause_bot_on_business_echo() from anon;
revoke all on function private.conversation_pause_bot_on_business_echo() from authenticated;
