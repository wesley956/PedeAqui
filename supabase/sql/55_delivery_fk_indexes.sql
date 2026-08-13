-- PedeAqui — Milestone 18 performance
-- Índices somente para FKs introduzidas por Entregas que o Advisor sinalizou.

create index if not exists drivers_user_id_idx on public.drivers(user_id) where user_id is not null;
create index if not exists drivers_created_by_idx on public.drivers(created_by) where created_by is not null;
create index if not exists drivers_updated_by_idx on public.drivers(updated_by) where updated_by is not null;

create index if not exists delivery_history_order_fk_idx on public.delivery_history(organization_id,store_id,order_id);
create index if not exists delivery_history_from_driver_fk_idx on public.delivery_history(organization_id,store_id,from_driver_id) where from_driver_id is not null;
create index if not exists delivery_history_to_driver_fk_idx on public.delivery_history(organization_id,store_id,to_driver_id) where to_driver_id is not null;
create index if not exists delivery_history_actor_user_idx on public.delivery_history(actor_user_id) where actor_user_id is not null;
