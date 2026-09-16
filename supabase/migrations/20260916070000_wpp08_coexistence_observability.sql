-- WPP-08: technical, content-free observability for WhatsApp Coexistence.
-- This table never stores message bodies, phone numbers, tokens, addresses or credentials.

create table if not exists public.whatsapp_coexistence_observability (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid primary key,
  subscription_status text not null default 'unknown'
    check (subscription_status in ('unknown','supported','not_supported','not_subscribed','subscribed','action_required')),
  subscription_checked_at timestamptz,
  last_subscription_error_kind text,
  last_messages_webhook_at timestamptz,
  last_echo_webhook_at timestamptz,
  last_echo_persisted_at timestamptz,
  last_ingest_error_kind text,
  last_ingest_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_coexistence_observability_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores(organization_id, id)
    on delete cascade
);

alter table public.whatsapp_coexistence_observability enable row level security;

revoke all on table public.whatsapp_coexistence_observability from public;
revoke all on table public.whatsapp_coexistence_observability from anon;
revoke all on table public.whatsapp_coexistence_observability from authenticated;
grant select, insert, update, delete on table public.whatsapp_coexistence_observability to service_role;

comment on table public.whatsapp_coexistence_observability is
  'WPP-08 server-side health markers for Meta WhatsApp Coexistence; no conversation content or credentials.';
