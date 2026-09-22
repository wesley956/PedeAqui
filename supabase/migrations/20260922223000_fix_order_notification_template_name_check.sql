-- #1125 — PostgreSQL rejects the previous {1,512} regex quantifier with SQLSTATE 2201B.
-- Keep the same functional contract while separating length validation from character validation.

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_order_notification_template_name_check;

alter table public.store_conversation_settings
  add constraint store_conversation_settings_order_notification_template_name_check
  check (
    order_notification_template_name is null
    or (
      char_length(order_notification_template_name) between 1 and 512
      and order_notification_template_name ~ '^[a-z0-9_]+$'
    )
  );
