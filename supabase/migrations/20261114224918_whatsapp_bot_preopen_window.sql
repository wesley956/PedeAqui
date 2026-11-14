alter table public.store_conversation_settings
  add column if not exists bot_preopen_minutes integer not null default 0;
alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_bot_preopen_minutes_check;
alter table public.store_conversation_settings
  add constraint store_conversation_settings_bot_preopen_minutes_check
  check (bot_preopen_minutes between 0 and 180);
comment on column public.store_conversation_settings.bot_preopen_minutes is
  'Allow inbound WhatsApp bot replies this many minutes before actual store opening; order acceptance and outbound notifications remain under store opening hours.';
