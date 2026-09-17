-- WPP-10: private, tenant-scoped media for the canonical conversation timeline.
-- Objects are written and signed only by the server-side service role. Browser
-- clients never receive a storage path or provider credential.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'conversation-media',
  'conversation-media',
  false,
  104857600,
  array[
    'image/jpeg','image/png','image/webp',
    'audio/mpeg','audio/ogg','audio/mp4','audio/aac','audio/amr','audio/wav',
    'video/mp4',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create unique index if not exists messages_scope_id_unique
  on public.messages (organization_id, store_id, conversation_id, id);

create table if not exists public.message_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  conversation_id uuid not null,
  message_id uuid not null,
  media_kind text not null check (media_kind in ('image','audio','video','document')),
  provider_media_id text,
  declared_mime_type text,
  mime_type text,
  original_filename text,
  caption text,
  is_voice boolean not null default false,
  storage_bucket text not null default 'conversation-media' check (storage_bucket = 'conversation-media'),
  storage_path text,
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 104857600),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  failure_kind text,
  send_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_media_message_same_scope_fk
    foreign key (organization_id, store_id, conversation_id, message_id)
    references public.messages (organization_id, store_id, conversation_id, id) on delete cascade,
  constraint message_media_storage_path_scope_check check (
    storage_path is null or storage_path like
      organization_id::text || '/' || store_id::text || '/' || conversation_id::text || '/' || message_id::text || '/%'
  ),
  constraint message_media_ready_shape_check check (
    status <> 'ready' or (storage_path is not null and mime_type is not null and size_bytes is not null)
  ),
  constraint message_media_failure_shape_check check (
    status <> 'failed' or failure_kind is not null
  )
);

create unique index if not exists message_media_message_unique
  on public.message_media (message_id);
create unique index if not exists message_media_provider_unique
  on public.message_media (store_id, provider_media_id)
  where provider_media_id is not null;
create index if not exists message_media_pending_idx
  on public.message_media (store_id, status, created_at)
  where status in ('pending','processing');

alter table public.message_media enable row level security;
revoke all on table public.message_media from public, anon, authenticated;
grant select, insert, update, delete on table public.message_media to service_role;

create or replace function private.capture_message_media()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_media_id text := nullif(trim(coalesce(new.metadata ->> 'media_id','')), '');
begin
  if new.content_type not in ('image','audio','video','document') then return new; end if;

  insert into public.message_media (
    organization_id, store_id, conversation_id, message_id, media_kind,
    provider_media_id, declared_mime_type, original_filename, caption, is_voice,
    status, failure_kind
  ) values (
    new.organization_id, new.store_id, new.conversation_id, new.id, new.content_type,
    v_media_id,
    nullif(left(trim(coalesce(new.metadata ->> 'media_mime_type','')), 180), ''),
    nullif(left(trim(coalesce(new.metadata ->> 'media_filename','')), 240), ''),
    nullif(left(trim(coalesce(new.metadata ->> 'media_caption','')), 1024), ''),
    coalesce((new.metadata ->> 'media_voice')::boolean, false),
    case when v_media_id is null and not (new.direction = 'outbound' and new.sender_type = 'agent') then 'failed' else 'pending' end,
    case when v_media_id is null and not (new.direction = 'outbound' and new.sender_type = 'agent') then 'legacy_media_unavailable' else null end
  )
  on conflict (message_id) do update
  set provider_media_id = coalesce(public.message_media.provider_media_id, excluded.provider_media_id),
      declared_mime_type = coalesce(public.message_media.declared_mime_type, excluded.declared_mime_type),
      original_filename = coalesce(public.message_media.original_filename, excluded.original_filename),
      caption = coalesce(public.message_media.caption, excluded.caption),
      is_voice = public.message_media.is_voice or excluded.is_voice,
      updated_at = now();
  return new;
exception
  when invalid_text_representation then
    -- A malformed optional voice flag never rejects the canonical message.
    return new;
end;
$$;

revoke all on function private.capture_message_media() from public, anon, authenticated;

drop trigger if exists trg_capture_message_media on public.messages;
create trigger trg_capture_message_media
after insert or update of metadata on public.messages
for each row execute function private.capture_message_media();

