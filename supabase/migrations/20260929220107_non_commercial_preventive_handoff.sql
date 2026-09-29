-- Preventive handoff: no customer-requested attention, no draft mutation.
create or replace function public.conversation_preventive_handoff_internal(
  p_organization_id uuid, p_store_id uuid, p_conversation_id uuid,
  p_message_id uuid, p_reason_code text
) returns public.conversations
language plpgsql security invoker set search_path = ''
as $$
declare v_conversation public.conversations%rowtype;
begin
  if p_reason_code is null or p_reason_code not in
    ('job_candidate','supplier_contact','generic_business_contact','social_ad_context') then
    raise exception 'invalid preventive handoff reason';
  end if;
  select * into v_conversation from public.conversations
  where id = p_conversation_id and organization_id = p_organization_id
    and store_id = p_store_id for update;
  if v_conversation.id is null then raise exception 'conversation scope mismatch'; end if;
  if not exists (select 1 from public.messages
    where id = p_message_id and conversation_id = p_conversation_id
      and organization_id = p_organization_id and store_id = p_store_id
      and direction = 'inbound' and sender_type = 'contact') then
    raise exception 'inbound message scope mismatch';
  end if;
  -- The canonical transition uses this same row lock; a concurrent human wins safely.
  if v_conversation.status <> 'bot' then return v_conversation; end if;
  return public.conversation_transition_internal(
    p_conversation_id, 'waiting_agent', null,
    'preventive_non_commercial:' || p_reason_code, null, 'bot');
end;
$$;
revoke all on function public.conversation_preventive_handoff_internal(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.conversation_preventive_handoff_internal(uuid,uuid,uuid,uuid,text)
  to service_role;
