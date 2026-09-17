-- WPP-07: atomic human claim for Inbox handoff.
-- Additive only. Keeps the canonical transition RPC/state machine intact.

create or replace function public.conversation_claim_human_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_conversation_id uuid,
  p_assigned_user_id uuid,
  p_reason text default 'Atendimento assumido',
  p_actor_user_id uuid default null,
  p_source text default 'panel'
)
returns public.conversations
language plpgsql
set search_path to ''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_result public.conversations%rowtype;
begin
  if p_assigned_user_id is null then
    raise exception 'human conversation requires assigned user';
  end if;

  if p_source <> 'panel' then
    raise exception 'conversation claim source must be panel';
  end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
    and organization_id = p_organization_id
    and store_id = p_store_id
  for update;

  if v_conversation.id is null then
    raise exception 'conversation not found in tenant scope';
  end if;

  if v_conversation.status = 'human' then
    if v_conversation.assigned_user_id = p_assigned_user_id then
      return v_conversation;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'conversation already assigned to another user';
  end if;

  if v_conversation.status not in ('bot', 'waiting_agent') then
    raise exception 'conversation cannot be claimed from state %', v_conversation.status;
  end if;

  -- The row lock acquired above is held for this transaction. Reuse the
  -- canonical transition RPC so history/audit/domain-event semantics remain
  -- exactly the same as INT-12 for the first successful claim.
  select * into v_result
  from public.conversation_transition_internal(
    p_conversation_id,
    'human',
    p_assigned_user_id,
    p_reason,
    coalesce(p_actor_user_id, p_assigned_user_id),
    p_source
  );

  return v_result;
end;
$function$;

revoke all on function public.conversation_claim_human_internal(uuid, uuid, uuid, uuid, text, uuid, text) from public;
revoke all on function public.conversation_claim_human_internal(uuid, uuid, uuid, uuid, text, uuid, text) from anon;
revoke all on function public.conversation_claim_human_internal(uuid, uuid, uuid, uuid, text, uuid, text) from authenticated;
grant execute on function public.conversation_claim_human_internal(uuid, uuid, uuid, uuid, text, uuid, text) to service_role;
