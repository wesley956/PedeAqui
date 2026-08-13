-- PedeAqui — Milestone 21 [211]–[224]
-- Financeiro/DRE: obrigações como projeção; financial_transactions é ledger imutável.

insert into public.permissions(key,description) values
  ('finance.view','Visualizar financeiro, contas e obrigações'),
  ('finance.manage','Gerenciar contas, categorias e lançamentos financeiros'),
  ('finance.settle','Liquidar recebíveis/pagáveis e transferir entre contas'),
  ('finance.reports','Visualizar DRE, fluxo de caixa e relatórios financeiros')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in ('finance.view','finance.manage','finance.settle','finance.reports')
where r.key in ('owner','manager','financial') on conflict do nothing;

create or replace function private.grant_finance_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='financial' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('finance.view','finance.manage','finance.settle','finance.reports')
    on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_finance_permissions_for_role() from public,anon,authenticated;
drop trigger if exists roles_grant_finance_permissions on public.roles;
create trigger roles_grant_finance_permissions after insert on public.roles
for each row execute function private.grant_finance_permissions_for_role();

alter table public.supplier_stores add column if not exists payment_term_days integer not null default 0
  check (payment_term_days between 0 and 3650);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 120),
  account_type text not null check (account_type in ('cash','bank','clearing','wallet','other')),
  system_key text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint financial_accounts_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint financial_accounts_org_id_unique unique (organization_id,id),
  constraint financial_accounts_scope_check check (system_key is null or store_id is not null)
);
create unique index financial_accounts_system_unique_idx on public.financial_accounts(organization_id,store_id,system_key)
where system_key is not null and deleted_at is null;
create index financial_accounts_scope_name_idx on public.financial_accounts(organization_id,store_id,name) where deleted_at is null;

create table public.financial_account_balances (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null,
  balance_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id,account_id),
  constraint financial_account_balances_account_fk foreign key (organization_id,account_id)
    references public.financial_accounts(organization_id,id) on delete cascade
);

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 120),
  nature text not null check (nature in ('revenue','expense')),
  dre_group text not null check (dre_group in ('gross_revenue','deductions','delivery_revenue','cogs','operating_expense','other_revenue','other_expense')),
  system_key text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint financial_categories_org_id_unique unique (organization_id,id),
  constraint financial_categories_parent_fk foreign key (organization_id,parent_id)
    references public.financial_categories(organization_id,id) on delete restrict,
  constraint financial_categories_nature_group_check check (
    (nature='revenue' and dre_group in ('gross_revenue','deductions','delivery_revenue','other_revenue'))
    or (nature='expense' and dre_group in ('cogs','operating_expense','other_expense'))
  )
);
create unique index financial_categories_system_unique_idx on public.financial_categories(organization_id,system_key)
where system_key is not null and deleted_at is null;
create index financial_categories_org_name_idx on public.financial_categories(organization_id,name) where deleted_at is null;

create table public.financial_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  direction text not null check (direction in ('in','out')),
  obligation_type text not null check (obligation_type in ('receivable','payable')),
  source_type text,
  source_id uuid,
  counterparty_type text check (counterparty_type is null or counterparty_type in ('customer','supplier','manual','platform')),
  counterparty_id uuid,
  description text not null check (char_length(trim(description)) between 2 and 300),
  competence_date date not null,
  due_date date not null,
  principal_cents bigint not null default 0 check (principal_cents>=0),
  settled_cents bigint not null default 0 check (settled_cents>=0),
  open_cents bigint not null default 0 check (open_cents>=0),
  status text not null default 'open' check (status in ('open','partially_settled','settled','cancelled')),
  cancelled_at timestamptz,
  cancelled_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_obligations_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint financial_obligations_org_id_unique unique (organization_id,id),
  constraint financial_obligations_direction_type_check check (
    (direction='in' and obligation_type='receivable') or (direction='out' and obligation_type='payable')
  ),
  constraint financial_obligations_amount_math check (open_cents=greatest(principal_cents-settled_cents,0))
);
create unique index financial_obligations_source_unique_idx on public.financial_obligations(organization_id,source_type,source_id,direction)
where source_type is not null and source_id is not null and status<>'cancelled';
create index financial_obligations_store_due_idx on public.financial_obligations(organization_id,store_id,status,due_date);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  obligation_id uuid,
  account_id uuid,
  category_id uuid,
  transaction_type text not null check (transaction_type in ('recognition','obligation_adjustment','settlement','settlement_reversal','transfer','manual_adjustment')),
  direction text not null check (direction in ('in','out')),
  effect_sign smallint not null default 1 check (effect_sign in (-1,1)),
  amount_cents bigint not null check (amount_cents>0),
  competence_date date,
  source_type text,
  source_id uuid,
  transfer_group_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 240),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint financial_transactions_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint financial_transactions_obligation_fk foreign key (organization_id,obligation_id)
    references public.financial_obligations(organization_id,id) on delete restrict,
  constraint financial_transactions_account_fk foreign key (organization_id,account_id)
    references public.financial_accounts(organization_id,id) on delete restrict,
  constraint financial_transactions_category_fk foreign key (organization_id,category_id)
    references public.financial_categories(organization_id,id) on delete restrict,
  constraint financial_transactions_org_idem_unique unique (organization_id,idempotency_key),
  constraint financial_transactions_shape_check check (
    (transaction_type in ('settlement','settlement_reversal') and obligation_id is not null and account_id is not null)
    or (transaction_type='transfer' and obligation_id is null and account_id is not null and category_id is null and transfer_group_id is not null)
    or (transaction_type in ('recognition','obligation_adjustment') and account_id is null)
    or (transaction_type='manual_adjustment' and account_id is not null and obligation_id is null)
  )
);
create index financial_transactions_obligation_idx on public.financial_transactions(organization_id,obligation_id,occurred_at,id) where obligation_id is not null;
create index financial_transactions_account_idx on public.financial_transactions(organization_id,account_id,occurred_at,id) where account_id is not null;
create index financial_transactions_dre_idx on public.financial_transactions(organization_id,store_id,competence_date,category_id) where category_id is not null;
create index financial_transactions_source_idx on public.financial_transactions(organization_id,source_type,source_id) where source_type is not null and source_id is not null;
create index financial_transactions_transfer_idx on public.financial_transactions(organization_id,transfer_group_id) where transfer_group_id is not null;

