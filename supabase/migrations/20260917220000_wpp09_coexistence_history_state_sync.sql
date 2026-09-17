-- WPP-09: Coexistence history + SMB app contact state sync.
-- Additive, OFF by default, service-role-only execution.

alter table public.store_conversation_settings
  add column if not exists coexistence_history_sync_enabled boolean not null default false,
  add column if not exists coexistence_contact_sync_enabled boolean not null default false;

alter table public.whatsapp_coexistence_observability
  add column if not exists last_history_webhook_at timestamptz,
  add column if not exists last_history_processed_at timestamptz,
  add column if not exists last_history_imported_count integer not null default 0,
  add column if not exists last_history_duplicate_count integer not null default 0,
  add column if not exists last_history_phase text,
  add column if not exists last_history_chunk_order integer,
  add column if not exists last_history_progress text,
  add column if not exists last_history_error_kind text,
  add column if not exists last_state_sync_webhook_at timestamptz,
  add column if not exists last_state_sync_processed_at timestamptz,
  add column if not exists last_state_sync_applied_count integer not null default 0,
  add column if not exists last_state_sync_ignored_count integer not null default 0,
  add column if not exists last_state_sync_error_kind text;

create or replace function public.conversation_import_history_internal(
  p_store_id uuid,
  p_items jsonb,
  p_sync_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_store public.stores%rowtype;
  v_settings public.store_conversation_settings%rowtype;
  v_item jsonb;
  v_contact public.contacts%rowtype;
  v_conversation public.conversations%rowtype;
  v_message_id uuid;
  v_external_contact_id text;
  v_phone_normalized text;
  v_external_message_id text;
  v_direction text;
  v_body text;
  v_content_type text;
  v_delivery_status text;
  v_provider_timestamp timestamptz;
  v_metadata jsonb;
  v_imported integer := 0;
  v_duplicate integer := 0;
  v_ignored integer := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'history items must be a json array';
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id and status = 'active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  select * into v_settings
  from public.store_conversation_settings
  where organization_id = v_store.organization_id
    and store_id = v_store.id
    and provider = 'meta_cloud'
    and whatsapp_enabled
    and connection_mode = 'coexistence';
  if v_settings.store_id is null then raise exception 'coexistence unavailable'; end if;
  if not v_settings.coexistence_history_sync_enabled then
    return jsonb_build_object('disabled', true, 'imported', 0, 'duplicates', 0, 'ignored', jsonb_array_length(p_items));
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_external_contact_id := nullif(trim(coalesce(v_item ->> 'external_contact_id', '')), '');
    v_phone_normalized := nullif(trim(coalesce(v_item ->> 'phone_normalized', '')), '');
    v_external_message_id := nullif(trim(coalesce(v_item ->> 'external_message_id', '')), '');
    v_direction := nullif(trim(coalesce(v_item ->> 'direction', '')), '');
    v_body := left(coalesce(v_item ->> 'body', ''), 16000);
    v_content_type := coalesce(nullif(trim(v_item ->> 'content_type'), ''), 'unsupported');
    v_delivery_status := coalesce(nullif(trim(v_item ->> 'delivery_status'), ''), case when v_direction = 'inbound' then 'received' else 'sent' end);
    v_metadata := coalesce(v_item -> 'metadata', '{}'::jsonb) || jsonb_build_object('sync_source', 'history', 'historical', true);

    begin
      v_provider_timestamp := nullif(v_item ->> 'provider_timestamp', '')::timestamptz;
    exception when others then
      v_provider_timestamp := null;
    end;

    if v_external_contact_id is null
      or v_external_message_id is null
      or v_direction not in ('inbound', 'outbound')
      or (v_phone_normalized is not null and v_phone_normalized !~ '^[0-9]{8,20}$')
      or v_content_type not in ('text','image','audio','video','document','location','template','interactive','unsupported')
      or v_delivery_status not in ('received','pending','sent','delivered','read','failed')
      or (v_direction = 'inbound' and v_delivery_status <> 'received')
    then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    if exists (
      select 1 from public.messages m
      where m.store_id = v_store.id
        and m.provider = 'meta_cloud'
        and m.external_message_id = v_external_message_id
    ) then
      v_duplicate := v_duplicate + 1;
      continue;
    end if;

    v_contact := null;
    select * into v_contact
    from public.contacts c
    where c.store_id = v_store.id
      and c.channel = 'whatsapp'
      and (
        c.external_id = v_external_contact_id
        or (v_phone_normalized is not null and c.phone_normalized = v_phone_normalized)
      )
    order by (c.external_id = v_external_contact_id) desc, c.created_at
    limit 1
    for update;

    if v_contact.id is null then
      insert into public.contacts (
        organization_id, store_id, channel, external_id, phone_normalized, profile
      ) values (
        v_store.organization_id, v_store.id, 'whatsapp', v_external_contact_id, v_phone_normalized,
        jsonb_build_object('coexistence_history_seen', true)
      ) returning * into v_contact;
    else
      update public.contacts
      set external_id = coalesce(external_id, v_external_contact_id),
          phone_normalized = coalesce(phone_normalized, v_phone_normalized),
          profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object('coexistence_history_seen', true),
          updated_at = pg_catalog.now()
      where id = v_contact.id
      returning * into v_contact;
    end if;

    v_conversation := null;
    select * into v_conversation
    from public.conversations c
    where c.organization_id = v_store.organization_id
      and c.store_id = v_store.id
      and c.contact_id = v_contact.id
      and c.channel = 'whatsapp'
      and c.status <> 'closed'
    order by c.opened_at desc
    limit 1
    for update;

    if v_conversation.id is null then
      insert into public.conversations (
        organization_id, store_id, contact_id, channel, status, unread_count,
        last_message_at, opened_at
      ) values (
        v_store.organization_id, v_store.id, v_contact.id, 'whatsapp', 'bot', 0,
        coalesce(v_provider_timestamp, pg_catalog.now()), coalesce(v_provider_timestamp, pg_catalog.now())
      ) returning * into v_conversation;

      insert into public.conversation_state_history (
        organization_id, store_id, conversation_id, from_state, to_state, reason, source
      ) values (
        v_store.organization_id, v_store.id, v_conversation.id, null, 'bot',
        'Conversa criada por sincronização histórica do WhatsApp Business', 'webhook'
      );
    end if;

    if v_direction = 'outbound' then
      v_metadata := v_metadata || jsonb_build_object('source', 'whatsapp_business_app');
    end if;

    v_message_id := null;
    insert into public.messages (
      organization_id, store_id, conversation_id, contact_id, provider,
      direction, sender_type, content_type, body, external_message_id,
      delivery_status, provider_timestamp, metadata, created_at, updated_at
    ) values (
      v_store.organization_id, v_store.id, v_conversation.id, v_contact.id, 'meta_cloud',
      v_direction, case when v_direction = 'inbound' then 'contact' else 'system' end,
      v_content_type, v_body, v_external_message_id,
      v_delivery_status, v_provider_timestamp, v_metadata,
      coalesce(v_provider_timestamp, pg_catalog.now()), coalesce(v_provider_timestamp, pg_catalog.now())
    )
    on conflict (store_id, provider, external_message_id) where external_message_id is not null
    do nothing
    returning id into v_message_id;

    if v_message_id is null then
      v_duplicate := v_duplicate + 1;
      continue;
    end if;

    v_imported := v_imported + 1;

    update public.conversations c
    set last_message_at = greatest(
          coalesce(c.last_message_at, '-infinity'::timestamptz),
          coalesce(v_provider_timestamp, c.last_message_at, c.opened_at)
        ),
        opened_at = case
          when not exists (
            select 1 from public.messages live
            where live.organization_id = c.organization_id
              and live.store_id = c.store_id
              and live.conversation_id = c.id
              and coalesce(live.metadata ->> 'sync_source', '') <> 'history'
          )
          then least(c.opened_at, coalesce(v_provider_timestamp, c.opened_at))
          else c.opened_at
        end,
        version = c.version + 1,
        updated_at = pg_catalog.now()
    where c.id = v_conversation.id;
  end loop;

  return jsonb_build_object(
    'disabled', false,
    'imported', v_imported,
    'duplicates', v_duplicate,
    'ignored', v_ignored,
    'sync_metadata', coalesce(p_sync_metadata, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.conversation_import_history_internal(uuid, jsonb, jsonb) from public;
revoke all on function public.conversation_import_history_internal(uuid, jsonb, jsonb) from anon;
revoke all on function public.conversation_import_history_internal(uuid, jsonb, jsonb) from authenticated;
grant execute on function public.conversation_import_history_internal(uuid, jsonb, jsonb) to service_role;

create or replace function public.conversation_sync_app_contacts_internal(
  p_store_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_store public.stores%rowtype;
  v_settings public.store_conversation_settings%rowtype;
  v_item jsonb;
  v_contact public.contacts%rowtype;
  v_action text;
  v_phone text;
  v_name text;
  v_synced_at timestamptz;
  v_applied integer := 0;
  v_ignored integer := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'contact sync items must be a json array';
  end if;

  select * into v_store from public.stores where id = p_store_id and status = 'active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  select * into v_settings
  from public.store_conversation_settings
  where organization_id = v_store.organization_id
    and store_id = v_store.id
    and provider = 'meta_cloud'
    and whatsapp_enabled
    and connection_mode = 'coexistence';
  if v_settings.store_id is null then raise exception 'coexistence unavailable'; end if;
  if not v_settings.coexistence_contact_sync_enabled then
    return jsonb_build_object('disabled', true, 'applied', 0, 'ignored', jsonb_array_length(p_items));
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_action := lower(trim(coalesce(v_item ->> 'action', '')));
    v_phone := nullif(trim(coalesce(v_item ->> 'phone_normalized', '')), '');
    v_name := nullif(left(trim(coalesce(v_item ->> 'full_name', '')), 120), '');
    begin
      v_synced_at := nullif(v_item ->> 'synced_at', '')::timestamptz;
    exception when others then
      v_synced_at := null;
    end;

    if v_action not in ('add', 'remove') or v_phone is null or v_phone !~ '^[0-9]{8,20}$' then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    v_contact := null;
    select * into v_contact
    from public.contacts c
    where c.store_id = v_store.id
      and c.channel = 'whatsapp'
      and (c.external_id = v_phone or c.phone_normalized = v_phone)
    order by (c.external_id = v_phone) desc, c.created_at
    limit 1
    for update;

    if v_action = 'remove' then
      if v_contact.id is null then
        v_ignored := v_ignored + 1;
        continue;
      end if;
      update public.contacts
      set profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object(
            'coexistence_contact_present', false,
            'coexistence_contact_synced_at', coalesce(v_synced_at, pg_catalog.now())
          ),
          updated_at = pg_catalog.now()
      where id = v_contact.id;
      v_applied := v_applied + 1;
      continue;
    end if;

    if v_contact.id is null then
      insert into public.contacts (
        organization_id, store_id, channel, external_id, phone_normalized, name, profile
      ) values (
        v_store.organization_id, v_store.id, 'whatsapp', v_phone, v_phone, v_name,
        jsonb_build_object(
          'coexistence_contact_present', true,
          'coexistence_contact_synced_at', coalesce(v_synced_at, pg_catalog.now())
        )
      ) returning * into v_contact;
    else
      update public.contacts
      set external_id = coalesce(external_id, v_phone),
          phone_normalized = coalesce(phone_normalized, v_phone),
          name = coalesce(v_name, name),
          profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object(
            'coexistence_contact_present', true,
            'coexistence_contact_synced_at', coalesce(v_synced_at, pg_catalog.now())
          ),
          updated_at = pg_catalog.now()
      where id = v_contact.id
      returning * into v_contact;
    end if;
    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('disabled', false, 'applied', v_applied, 'ignored', v_ignored);
end;
$function$;

revoke all on function public.conversation_sync_app_contacts_internal(uuid, jsonb) from public;
revoke all on function public.conversation_sync_app_contacts_internal(uuid, jsonb) from anon;
revoke all on function public.conversation_sync_app_contacts_internal(uuid, jsonb) from authenticated;
grant execute on function public.conversation_sync_app_contacts_internal(uuid, jsonb) to service_role;

-- History-only seeds are not live customer activity. They stay reusable for the
-- first real inbound instead of being auto-closed before the customer speaks.
create or replace function public.conversation_auto_close_candidates_internal(p_limit integer default 100)
returns table(conversation_id uuid, expected_version bigint)
language sql
set search_path to ''
as $function$
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
    and c.status in ('bot', 'human')
    and exists (
      select 1 from public.messages live
      where live.organization_id = c.organization_id
        and live.store_id = c.store_id
        and live.conversation_id = c.id
        and coalesce(live.metadata ->> 'sync_source', '') <> 'history'
    )
    and coalesce(c.last_message_at, c.opened_at) <= pg_catalog.now() - pg_catalog.make_interval(
      mins => case when c.status = 'human' then s.human_auto_close_minutes else s.bot_auto_close_minutes end
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
$function$;

create or replace function public.conversation_auto_close_internal(
  p_conversation_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
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
  if v_conversation.status not in ('bot','human') then
    return jsonb_build_object('closed', false, 'reason', 'state_ineligible');
  end if;
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
    when v_conversation.status = 'human' then v_settings.human_auto_close_minutes
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
$function$;
