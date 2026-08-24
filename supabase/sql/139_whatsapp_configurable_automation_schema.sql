-- PedeAqui — WhatsApp configurável por unidade (estrutura)
-- Fase 1 do rollout: adiciona somente colunas/constraints compatíveis com o worker atual.
-- Os novos gatilhos autoritativos entram em uma migration posterior ao deploy da aplicação.

alter table public.store_conversation_settings
  add column if not exists order_notification_preset text not null default 'custom',
  add column if not exists notify_order_confirmed boolean not null default false,
  add column if not exists notify_production_preparing boolean not null default false,
  add column if not exists notify_pickup_completed boolean not null default false;

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_order_notification_preset_check,
  add constraint store_conversation_settings_order_notification_preset_check
    check (order_notification_preset in ('simple','complete','custom'));

comment on column public.store_conversation_settings.order_notification_preset is
  'Perfil de automação de WhatsApp da unidade: simple, complete ou custom. Linhas antigas permanecem custom para preservar o comportamento existente.';

alter table public.order_whatsapp_notifications
  drop constraint if exists order_whatsapp_notifications_notification_type_check,
  add constraint order_whatsapp_notifications_notification_type_check
    check (notification_type in (
      'order_received',
      'order_confirmed',
      'production_preparing',
      'payment_paid',
      'pickup_ready',
      'pickup_completed',
      'out_for_delivery',
      'delivered'
    ));
