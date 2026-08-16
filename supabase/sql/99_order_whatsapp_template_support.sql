-- PedeAqui — [329]
-- Suporte a template transacional aprovado pela Meta fora da janela de atendimento de 24h.
-- Migration append-only: a 98 já está aplicada em produção.

alter table public.store_conversation_settings
  add column if not exists order_notification_template_name text,
  add column if not exists order_notification_template_language text not null default 'pt_BR';

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_order_template_name_check,
  add constraint store_conversation_settings_order_template_name_check
    check (
      order_notification_template_name is null
      or order_notification_template_name ~ '^[a-z0-9_]{1,512}$'
    ),
  drop constraint if exists store_conversation_settings_order_template_language_check,
  add constraint store_conversation_settings_order_template_language_check
    check (order_notification_template_language ~ '^[a-z]{2}_[A-Z]{2}$');

comment on column public.store_conversation_settings.order_notification_template_name is
  'Nome do template utilitário aprovado na Meta para atualizações de pedido fora da janela de atendimento. Espera 4 parâmetros de corpo: restaurante, número, status e link.';
comment on column public.store_conversation_settings.order_notification_template_language is
  'Código de idioma/locale do template aprovado, por exemplo pt_BR.';
