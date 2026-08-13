-- PedeAqui — Milestone 19 performance
-- Cobertura das FKs introduzidas por Estoque/Fichas Técnicas.

create index if not exists inventory_items_created_by_idx on public.inventory_items(created_by) where created_by is not null;
create index if not exists inventory_items_updated_by_idx on public.inventory_items(updated_by) where updated_by is not null;

create index if not exists inventory_item_stores_item_fk_idx on public.inventory_item_stores(organization_id,inventory_item_id);
create index if not exists inventory_item_stores_created_by_idx on public.inventory_item_stores(created_by) where created_by is not null;
create index if not exists inventory_item_stores_updated_by_idx on public.inventory_item_stores(updated_by) where updated_by is not null;

create index if not exists inventory_movements_created_by_idx on public.inventory_movements(created_by) where created_by is not null;

create index if not exists recipes_store_fk_idx on public.recipes(organization_id,store_id);
create index if not exists recipes_created_by_idx on public.recipes(created_by) where created_by is not null;

create index if not exists recipe_items_inventory_fk_idx on public.recipe_items(organization_id,store_id,inventory_item_id);
