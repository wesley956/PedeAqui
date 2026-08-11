-- PedeAqui — Milestone 16 [152]–[163]
-- Conversas / WhatsApp / IA: núcleo multi-tenant, inbox, handoff e sessões de automação.

insert into public.permissions (key, description) values
  ('conversations.view', 'Visualizar contatos, conversas e mensagens'),
  ('conversations.manage', 'Gerenciar fila, responsáveis e estados das conversas'),
  ('conversations.reply', 'Responder conversas por canais integrados'),
  ('conversations.ai', 'Configurar e operar automações/IA autorizadas')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('conversations.view','conversations.manage','conversations.reply','conversations.ai')
where r.key in ('owner','manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('conversations.view','conversations.manage','conversations.reply')
where r.key = 'attendant'
on conflict do nothing;

create or replace function private.grant_conversation_permissions_for_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.key in ('owner','manager') then
    insert into public.role_permissions (role_id, permission_id)
    select new.id, p.id from public.permissions p
    where p.key in ('conversations.view','conversations.manage','conversations.reply','conversations.ai')
    on conflict do nothing;
  elsif new.key = 'attendant' then
    insert into public.role_permissions (role_id, permission_id)
    select new.id, p.id from public.permissions p
    where p.key in ('conversations.view','conversations.manage','conversations.reply')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.grant_conversation_permissions_for_role() from public, anon, authenticated;
drop trigger if exists roles_grant_conversation_permissions on public.roles;
create trigger roles_grant_conversation_permissions
after insert on public.roles
for each row execute function private.grant_conversation_permissions_for_role();

create table if not exists public.store_conversation_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid primary key,
  whatsapp_enabled boolean not null default false,
  provider text not null default 'meta_cloud' check (provider in ('meta_cloud')),
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  access_token_secret_ref text,
  app_secret_secret_ref text,
  default_bot_enabled boolean not null default true,
  ai_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint store_conversation_settings_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint store_conversation_settings_phone_unique unique (whatsapp_phone_number_id),
  constraint store_conversation_settings_secret_refs check (
    (access_token_secret_ref is null or char_length(trim(access_token_secret_ref)) between 2 and 180)
    and (app_secret_secret_ref is null or char_length(trim(app_secret_secret_ref)) between 2 and 180)
  )
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  channel text not null check (channel in ('whatsapp','instagram','web_chat','manual')),
  external_id text,
  phone_normalized text,
  name text check (name is null or char_length(trim(name)) between 1 and 120),
  customer_id uuid,
  profile jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint contacts_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete set null (customer_id),
  constraint contacts_org_store_id_unique unique (organization_id, store_id, id),
  constraint contacts_external_shape check (
    external_id is null or char_length(trim(external_id)) between 1 and 180
  ),
  constraint contacts_phone_shape check (
    phone_normalized is null or phone_normalized ~ '^[0-9]{8,20}$'
  )
);

create unique index if not exists contacts_store_channel_external_unique
  on public.contacts (store_id, channel, external_id)
  where external_id is not null;
create unique index if not exists contacts_store_channel_phone_unique
  on public.contacts (store_id, channel, phone_normalized)
  where phone_normalized is not null;
create index if not exists contacts_org_store_recent_idx
  on public.contacts (organization_id, store_id, last_seen_at desc nulls last, created_at desc);
create index if not exists contacts_customer_idx
  on public.contacts (organization_id, customer_id)
  where customer_id is not null;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  contact_id uuid not null,
  channel text not null check (channel in ('whatsapp','instagram','web_chat','manual')),
  status text not null default 'bot' check (status in ('bot','waiting_agent','human','closed')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  subject text check (subject is null or char_length(trim(subject)) between 1 and 160),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint conversations_contact_same_store_fk
    foreign key (organization_id, store_id, contact_id)
    references public.contacts (organization_id, store_id, id) on delete restrict,
  constraint conversations_org_store_id_unique unique (organization_id, store_id, id),
  constraint conversations_assignment_consistency check (
    (status = 'human' and assigned_user_id is not null)
    or (status <> 'human' and assigned_user_id is null)
  ),
  constraint conversations_closed_consistency check (
    (status = 'closed' and closed_at is not null)
    or (status <> 'closed' and closed_at is null)
  )
);

