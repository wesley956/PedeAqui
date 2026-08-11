-- PedeAqui — bloco [140]–[151]
-- Crescimento/CRM: permissões, configurações, cupons e ledgers de cashback/pontos.

insert into public.permissions (key, description) values
  ('growth.view', 'Visualizar CRM, benefícios, segmentos e campanhas'),
  ('growth.manage', 'Gerenciar cupons, cashback, pontos e regras de crescimento'),
  ('growth.campaigns', 'Gerenciar campanhas e automações de marketing')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('growth.view', 'growth.manage', 'growth.campaigns')
where r.key in ('owner', 'manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'growth.view'
where r.key = 'attendant'
on conflict do nothing;

create or replace function private.grant_growth_permissions_for_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.key in ('owner', 'manager') then
    insert into public.role_permissions (role_id, permission_id)
    select new.id, p.id
    from public.permissions p
    where p.key in ('growth.view', 'growth.manage', 'growth.campaigns')
    on conflict do nothing;
  elsif new.key = 'attendant' then
    insert into public.role_permissions (role_id, permission_id)
    select new.id, p.id
    from public.permissions p
    where p.key = 'growth.view'
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.grant_growth_permissions_for_role() from public, anon, authenticated;
drop trigger if exists roles_grant_growth_permissions on public.roles;
create trigger roles_grant_growth_permissions
after insert on public.roles
for each row execute function private.grant_growth_permissions_for_role();

create table if not exists public.store_growth_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid primary key,
  cashback_enabled boolean not null default false,
  cashback_rate_bps integer not null default 0 check (cashback_rate_bps between 0 and 10000),
  cashback_min_order_cents bigint not null default 0 check (cashback_min_order_cents >= 0),
  cashback_expiry_days integer check (cashback_expiry_days is null or cashback_expiry_days between 1 and 3650),
  loyalty_enabled boolean not null default false,
  loyalty_spend_cents_per_point integer not null default 100 check (loyalty_spend_cents_per_point > 0),
  loyalty_redeem_cents_per_point integer not null default 1 check (loyalty_redeem_cents_per_point > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint store_growth_settings_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  code text not null check (char_length(trim(code)) between 2 and 40),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text,
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  fixed_discount_cents bigint check (fixed_discount_cents is null or fixed_discount_cents > 0),
  percentage_bps integer check (percentage_bps is null or percentage_bps between 1 and 10000),
  max_discount_cents bigint check (max_discount_cents is null or max_discount_cents > 0),
  minimum_order_cents bigint not null default 0 check (minimum_order_cents >= 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  usage_limit_total integer check (usage_limit_total is null or usage_limit_total > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer is null or usage_limit_per_customer > 0),
  allowed_channels text[] not null default array['digital_menu','pdv','counter','waiter','table_qr','manual']::text[],
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint coupons_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint coupons_discount_shape check (
    (discount_type = 'fixed' and fixed_discount_cents is not null and percentage_bps is null)
    or
    (discount_type = 'percentage' and percentage_bps is not null and fixed_discount_cents is null)
  ),
  constraint coupons_valid_window check (valid_until is null or valid_until > valid_from),
  constraint coupons_org_store_id_unique unique (organization_id, store_id, id)
);

create unique index if not exists coupons_store_code_unique
  on public.coupons (store_id, lower(code))
  where deleted_at is null;
create index if not exists coupons_store_active_window_idx
  on public.coupons (organization_id, store_id, active, valid_from, valid_until)
  where deleted_at is null;

create table if not exists public.cashback_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  customer_id uuid not null,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  lifetime_earned_cents bigint not null default 0 check (lifetime_earned_cents >= 0),
  lifetime_redeemed_cents bigint not null default 0 check (lifetime_redeemed_cents >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashback_accounts_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint cashback_accounts_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete cascade,
  constraint cashback_accounts_org_store_id_unique unique (organization_id, store_id, id),
  constraint cashback_accounts_store_customer_unique unique (store_id, customer_id)
);

create index if not exists cashback_accounts_customer_lookup_idx
  on public.cashback_accounts (organization_id, customer_id, store_id);

create table if not exists public.cashback_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  account_id uuid not null,
  customer_id uuid not null,
  order_id uuid references public.orders(id) on delete set null,
  transaction_type text not null check (transaction_type in ('earn', 'redeem', 'expire', 'adjustment', 'reversal')),
  amount_cents bigint not null check (amount_cents <> 0),
  balance_after_cents bigint not null check (balance_after_cents >= 0),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 180),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cashback_transactions_account_same_store_fk
    foreign key (organization_id, store_id, account_id)
    references public.cashback_accounts (organization_id, store_id, id) on delete restrict,
  constraint cashback_transactions_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint cashback_transactions_sign_check check (
    (transaction_type = 'earn' and amount_cents > 0)
    or (transaction_type in ('redeem', 'expire') and amount_cents < 0)
    or transaction_type in ('adjustment', 'reversal')
  ),
  constraint cashback_transactions_org_idem_unique unique (organization_id, idempotency_key)
);