alter table public.financial_accounts enable row level security;
alter table public.financial_account_balances enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_obligations enable row level security;
alter table public.financial_transactions enable row level security;

revoke all on table public.financial_accounts,public.financial_account_balances,public.financial_categories,public.financial_obligations,public.financial_transactions from anon,authenticated;
grant select,insert,update,delete on table public.financial_accounts,public.financial_account_balances,public.financial_categories,public.financial_obligations,public.financial_transactions to service_role;

create or replace function private.prevent_financial_transaction_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'financial transaction ledger is immutable'; end; $$;
revoke all on function private.prevent_financial_transaction_mutation() from public,anon,authenticated;
create trigger financial_transactions_immutable before update or delete on public.financial_transactions
for each row execute function private.prevent_financial_transaction_mutation();

create or replace function private.seed_financial_categories(p_organization_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.financial_categories(organization_id,name,nature,dre_group,system_key) values
    (p_organization_id,'Vendas','revenue','gross_revenue','sales_revenue'),
    (p_organization_id,'Descontos de vendas','revenue','deductions','sales_discounts'),
    (p_organization_id,'Taxa de entrega','revenue','delivery_revenue','delivery_revenue'),
    (p_organization_id,'Custo dos produtos vendidos','expense','cogs','cogs'),
    (p_organization_id,'Outras receitas','revenue','other_revenue','other_revenue'),
    (p_organization_id,'Despesas operacionais','expense','operating_expense','operating_expense'),
    (p_organization_id,'Outras despesas','expense','other_expense','other_expense')
  on conflict (organization_id,system_key) where system_key is not null and deleted_at is null do nothing;
end; $$;
revoke all on function private.seed_financial_categories(uuid) from public,anon,authenticated;
grant execute on function private.seed_financial_categories(uuid) to service_role;

create or replace function private.seed_store_financial_accounts(p_organization_id uuid,p_store_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.financial_accounts(organization_id,store_id,name,account_type,system_key) values
    (p_organization_id,p_store_id,'Caixa físico','cash','cash_on_hand'),
    (p_organization_id,p_store_id,'Pix a liquidar','clearing','pix_clearing'),
    (p_organization_id,p_store_id,'Cartões a liquidar','clearing','card_clearing')
  on conflict (organization_id,store_id,system_key) where system_key is not null and deleted_at is null do nothing;

  insert into public.financial_account_balances(organization_id,account_id,balance_cents)
  select a.organization_id,a.id,0 from public.financial_accounts a
  where a.organization_id=p_organization_id and a.store_id=p_store_id and a.system_key in ('cash_on_hand','pix_clearing','card_clearing')
  on conflict (organization_id,account_id) do nothing;
end; $$;
revoke all on function private.seed_store_financial_accounts(uuid,uuid) from public,anon,authenticated;
grant execute on function private.seed_store_financial_accounts(uuid,uuid) to service_role;

select private.seed_financial_categories(id) from public.organizations;
select private.seed_store_financial_accounts(organization_id,id) from public.stores where status='active';

create or replace function private.on_organization_seed_finance()
returns trigger language plpgsql security invoker set search_path='' as $$ begin perform private.seed_financial_categories(new.id); return new; end; $$;
revoke all on function private.on_organization_seed_finance() from public,anon,authenticated;
drop trigger if exists organizations_seed_finance on public.organizations;
create trigger organizations_seed_finance after insert on public.organizations for each row execute function private.on_organization_seed_finance();

create or replace function private.on_store_seed_finance()
returns trigger language plpgsql security invoker set search_path='' as $$ begin if new.status='active' then perform private.seed_store_financial_accounts(new.organization_id,new.id); end if; return new; end; $$;
revoke all on function private.on_store_seed_finance() from public,anon,authenticated;
drop trigger if exists stores_seed_finance on public.stores;
create trigger stores_seed_finance after insert on public.stores for each row execute function private.on_store_seed_finance();
