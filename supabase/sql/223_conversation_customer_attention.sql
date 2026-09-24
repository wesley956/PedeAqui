-- #1155: actionable Inbox alerts only for customer-requested human service.
-- unread_count remains canonical internal data, but it is no longer the operational alert signal.

alter table public.conversations
  add column if not exists human_attention_requested_at timestamptz,
  add column if not exists human_attention_reason_code text;

alter table public.conversations
  drop constraint if exists conversations_human_attention_reason_code_check;

alter table public.conversations
  add constraint conversations_human_attention_reason_code_check
  check (
    human_attention_reason_code is null
    or human_attention_reason_code in ('explicit_handoff', 'benefit_handoff')
  );

create index if not exists conversations_customer_attention_queue_idx
  on public.conversations (
    organization_id,
    store_id,
    human_attention_requested_at desc,
    id desc
  )
  where status = 'waiting_agent'
    and human_attention_requested_at is not null;

create or replace function public.clear_conversation_human_attention_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.status <> 'waiting_agent' then
    new.human_attention_requested_at := null;
    new.human_attention_reason_code := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists conversations_clear_human_attention_request_trg
  on public.conversations;

create trigger conversations_clear_human_attention_request_trg
before update of status on public.conversations
for each row
when (old.status is distinct from new.status)
execute function public.clear_conversation_human_attention_request();

create or replace function public.conversation_request_human_attention_internal(
  p_conversation_id uuid,
  p_reason_code text,
  p_reason text default null,
  p_source text default 'bot'
) returns public.conversations
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_result public.conversations%rowtype;
begin
  if p_reason_code not in ('explicit_handoff', 'benefit_handoff') then
    raise exception 'invalid human attention reason code';
  end if;

  select *
  into v_result
  from public.conversation_transition_internal(
    p_conversation_id,
    'waiting_agent',
    null,
    p_reason,
    null,
    p_source
  );

  update public.conversations
  set human_attention_requested_at = coalesce(human_attention_requested_at, now()),
      human_attention_reason_code = p_reason_code,
      version = version + 1,
      updated_at = now()
  where id = p_conversation_id
    and status = 'waiting_agent'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'conversation did not enter the human attention queue';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.conversation_request_human_attention_internal(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.conversation_request_human_attention_internal(uuid, text, text, text)
to service_role;

with latest_waiting_transition as (
  select distinct on (h.conversation_id)
    h.conversation_id,
    h.created_at,
    h.reason
  from public.conversation_state_history h
  where h.to_state = 'waiting_agent'
  order by h.conversation_id, h.created_at desc, h.id desc
)
update public.conversations c
set human_attention_requested_at = latest.created_at,
    human_attention_reason_code = case
      when latest.reason in (
        'Cliente contestou saldo ou benefício no WhatsApp',
        'Cliente contestou saldo ou benefício durante pedido pelo WhatsApp'
      ) then 'benefit_handoff'
      else 'explicit_handoff'
    end
from latest_waiting_transition latest
where c.id = latest.conversation_id
  and c.status = 'waiting_agent'
  and c.human_attention_requested_at is null
  and latest.reason in (
    'Cliente solicitou atendimento humano pelo menu do WhatsApp',
    'Cliente pediu atendimento humano durante pedido pelo WhatsApp',
    'Cliente contestou saldo ou benefício no WhatsApp',
    'Cliente contestou saldo ou benefício durante pedido pelo WhatsApp'
  );

create or replace function public.conversation_inbox_page_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_status text default null,
  p_unread_only boolean default false,
  p_search text default null,
  p_before_activity timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 40
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
with scoped as (
  select
    c.id,
    c.contact_id,
    c.channel,
    c.status,
    c.assigned_user_id,
    c.unread_count,
    c.human_attention_requested_at,
    c.human_attention_reason_code,
    c.last_message_at,
    c.opened_at,
    c.closed_at,
    ct.name as contact_name,
    ct.phone_normalized as phone,
    ct.customer_id,
    coalesce(c.last_message_at, c.opened_at) as activity_at
  from public.conversations c
  join public.contacts ct
    on ct.id = c.contact_id
   and ct.organization_id = c.organization_id
   and ct.store_id = c.store_id
  where c.organization_id = p_organization_id
    and c.store_id = p_store_id
    and (p_status is null or c.status::text = p_status)
    and (not p_unread_only or coalesce(c.unread_count, 0) > 0)
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or coalesce(ct.name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(ct.phone_normalized, '') ilike '%' || trim(p_search) || '%'
    )
),
paged_base as (
  select s.*
  from scoped s
  where p_before_activity is null
     or s.activity_at < p_before_activity
     or (
       s.activity_at = p_before_activity
       and p_before_id is not null
       and s.id < p_before_id
     )
  order by s.activity_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100) + 1
),
paged as (
  select
    p.*,
    latest.body as preview_body,
    latest.content_type as preview_content_type,
    latest.direction as latest_direction,
    latest.created_at as latest_message_created_at
  from paged_base p
  left join lateral (
    select m.body, m.content_type, m.direction, m.created_at
    from public.messages m
    where m.organization_id = p_organization_id
      and m.store_id = p_store_id
      and m.conversation_id = p.id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  order by p.activity_at desc, p.id desc
)
select jsonb_build_object(
  'rows', coalesce(
    (select jsonb_agg(to_jsonb(row_value) order by row_value.activity_at desc, row_value.id desc) from paged row_value),
    '[]'::jsonb
  ),
  'total', (select count(*) from scoped),
  'unread_conversations', (select count(*) from scoped where coalesce(unread_count, 0) > 0),
  'unread_messages', (select coalesce(sum(unread_count), 0) from scoped)
);
$function$;

revoke all on function public.conversation_inbox_page_internal(uuid, uuid, text, boolean, text, timestamptz, uuid, integer) from public;
revoke all on function public.conversation_inbox_page_internal(uuid, uuid, text, boolean, text, timestamptz, uuid, integer) from anon;
revoke all on function public.conversation_inbox_page_internal(uuid, uuid, text, boolean, text, timestamptz, uuid, integer) from authenticated;
grant execute on function public.conversation_inbox_page_internal(uuid, uuid, text, boolean, text, timestamptz, uuid, integer) to service_role;