create index if not exists cashback_transactions_account_created_idx
  on public.cashback_transactions (organization_id, store_id, account_id, created_at desc);
create index if not exists cashback_transactions_order_idx
  on public.cashback_transactions (order_id)
  where order_id is not null;

create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  customer_id uuid not null,
  balance_points bigint not null default 0 check (balance_points >= 0),
  lifetime_earned_points bigint not null default 0 check (lifetime_earned_points >= 0),
  lifetime_redeemed_points bigint not null default 0 check (lifetime_redeemed_points >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_accounts_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint loyalty_accounts_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete cascade,
  constraint loyalty_accounts_org_store_id_unique unique (organization_id, store_id, id),
  constraint loyalty_accounts_store_customer_unique unique (store_id, customer_id)
);

create index if not exists loyalty_accounts_customer_lookup_idx
  on public.loyalty_accounts (organization_id, customer_id, store_id);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  account_id uuid not null,
  customer_id uuid not null,
  order_id uuid references public.orders(id) on delete set null,
  transaction_type text not null check (transaction_type in ('earn', 'redeem', 'expire', 'adjustment', 'reversal')),
  points bigint not null check (points <> 0),
  balance_after_points bigint not null check (balance_after_points >= 0),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 180),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint loyalty_transactions_account_same_store_fk
    foreign key (organization_id, store_id, account_id)
    references public.loyalty_accounts (organization_id, store_id, id) on delete restrict,
  constraint loyalty_transactions_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint loyalty_transactions_sign_check check (
    (transaction_type = 'earn' and points > 0)
    or (transaction_type in ('redeem', 'expire') and points < 0)
    or transaction_type in ('adjustment', 'reversal')
  ),
  constraint loyalty_transactions_org_idem_unique unique (organization_id, idempotency_key)
);

create index if not exists loyalty_transactions_account_created_idx
  on public.loyalty_transactions (organization_id, store_id, account_id, created_at desc);
create index if not exists loyalty_transactions_order_idx
  on public.loyalty_transactions (order_id)
  where order_id is not null;

alter table public.store_growth_settings enable row level security;
alter table public.coupons enable row level security;
alter table public.cashback_accounts enable row level security;
alter table public.cashback_transactions enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;

revoke all on table
  public.store_growth_settings,
  public.coupons,
  public.cashback_accounts,
  public.cashback_transactions,
  public.loyalty_accounts,
  public.loyalty_transactions
from anon, authenticated;

grant select on table
  public.store_growth_settings,
  public.coupons,
  public.cashback_accounts,
  public.cashback_transactions,
  public.loyalty_accounts,
  public.loyalty_transactions
to authenticated;

grant select, insert, update on table public.store_growth_settings, public.coupons to service_role;
grant select, insert, update on table public.cashback_accounts, public.loyalty_accounts to service_role;
grant select, insert on table public.cashback_transactions, public.loyalty_transactions to service_role;

create policy store_growth_settings_view on public.store_growth_settings
for select to authenticated
using (private.has_permission(organization_id, store_id, 'growth.view'));

create policy coupons_view on public.coupons
for select to authenticated
using (deleted_at is null and private.has_permission(organization_id, store_id, 'growth.view'));

create policy cashback_accounts_view on public.cashback_accounts
for select to authenticated
using (private.has_permission(organization_id, store_id, 'growth.view'));

create policy cashback_transactions_view on public.cashback_transactions
for select to authenticated
using (private.has_permission(organization_id, store_id, 'growth.view'));

create policy loyalty_accounts_view on public.loyalty_accounts
for select to authenticated
using (private.has_permission(organization_id, store_id, 'growth.view'));

create policy loyalty_transactions_view on public.loyalty_transactions
for select to authenticated
using (private.has_permission(organization_id, store_id, 'growth.view'));
