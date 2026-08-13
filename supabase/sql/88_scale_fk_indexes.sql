-- PedeAqui — Milestone 23 [253]
-- Índices de cobertura para FKs introduzidas pelo módulo de escala.

create index if not exists organization_subscriptions_org_idx on public.organization_subscriptions(organization_id,created_at desc);
create index if not exists franchise_groups_created_by_idx on public.franchise_groups(created_by) where created_by is not null;
create index if not exists franchise_groups_updated_by_idx on public.franchise_groups(updated_by) where updated_by is not null;
create index if not exists franchise_group_stores_created_by_idx on public.franchise_group_stores(created_by) where created_by is not null;
