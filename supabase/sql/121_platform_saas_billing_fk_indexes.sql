-- PedeAqui — PA-DIAG-121/129/136
-- Índices de cobertura para todas as FKs novas sinalizadas pelo Performance Advisor.

create index plan_versions_created_by_idx on public.plan_versions(created_by);
create index platform_financial_audit_actor_idx on public.platform_financial_audit(actor_user_id) where actor_user_id is not null;
create index subscription_billing_adjustments_created_by_idx on public.subscription_billing_adjustments(created_by);
create index subscription_billing_notifications_subscription_idx on public.subscription_billing_notifications(subscription_id,created_at desc);
create index subscription_invoices_created_by_idx on public.subscription_invoices(created_by);
create index subscription_payments_created_by_idx on public.subscription_payments(created_by);