insert into public.message_media (
  organization_id, store_id, conversation_id, message_id, media_kind,
  provider_media_id, declared_mime_type, original_filename, caption, is_voice,
  status, failure_kind
)
select
  message.organization_id, message.store_id, message.conversation_id, message.id, message.content_type,
  nullif(trim(coalesce(message.metadata ->> 'media_id','')), ''),
  nullif(left(trim(coalesce(message.metadata ->> 'media_mime_type','')), 180), ''),
  nullif(left(trim(coalesce(message.metadata ->> 'media_filename','')), 240), ''),
  nullif(left(trim(coalesce(message.metadata ->> 'media_caption','')), 1024), ''),
  case when lower(coalesce(message.metadata ->> 'media_voice','false')) = 'true' then true else false end,
  case when nullif(trim(coalesce(message.metadata ->> 'media_id','')), '') is null then 'failed' else 'pending' end,
  case when nullif(trim(coalesce(message.metadata ->> 'media_id','')), '') is null then 'legacy_media_unavailable' else null end
from public.messages message
where message.content_type in ('image','audio','video','document')
on conflict (message_id) do nothing;

create or replace function public.conversation_create_outbound_media_internal(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text,
  p_content_type text,
  p_original_filename text,
  p_declared_mime_type text,
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
  if p_content_type not in ('image','audio','video','document') then raise exception 'invalid media type'; end if;
  if char_length(trim(coalesce(p_client_message_id,''))) < 8 or char_length(trim(p_client_message_id)) > 180 then
    raise exception 'invalid client message id';
  end if;
  if p_actor_user_id is null then raise exception 'agent message requires actor'; end if;
  if p_body is not null and char_length(p_body) > 16000 then raise exception 'invalid message body'; end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if v_conversation.id is null then raise exception 'conversation not found'; end if;
  if v_conversation.status <> 'human' or v_conversation.assigned_user_id is distinct from p_actor_user_id then
    raise exception 'agent must own human conversation';
  end if;

  insert into public.messages (
    organization_id, store_id, conversation_id, contact_id, provider,
    direction, sender_type, sender_user_id, content_type, body,
    client_message_id, delivery_status, metadata
  ) values (
    v_conversation.organization_id, v_conversation.store_id, v_conversation.id, v_conversation.contact_id,
    case when v_conversation.channel = 'whatsapp' then 'meta_cloud' else 'internal' end,
    'outbound', 'agent', p_actor_user_id, p_content_type, nullif(trim(coalesce(p_body,'')), ''),
    trim(p_client_message_id), 'pending',
    jsonb_strip_nulls(jsonb_build_object(
      'media_filename', nullif(left(trim(coalesce(p_original_filename,'')), 240), ''),
      'media_mime_type', nullif(left(trim(coalesce(p_declared_mime_type,'')), 180), '')
    ))
  )
  on conflict (organization_id, client_message_id) where client_message_id is not null
  do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message from public.messages
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
    'conversation.media_pending', 'message', v_message.id,
    jsonb_build_object('conversation_id',v_conversation.id,'content_type',p_content_type),
    p_actor_user_id
  );
  return v_message;
end;
$$;

revoke all on function public.conversation_create_outbound_media_internal(uuid,text,text,text,text,text,uuid)
from public, anon, authenticated;
grant execute on function public.conversation_create_outbound_media_internal(uuid,text,text,text,text,text,uuid)
to service_role;

create or replace function public.conversation_claim_outbound_media_internal(
  p_message_id uuid,
  p_actor_user_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed uuid;
begin
  update public.message_media media
  set send_claimed_at = now(), updated_at = now()
  from public.messages message, public.conversations conversation
  where media.message_id = p_message_id
    and message.id = media.message_id
    and conversation.id = message.conversation_id
    and message.sender_type = 'agent'
    and message.sender_user_id = p_actor_user_id
    and message.delivery_status = 'pending'
    and conversation.status = 'human'
    and conversation.assigned_user_id = p_actor_user_id
    and (media.send_claimed_at is null or media.send_claimed_at < now() - interval '2 minutes')
  returning media.id into v_claimed;
  return v_claimed is not null;
end;
$$;

revoke all on function public.conversation_claim_outbound_media_internal(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.conversation_claim_outbound_media_internal(uuid,uuid)
to service_role;

-- Storage has no browser policies by design. The service role is the only data
-- plane writer/reader and access is projected through an authenticated API.
