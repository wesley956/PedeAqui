-- PedeAqui — PA-PUBLIC-UX-003 / #752
-- Índices de cobertura para as FKs introduzidas pela configuração de complementos.

create index if not exists store_complement_categories_org_store_idx
  on public.store_complement_categories(organization_id, store_id, sort_order);

create index if not exists store_complement_categories_category_idx
  on public.store_complement_categories(category_id);

create index if not exists store_complement_categories_created_by_idx
  on public.store_complement_categories(created_by)
  where created_by is not null;
