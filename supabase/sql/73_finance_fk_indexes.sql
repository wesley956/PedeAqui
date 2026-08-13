-- PedeAqui — Milestone 21 performance hardening
-- Índices apenas para FKs introduzidas pelo domínio Financeiro e sinalizadas/relevantes ao Advisor.

create index financial_accounts_created_by_idx on public.financial_accounts(created_by) where created_by is not null;
create index financial_accounts_updated_by_idx on public.financial_accounts(updated_by) where updated_by is not null;
create index financial_categories_parent_idx on public.financial_categories(organization_id,parent_id) where parent_id is not null;
create index financial_categories_created_by_idx on public.financial_categories(created_by) where created_by is not null;
create index financial_categories_updated_by_idx on public.financial_categories(updated_by) where updated_by is not null;
create index financial_obligations_created_by_idx on public.financial_obligations(created_by) where created_by is not null;
create index financial_transactions_category_idx on public.financial_transactions(organization_id,category_id) where category_id is not null;
create index financial_transactions_created_by_idx on public.financial_transactions(created_by) where created_by is not null;