create unique index if not exists conversations_one_active_per_contact_channel_idx
  on public.conversations (store_id, contact_id, channel)
  where status <> 'closed';
create index if not exists conversations_store_queue_idx
  on public.conversations (organization_id, store_id, status, last_message_at desc nulls last, opened_at desc);
create index if not exists conversations_assignee_idx
  on public.conversations (organization_id, store_id, assigned_user_id, status)
  where assigned_user_id is not null;

create table if not exists public.conversation_state_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  conversation_id uuid not null,
  from_state text,
  to_state text not null check (to_state in ('bot','waiting_agent','human','closed')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  reason text,
  source text not null default 'system' check (source in ('system','webhook','bot','panel','ai')),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint conversation_state_history_conversation_same_store_fk
    foreign key (organization_id, store_id, conversation_id)
    references public.conversations (organization_id, store_id, id) on delete cascade
);

create index if not exists conversation_state_history_timeline_idx
  on public.conversation_state_history (organization_id, store_id, conversation_id, created_at);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  conversation_id uuid not null,
  contact_id uuid not null,
  provider text not null default 'internal' check (provider in ('internal','meta_cloud')),
  direction text not null check (direction in ('inbound','outbound')),
  sender_type text not null check (sender_type in ('contact','agent','bot','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  content_type text not null default 'text'
    check (content_type in ('text','image','audio','video','document','location','template','interactive','unsupported')),
  body text,
  external_message_id text,
  client_message_id text,
  in_reply_to_external_id text,
  delivery_status text not null
    check (delivery_status in ('received','pending','sent','delivered','read','failed')),
  provider_timestamp timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_conversation_same_store_fk
    foreign key (organization_id, store_id, conversation_id)
    references public.conversations (organization_id, store_id, id) on delete cascade,
  constraint messages_contact_same_store_fk
    foreign key (organization_id, store_id, contact_id)
    references public.contacts (organization_id, store_id, id) on delete restrict,
  constraint messages_sender_consistency check (
    (sender_type = 'agent' and sender_user_id is not null)
    or (sender_type <> 'agent' and sender_user_id is null)
  ),
  constraint messages_direction_status_consistency check (
    (direction = 'inbound' and delivery_status = 'received')
    or direction = 'outbound'
  ),
  constraint messages_body_shape check (
    body is null or char_length(body) <= 16000
  )
);

create unique index if not exists messages_store_provider_external_unique
  on public.messages (store_id, provider, external_message_id)
  where external_message_id is not null;
create unique index if not exists messages_org_client_message_unique
  on public.messages (organization_id, client_message_id)
  where client_message_id is not null;
create index if not exists messages_conversation_timeline_idx
  on public.messages (organization_id, store_id, conversation_id, created_at);
create index if not exists messages_delivery_lookup_idx
  on public.messages (organization_id, store_id, provider, delivery_status, created_at desc);

create table if not exists public.automation_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  conversation_id uuid not null,
  state text not null default 'active' check (state in ('active','paused','completed','expired')),
  step text not null default 'start' check (char_length(trim(step)) between 1 and 120),
  context jsonb not null default '{}'::jsonb,
  last_input_message_id uuid,
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_sessions_conversation_same_store_fk
    foreign key (organization_id, store_id, conversation_id)
    references public.conversations (organization_id, store_id, id) on delete cascade,
  constraint automation_sessions_last_message_fk
    foreign key (last_input_message_id) references public.messages(id) on delete set null,
  constraint automation_sessions_conversation_unique unique (conversation_id)
);

create index if not exists automation_sessions_store_state_idx
  on public.automation_sessions (organization_id, store_id, state, expires_at);

alter table public.store_conversation_settings enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_state_history enable row level security;
alter table public.messages enable row level security;
alter table public.automation_sessions enable row level security;

revoke all on table
  public.store_conversation_settings,
  public.contacts,
  public.conversations,
  public.conversation_state_history,
  public.messages,
  public.automation_sessions
from anon, authenticated;

grant select on table
  public.contacts,
  public.conversations,
  public.conversation_state_history,
  public.messages
to authenticated;

grant select, insert, update on table
  public.store_conversation_settings,
  public.contacts,
  public.conversations,
  public.messages,
  public.automation_sessions
to service_role;

grant select, insert on table public.conversation_state_history to service_role;

