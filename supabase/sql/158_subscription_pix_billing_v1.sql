-- PedeAqui — cobrança SaaS via PIX v1
-- Esta tabela é exclusiva da mensalidade do PedeAqui.
-- Não reutiliza credenciais PIX/MP dos restaurantes e não altera pagamentos de pedidos.

create table if not exists public.subscription_pix_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  invoice_id uuid not null references public.subscription_invoices(id) on delete restrict,
  provider_key text not null default 'mercado_pago' check(provider_key in ('mercado_pago')),
  provider_order_id text,
  provider_payment_id text,
  external_reference text not null,
  idempotency_key text not null,
  amount_cents integer not null check(amount_cents between 1 and 100000000),
  currency text not null default 'BRL' check(currency='BRL'),
  status text not null default 'pending' check(status in ('pending','paid','expired','cancelled','failed')),
  status_detail text,
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_pix_charges_external_reference_unique unique(external_reference),
  constraint subscription_pix_charges_org_idempotency_unique unique(organization_id,idempotency_key),
  constraint subscription_pix_charges_paid_check check((status='paid' and paid_at is not null) or status<>'paid')
);

create index if not exists subscription_pix_charges_invoice_idx on public.subscription_pix_charges(invoice_id,created_at desc);
create index if not exists subscription_pix_charges_subscription_idx on public.subscription_pix_charges(subscription_id,status,created_at desc);
create unique index if not exists subscription_pix_charges_provider_order_unique on public.subscription_pix_charges(provider_key,provider_order_id) where provider_order_id is not null;
create unique index if not exists subscription_pix_charges_provider_payment_unique on public.subscription_pix_charges(provider_key,provider_payment_id) where provider_payment_id is not null;

alter table public.subscription_pix_charges enable row level security;
revoke all on table public.subscription_pix_charges from public,anon,authenticated;
grant select,insert,update on table public.subscription_pix_charges to service_role;

-- O cliente nunca recebe acesso SQL direto a este ledger. A leitura passa pelo servidor,
-- que valida organization_id + subscription.view antes de devolver apenas os campos exibíveis.
comment on table public.subscription_pix_charges is 'Ledger server-side das cobranças PIX da assinatura SaaS PedeAqui; isolado dos pagamentos dos pedidos dos restaurantes.';
