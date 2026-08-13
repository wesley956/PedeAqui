-- PedeAqui — Milestone 20 performance hardening
-- Índices apenas para FKs introduzidas por Compras/Fornecedores sinalizadas pelo Advisor.

create index purchase_order_history_actor_idx on public.purchase_order_history(actor_user_id) where actor_user_id is not null;
create index purchase_order_history_order_idx on public.purchase_order_history(organization_id,store_id,purchase_order_id);
create index purchase_order_items_inventory_idx on public.purchase_order_items(organization_id,store_id,inventory_item_id);
create index purchase_order_items_order_idx on public.purchase_order_items(organization_id,store_id,purchase_order_id);
create index purchase_orders_created_by_idx on public.purchase_orders(created_by) where created_by is not null;
create index purchase_orders_supplier_idx on public.purchase_orders(organization_id,store_id,supplier_id);
create index purchase_orders_updated_by_idx on public.purchase_orders(updated_by) where updated_by is not null;
create index purchase_receipt_items_movement_idx on public.purchase_receipt_items(inventory_movement_id) where inventory_movement_id is not null;
create index purchase_receipt_items_order_item_idx on public.purchase_receipt_items(organization_id,store_id,purchase_order_item_id);
create index purchase_receipt_items_receipt_idx on public.purchase_receipt_items(organization_id,store_id,receipt_id);
create index purchase_receipts_corrects_idx on public.purchase_receipts(corrects_receipt_id) where corrects_receipt_id is not null;
create index purchase_receipts_created_by_idx on public.purchase_receipts(created_by) where created_by is not null;
create index purchase_receipts_order_idx on public.purchase_receipts(organization_id,store_id,purchase_order_id);
create index supplier_inventory_created_by_idx on public.supplier_inventory_items(created_by) where created_by is not null;
create index supplier_inventory_updated_by_idx on public.supplier_inventory_items(updated_by) where updated_by is not null;
create index supplier_stores_created_by_idx on public.supplier_stores(created_by) where created_by is not null;
create index supplier_stores_supplier_idx on public.supplier_stores(organization_id,supplier_id);
create index supplier_stores_updated_by_idx on public.supplier_stores(updated_by) where updated_by is not null;
create index suppliers_created_by_idx on public.suppliers(created_by) where created_by is not null;
create index suppliers_updated_by_idx on public.suppliers(updated_by) where updated_by is not null;
