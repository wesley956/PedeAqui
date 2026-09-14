-- Per-user read receipts for messages delivered inside the authenticated customer panel.
-- Delivery/read state stays server-only: customer sessions never receive direct table access.
create table if not exists public.platform_customer_message_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.platform_customer_messages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_customer_message_receipts_message_user_key unique (message_id, user_id)
);

create index if not exists platform_customer_message_receipts_org_user_idx
  on public.platform_customer_message_receipts (organization_id, user_id, read_at desc);

create index if not exists platform_customer_message_receipts_message_idx
  on public.platform_customer_message_receipts (message_id, read_at desc);

alter table public.platform_customer_message_receipts enable row level security;

revoke all on table public.platform_customer_message_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_customer_message_receipts to service_role;