create policy contacts_view on public.contacts
for select to authenticated
using (private.has_permission(organization_id, store_id, 'conversations.view'));

create policy conversations_view on public.conversations
for select to authenticated
using (private.has_permission(organization_id, store_id, 'conversations.view'));

create policy conversation_state_history_view on public.conversation_state_history
for select to authenticated
using (private.has_permission(organization_id, store_id, 'conversations.view'));

create policy messages_view on public.messages
for select to authenticated
using (private.has_permission(organization_id, store_id, 'conversations.view'));

create or replace function private.protect_message_immutable_content()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.store_id is distinct from new.store_id
    or old.conversation_id is distinct from new.conversation_id
    or old.contact_id is distinct from new.contact_id
    or old.provider is distinct from new.provider
    or old.direction is distinct from new.direction
    or old.sender_type is distinct from new.sender_type
    or old.sender_user_id is distinct from new.sender_user_id
    or old.content_type is distinct from new.content_type
    or old.body is distinct from new.body
    or old.client_message_id is distinct from new.client_message_id
    or old.in_reply_to_external_id is distinct from new.in_reply_to_external_id
    or old.provider_timestamp is distinct from new.provider_timestamp
  then
    raise exception 'message immutable content cannot be changed';
  end if;

  if old.external_message_id is not null
    and old.external_message_id is distinct from new.external_message_id
  then
    raise exception 'external message id cannot be replaced';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_message_immutable_content() from public, anon, authenticated;
drop trigger if exists messages_immutable_content_guard on public.messages;
create trigger messages_immutable_content_guard
before update on public.messages
for each row execute function private.protect_message_immutable_content();

create or replace function public.conversation_transition_internal(
  p_conversation_id uuid,
  p_target_state text,
  p_assigned_user_id uuid default null,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_source text default 'panel'
) returns public.conversations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_result public.conversations%rowtype;
begin
  if p_target_state not in ('bot','waiting_agent','human','closed') then
    raise exception 'invalid conversation state';
  end if;
  if p_source not in ('system','webhook','bot','panel','ai') then
    raise exception 'invalid conversation source';
  end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if v_conversation.id is null then raise exception 'conversation not found'; end if;

  if v_conversation.status = p_target_state then
    if p_target_state = 'human' and v_conversation.assigned_user_id is distinct from p_assigned_user_id then
      update public.conversations
      set assigned_user_id = p_assigned_user_id, version = version + 1, updated_at = now()
      where id = v_conversation.id
      returning * into v_result;
    else
      return v_conversation;
    end if;
  else
    if not (
      (v_conversation.status = 'bot' and p_target_state in ('waiting_agent','human','closed'))
      or (v_conversation.status = 'waiting_agent' and p_target_state in ('bot','human','closed'))
      or (v_conversation.status = 'human' and p_target_state in ('bot','waiting_agent','closed'))
      or (v_conversation.status = 'closed' and p_target_state in ('bot','waiting_agent'))
    ) then
      raise exception 'invalid conversation transition: % -> %', v_conversation.status, p_target_state;
    end if;

    if p_target_state = 'human' and p_assigned_user_id is null then
      raise exception 'human conversation requires assigned user';
    end if;

    update public.conversations
    set status = p_target_state,
        assigned_user_id = case when p_target_state = 'human' then p_assigned_user_id else null end,
        closed_at = case when p_target_state = 'closed' then now() else null end,
        version = version + 1,
        updated_at = now()
    where id = v_conversation.id
    returning * into v_result;
  end if;

  insert into public.conversation_state_history (
    organization_id, store_id, conversation_id, from_state, to_state,
    assigned_user_id, reason, source, actor_user_id
  ) values (
    v_conversation.organization_id, v_conversation.store_id, v_conversation.id,
    v_conversation.status, v_result.status, v_result.assigned_user_id,
    nullif(trim(coalesce(p_reason,'')),''), p_source, p_actor_user_id
  );

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    v_conversation.organization_id, v_conversation.store_id, p_actor_user_id,
    'conversation.state_changed', 'conversation', v_conversation.id,
    jsonb_build_object('status', v_conversation.status, 'assigned_user_id', v_conversation.assigned_user_id),
    jsonb_build_object('status', v_result.status, 'assigned_user_id', v_result.assigned_user_id, 'reason', nullif(trim(coalesce(p_reason,'')),''))
  );

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    v_conversation.organization_id, v_conversation.store_id,
    'conversation.' || v_result.status, 'conversation', v_conversation.id,
    jsonb_build_object('from_state', v_conversation.status, 'to_state', v_result.status, 'assigned_user_id', v_result.assigned_user_id),
    p_actor_user_id
  );

  return v_result;
