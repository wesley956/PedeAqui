-- Optional per-store silence outside opening hours; existing stores keep their behavior.
alter table public.store_conversation_settings
  add column if not exists bot_only_when_open boolean not null default false;

comment on column public.store_conversation_settings.bot_only_when_open is
  'When enabled, automatic WhatsApp replies and notifications stay silent while the store is closed or paused.';
