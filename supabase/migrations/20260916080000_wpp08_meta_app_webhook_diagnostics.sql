-- WPP-08 follow-up: diagnose Meta App webhook field subscription separately from WABA app subscription.
-- Stores only technical field names/statuses; no message content, phone number, token or credential.

alter table public.whatsapp_coexistence_observability
  add column if not exists app_webhook_status text not null default 'unknown'
    check (app_webhook_status in ('unknown','supported','not_supported','not_subscribed','subscribed','action_required')),
  add column if not exists app_webhook_checked_at timestamptz,
  add column if not exists app_webhook_fields text[] not null default '{}',
  add column if not exists last_app_webhook_error_kind text;

comment on column public.whatsapp_coexistence_observability.app_webhook_status is
  'Read-only certification status for the Meta App whatsapp_business_account webhook subscription.';
comment on column public.whatsapp_coexistence_observability.app_webhook_fields is
  'Technical Meta webhook field names observed for whatsapp_business_account; never message content or PII.';