end;
$$;

revoke all on function public.conversation_transition_internal(uuid,text,uuid,text,uuid,text)
from public, anon, authenticated;
grant execute on function public.conversation_transition_internal(uuid,text,uuid,text,uuid,text)
to service_role;

create or replace function public.conversation_receive_message_internal(
  p_store_id uuid,
  p_provider text,
  p_external_contact_id text,
  p_phone_normalized text,
  p_contact_name text,
  p_external_message_id text,
  p_body text,
  p_content_type text default 'text',
  p_provider_timestamp timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_contact public.contacts%rowtype;
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_contact_created boolean := false;
  v_conversation_created boolean := false;
  v_message_created boolean := false;
begin
  if p_provider not in ('meta_cloud') then raise exception 'unsupported provider'; end if;
  if char_length(trim(coalesce(p_external_contact_id,''))) < 1 then raise exception 'external contact id required'; end if;
  if char_length(trim(coalesce(p_external_message_id,''))) < 1 then raise exception 'external message id required'; end if;
  if p_phone_normalized is not null and p_phone_normalized !~ '^[0-9]{8,20}$' then raise exception 'invalid phone'; end if;
  if p_content_type not in ('text','image','audio','video','document','location','template','interactive','unsupported') then
    raise exception 'invalid content type';
  end if;

  select * into v_store from public.stores where id = p_store_id and status = 'active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  select * into v_contact
  from public.contacts
  where store_id = v_store.id and channel = 'whatsapp' and external_id = trim(p_external_contact_id)
  for update;

  if v_contact.id is null and p_phone_normalized is not null then
    select * into v_contact
    from public.contacts
    where store_id = v_store.id and channel = 'whatsapp' and phone_normalized = p_phone_normalized
    for update;
  end if;

  if v_contact.id is null then
    insert into public.contacts (
      organization_id, store_id, channel, external_id, phone_normalized, name, last_seen_at
    ) values (
      v_store.organization_id, v_store.id, 'whatsapp', trim(p_external_contact_id), p_phone_normalized,
      nullif(trim(coalesce(p_contact_name,'')),''), coalesce(p_provider_timestamp, now())
    )
    returning * into v_contact;
    v_contact_created := true;
  else
    update public.contacts
    set external_id = coalesce(external_id, trim(p_external_contact_id)),
        phone_normalized = coalesce(phone_normalized, p_phone_normalized),
        name = coalesce(nullif(trim(coalesce(p_contact_name,'')),''), name),
        last_seen_at = greatest(coalesce(last_seen_at, '-infinity'::timestamptz), coalesce(p_provider_timestamp, now())),
        updated_at = now()
    where id = v_contact.id
    returning * into v_contact;
  end if;

  select * into v_conversation
  from public.conversations
  where store_id = v_store.id and contact_id = v_contact.id and channel = 'whatsapp' and status <> 'closed'
  order by opened_at desc
  limit 1
  for update;

  if v_conversation.id is null then
    insert into public.conversations (
      organization_id, store_id, contact_id, channel, status, last_message_at
    ) values (
      v_store.organization_id, v_store.id, v_contact.id, 'whatsapp', 'bot', coalesce(p_provider_timestamp, now())
    )
    returning * into v_conversation;
    v_conversation_created := true;

    insert into public.conversation_state_history (
      organization_id, store_id, conversation_id, from_state, to_state, source
    ) values (
      v_store.organization_id, v_store.id, v_conversation.id, null, 'bot', 'webhook'
    );

    insert into public.domain_events (
      organization_id, store_id, event_type, entity_type, entity_id, payload
    ) values (
      v_store.organization_id, v_store.id, 'conversation.created', 'conversation', v_conversation.id,
      jsonb_build_object('channel','whatsapp','contact_id',v_contact.id)
    );
  end if;

  insert into public.messages (
    organization_id, store_id, conversation_id, contact_id, provider,
    direction, sender_type, content_type, body, external_message_id,
    delivery_status, provider_timestamp, metadata
  ) values (
    v_store.organization_id, v_store.id, v_conversation.id, v_contact.id, p_provider,
    'inbound', 'contact', p_content_type, left(p_body,16000), trim(p_external_message_id),
    'received', p_provider_timestamp, coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (store_id, provider, external_message_id) where external_message_id is not null
  do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message
    from public.messages
    where store_id = v_store.id and provider = p_provider and external_message_id = trim(p_external_message_id);
  else
    v_message_created := true;
    update public.conversations
    set unread_count = unread_count + 1,
        last_message_at = greatest(coalesce(last_message_at, '-infinity'::timestamptz), coalesce(p_provider_timestamp, now())),
        version = version + 1,
        updated_at = now()
    where id = v_conversation.id
    returning * into v_conversation;

    insert into public.domain_events (
      organization_id, store_id, event_type, entity_type, entity_id, payload
    ) values (
      v_store.organization_id, v_store.id, 'conversation.message_received', 'message', v_message.id,
      jsonb_build_object('conversation_id',v_conversation.id,'contact_id',v_contact.id,'provider',p_provider)
    );
  end if;

  return jsonb_build_object(
    'contact_id', v_contact.id,
    'conversation_id', v_conversation.id,
    'message_id', v_message.id,
    'contact_created', v_contact_created,
    'conversation_created', v_conversation_created,
    'message_created', v_message_created
  );
end;
$$;

revoke all on function public.conversation_receive_message_internal(uuid,text,text,text,text,text,text,text,timestamptz,jsonb)
from public, anon, authenticated;
grant execute on function public.conversation_receive_message_internal(uuid,text,text,text,text,text,text,text,timestamptz,jsonb)
to service_role;

create or replace function public.conversation_create_outbound_internal(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text,
  p_sender_type text,
  p_actor_user_id uuid default null
) returns public.messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
begin
  if p_sender_type not in ('agent','bot','system') then raise exception 'invalid outbound sender'; end if;
  if char_length(trim(coalesce(p_body,''))) < 1 or char_length(p_body) > 16000 then raise exception 'invalid message body'; end if;
  if char_length(trim(coalesce(p_client_message_id,''))) < 8 or char_length(trim(p_client_message_id)) > 180 then
    raise exception 'invalid client message id';
  end if;
  if p_sender_type = 'agent' and p_actor_user_id is null then raise exception 'agent message requires actor'; end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if v_conversation.id is null then raise exception 'conversation not found'; end if;
  if v_conversation.status = 'closed' then raise exception 'conversation is closed'; end if;
  if p_sender_type = 'agent'
     and (v_conversation.status <> 'human' or v_conversation.assigned_user_id is distinct from p_actor_user_id)
  then
    raise exception 'agent must own human conversation';
  end if;
  if p_sender_type = 'bot' and v_conversation.status <> 'bot' then
    raise exception 'bot cannot reply outside bot state';
  end if;

  insert into public.messages (
    organization_id, store_id, conversation_id, contact_id, provider,
    direction, sender_type, sender_user_id, content_type, body,
    client_message_id, delivery_status
  ) values (
    v_conversation.organization_id, v_conversation.store_id, v_conversation.id, v_conversation.contact_id,
    case when v_conversation.channel = 'whatsapp' then 'meta_cloud' else 'internal' end,
    'outbound', p_sender_type, case when p_sender_type='agent' then p_actor_user_id else null end,
    'text', p_body, trim(p_client_message_id), 'pending'
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
    'conversation.message_pending', 'message', v_message.id,
    jsonb_build_object('conversation_id',v_conversation.id,'sender_type',p_sender_type),
    p_actor_user_id
  );

  return v_message;
end;
$$;

revoke all on function public.conversation_create_outbound_internal(uuid,text,text,text,uuid)
from public, anon, authenticated;
grant execute on function public.conversation_create_outbound_internal(uuid,text,text,text,uuid)
to service_role;

create or replace function public.conversation_mark_outbound_result_internal(
  p_message_id uuid,
  p_external_message_id text,
  p_status text,
  p_error_code text default null,
  p_error_message text default null
) returns public.messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
begin
  if p_status not in ('sent','failed') then raise exception 'invalid outbound result'; end if;

  select * into v_message from public.messages where id = p_message_id for update;
  if v_message.id is null then raise exception 'message not found'; end if;
  if v_message.direction <> 'outbound' then raise exception 'message is not outbound'; end if;

  update public.messages
  set external_message_id = case
        when p_status='sent' then coalesce(external_message_id, nullif(trim(coalesce(p_external_message_id,'')),''))
        else external_message_id
      end,
      delivery_status = p_status,
      error_code = case when p_status='failed' then nullif(trim(coalesce(p_error_code,'')),'') else null end,
      error_message = case when p_status='failed' then left(nullif(trim(coalesce(p_error_message,'')),''),1000) else null end,
      updated_at = now()
  where id = v_message.id
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.conversation_mark_outbound_result_internal(uuid,text,text,text,text)
from public, anon, authenticated;
grant execute on function public.conversation_mark_outbound_result_internal(uuid,text,text,text,text)
to service_role;

create or replace function public.conversation_update_delivery_internal(
  p_store_id uuid,
  p_provider text,
  p_external_message_id text,
  p_status text,
  p_error_code text default null,
  p_error_message text default null
) returns public.messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
  v_old_rank integer;
  v_new_rank integer;
begin
  if p_status not in ('sent','delivered','read','failed') then raise exception 'invalid delivery status'; end if;
  select * into v_message
  from public.messages
  where store_id = p_store_id and provider = p_provider and external_message_id = p_external_message_id
  for update;
  if v_message.id is null then return null; end if;
  if v_message.direction <> 'outbound' then return v_message; end if;

  v_old_rank := case v_message.delivery_status when 'pending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else -1 end;
  v_new_rank := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else -1 end;

  if p_status <> 'failed' and v_old_rank > v_new_rank then return v_message; end if;

  update public.messages
  set delivery_status = p_status,
      error_code = case when p_status='failed' then nullif(trim(coalesce(p_error_code,'')),'') else error_code end,
      error_message = case when p_status='failed' then left(nullif(trim(coalesce(p_error_message,'')),''),1000) else error_message end,
      updated_at = now()
  where id = v_message.id
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.conversation_update_delivery_internal(uuid,text,text,text,text,text)
from public, anon, authenticated;
grant execute on function public.conversation_update_delivery_internal(uuid,text,text,text,text,text)
to service_role;

create or replace function public.conversation_mark_read_internal(
  p_conversation_id uuid
) returns public.conversations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result public.conversations%rowtype;
begin
  update public.conversations
  set unread_count = 0, updated_at = now()
  where id = p_conversation_id
  returning * into v_result;
  if v_result.id is null then raise exception 'conversation not found'; end if;
  return v_result;
end;
$$;

revoke all on function public.conversation_mark_read_internal(uuid) from public, anon, authenticated;
grant execute on function public.conversation_mark_read_internal(uuid) to service_role;

create or replace function public.automation_session_upsert_internal(
  p_conversation_id uuid,
  p_step text,
  p_context jsonb,
  p_last_input_message_id uuid default null,
  p_expires_at timestamptz default null
) returns public.automation_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_result public.automation_sessions%rowtype;
begin
  if char_length(trim(coalesce(p_step,''))) < 1 or char_length(trim(p_step)) > 120 then
    raise exception 'invalid automation step';
  end if;
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if v_conversation.id is null then raise exception 'conversation not found'; end if;
  if v_conversation.status <> 'bot' then raise exception 'automation session requires bot state'; end if;

  insert into public.automation_sessions (
    organization_id, store_id, conversation_id, state, step, context,
    last_input_message_id, version, expires_at
  ) values (
    v_conversation.organization_id, v_conversation.store_id, v_conversation.id,
    'active', trim(p_step), coalesce(p_context,'{}'::jsonb), p_last_input_message_id, 1, p_expires_at
  )
  on conflict (conversation_id) do update
    set state='active', step=excluded.step, context=excluded.context,
        last_input_message_id=excluded.last_input_message_id,
        version=public.automation_sessions.version+1,
        expires_at=excluded.expires_at, updated_at=now()
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.automation_session_upsert_internal(uuid,text,jsonb,uuid,timestamptz)
from public, anon, authenticated;
grant execute on function public.automation_session_upsert_internal(uuid,text,jsonb,uuid,timestamptz)
to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
