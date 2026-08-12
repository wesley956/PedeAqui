-- PedeAqui — Milestone 17 performance
-- Índices de cobertura das FKs introduzidas pelo domínio de Caixa.

create index if not exists cash_registers_created_by_idx on public.cash_registers (created_by);
create index if not exists cash_registers_updated_by_idx on public.cash_registers (updated_by);

create index if not exists cash_sessions_register_fk_idx on public.cash_sessions (organization_id, store_id, cash_register_id);
create index if not exists cash_sessions_opened_by_idx on public.cash_sessions (opened_by);
create index if not exists cash_sessions_closed_by_idx on public.cash_sessions (closed_by);

create index if not exists cash_movements_order_fk_idx on public.cash_movements (organization_id, store_id, order_id);
create index if not exists cash_movements_reference_fk_idx on public.cash_movements (organization_id, store_id, reference_movement_id);
create index if not exists cash_movements_created_by_idx on public.cash_movements (created_by);
