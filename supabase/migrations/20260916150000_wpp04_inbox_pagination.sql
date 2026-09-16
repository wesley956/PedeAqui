-- WPP-04: scalable server-side pagination for the Conversations inbox.
-- Additive only: no canonical conversation/message state is changed.

create index if not exists conversations_inbox_activity_idx
  on public.conversations (
    organization_id,
    store_id,
    (coalesce(last_message_at, opened_at)) desc,
    id desc
  );

create index if not exists messages_conversation_created_cursor_idx
  on public.messages (
    organization_id,
    store_id,
    conversation_id,
    created_at desc,
    id desc
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

create or replace function public.conversation_message_page_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_conversation_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 80
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 80), 1), 200);
  v_result jsonb;
begin
  if p_before_created_at is not null and p_after_created_at is not null then
    raise exception 'before and after cursors are mutually exclusive';
  end if;

  if p_after_created_at is not null then
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at asc, row_value.id asc), '[]'::jsonb)
    )
    into v_result
    from (
      select
        m.id,
        m.direction,
        m.sender_type,
        m.sender_user_id,
        m.content_type,
        m.body,
        m.delivery_status,
        m.external_message_id,
        m.error_message,
        m.provider_timestamp,
        m.metadata,
        m.created_at
      from public.messages m
      where m.organization_id = p_organization_id
        and m.store_id = p_store_id
        and m.conversation_id = p_conversation_id
        and (
          m.created_at > p_after_created_at
          or (
            m.created_at = p_after_created_at
            and p_after_id is not null
            and m.id > p_after_id
          )
        )
      order by m.created_at asc, m.id asc
      limit v_limit + 1
    ) row_value;
  else
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at asc, row_value.id asc), '[]'::jsonb)
    )
    into v_result
    from (
      select *
      from (
        select
          m.id,
          m.direction,
          m.sender_type,
          m.sender_user_id,
          m.content_type,
          m.body,
          m.delivery_status,
          m.external_message_id,
          m.error_message,
          m.provider_timestamp,
          m.metadata,
          m.created_at
        from public.messages m
        where m.organization_id = p_organization_id
          and m.store_id = p_store_id
          and m.conversation_id = p_conversation_id
          and (
            p_before_created_at is null
            or m.created_at < p_before_created_at
            or (
              m.created_at = p_before_created_at
              and p_before_id is not null
              and m.id < p_before_id
            )
          )
        order by m.created_at desc, m.id desc
        limit v_limit + 1
      ) newest_first
      order by newest_first.created_at asc, newest_first.id asc
    ) row_value;
  end if;

  return coalesce(v_result, jsonb_build_object('rows', '[]'::jsonb));
end;
$function$;

revoke all on function public.conversation_message_page_internal(uuid, uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer) from public;
revoke all on function public.conversation_message_page_internal(uuid, uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer) from anon;
revoke all on function public.conversation_message_page_internal(uuid, uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer) from authenticated;
grant execute on function public.conversation_message_page_internal(uuid, uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer) to service_role;
