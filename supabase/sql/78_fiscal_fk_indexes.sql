-- PedeAqui — Milestone 22 [225]–[238]
-- Índices de cobertura para FKs introduzidas pelo domínio Fiscal/Integrações.

create index if not exists integrations_created_by_idx on public.integrations(created_by) where created_by is not null;
create index if not exists integrations_updated_by_idx on public.integrations(updated_by) where updated_by is not null;

create index if not exists fiscal_profiles_integration_fk_idx on public.fiscal_profiles(organization_id,store_id,integration_id) where integration_id is not null;
create index if not exists fiscal_profiles_created_by_idx on public.fiscal_profiles(created_by) where created_by is not null;
create index if not exists fiscal_profiles_updated_by_idx on public.fiscal_profiles(updated_by) where updated_by is not null;

create index if not exists product_fiscal_profiles_created_by_idx on public.product_fiscal_profiles(created_by) where created_by is not null;

create index if not exists fiscal_documents_integration_fk_idx on public.fiscal_documents(organization_id,store_id,integration_id) where integration_id is not null;
create index if not exists fiscal_documents_created_by_idx on public.fiscal_documents(created_by) where created_by is not null;
create index if not exists fiscal_documents_updated_by_idx on public.fiscal_documents(updated_by) where updated_by is not null;

create index if not exists fiscal_items_order_item_fk_idx on public.fiscal_items(organization_id,store_id,order_item_id) where order_item_id is not null;
create index if not exists fiscal_items_product_fk_idx on public.fiscal_items(organization_id,store_id,product_id) where product_id is not null;

create index if not exists fiscal_document_history_actor_idx on public.fiscal_document_history(actor_user_id) where actor_user_id is not null;

create index if not exists fiscal_jobs_integration_fk_idx on public.fiscal_jobs(organization_id,store_id,integration_id);
create index if not exists fiscal_jobs_created_by_idx on public.fiscal_jobs(created_by) where created_by is not null;

create index if not exists fiscal_webhook_receipts_integration_fk_idx on public.fiscal_webhook_receipts(organization_id,store_id,integration_id);
