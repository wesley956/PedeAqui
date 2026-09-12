alter table public.store_conversation_settings
  add column if not exists whatsapp_orders_enabled boolean not null default false;

comment on column public.store_conversation_settings.whatsapp_orders_enabled is
  'Permite que o bot monte e confirme pedidos diretamente pela conversa do WhatsApp.';
