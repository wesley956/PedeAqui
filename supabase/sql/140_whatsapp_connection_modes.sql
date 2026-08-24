-- PedeAqui — WhatsApp connection readiness
-- Evolui o mesmo canal multitenant para suportar Cloud API dedicada e
-- coexistência com WhatsApp Business App sem alterar canais já conectados.

alter table public.store_conversation_settings
  add column if not exists connection_mode text not null default 'cloud_api';

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_connection_mode_check,
  add constraint store_conversation_settings_connection_mode_check
    check (connection_mode in ('cloud_api','coexistence'));

alter table public.whatsapp_embedded_signup_sessions
  add column if not exists connection_mode text not null default 'cloud_api';

alter table public.whatsapp_embedded_signup_sessions
  drop constraint if exists whatsapp_embedded_signup_sessions_connection_mode_check,
  add constraint whatsapp_embedded_signup_sessions_connection_mode_check
    check (connection_mode in ('cloud_api','coexistence'));

-- Toda conexão anterior foi feita pelo fluxo Cloud API tradicional.
update public.store_conversation_settings
set connection_mode = 'cloud_api'
where connection_mode is null;

update public.whatsapp_embedded_signup_sessions
set connection_mode = 'cloud_api'
where connection_mode is null;

create index if not exists store_conversation_settings_mode_status_idx
  on public.store_conversation_settings (connection_mode, connection_status)
  where whatsapp_enabled = true;
