-- PedeAqui — Milestone 23 [253]
-- Cobertura final indicada pelo Performance Advisor.

create index if not exists subscription_history_subscription_idx on public.subscription_history(subscription_id,created_at desc);
create index if not exists franchise_group_stores_org_group_idx on public.franchise_group_stores(organization_id,group_id,store_id);
