-- WPP-10 production follow-up: legacy placeholder messages predate preservation
-- of Meta media IDs and therefore cannot be downloaded. Keep their canonical
-- timeline entries, but do not leave them indefinitely in "processing" state.

update public.message_media media
set status = 'failed',
    failure_kind = 'legacy_media_unavailable',
    updated_at = now()
from public.messages message
where message.id = media.message_id
  and media.provider_media_id is null
  and not (message.direction = 'outbound' and message.sender_type = 'agent')
  and media.status in ('pending','processing');

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
      status = case
        when public.message_media.status = 'failed'
          and public.message_media.failure_kind = 'legacy_media_unavailable'
          and excluded.provider_media_id is not null then 'pending'
        else public.message_media.status
      end,
      failure_kind = case
        when public.message_media.failure_kind = 'legacy_media_unavailable'
          and excluded.provider_media_id is not null then null
        else public.message_media.failure_kind
      end,
      updated_at = now();
  return new;
exception
  when invalid_text_representation then return new;
end;
$$;

revoke all on function private.capture_message_media() from public, anon, authenticated;
