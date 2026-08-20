-- PedeAqui — índices de integridade/performance do segmento gás [362]–[366]
-- Índices aditivos para cobrir FKs compostas e referências de auditoria sinalizadas pelo advisor.

create index if not exists cart_item_gas_options_org_store_item_fk_idx
  on public.cart_item_gas_options (organization_id, store_id, cart_item_id);
create index if not exists cart_item_gas_options_org_store_type_fk_idx
  on public.cart_item_gas_options (organization_id, store_id, container_type_id);

create index if not exists order_item_gas_options_org_store_item_fk_idx
  on public.order_item_gas_options (organization_id, store_id, order_item_id);
create index if not exists order_item_gas_options_org_store_type_fk_idx
  on public.order_item_gas_options (organization_id, store_id, container_type_id);

create index if not exists gas_container_movements_org_store_type_fk_idx
  on public.gas_container_movements (organization_id, store_id, container_type_id);
create index if not exists gas_container_movements_org_store_order_fk_idx
  on public.gas_container_movements (organization_id, store_id, order_id)
  where order_id is not null;
create index if not exists gas_container_movements_org_store_item_fk_idx
  on public.gas_container_movements (organization_id, store_id, order_item_id)
  where order_item_id is not null;
create index if not exists gas_container_movements_actor_idx
  on public.gas_container_movements (actor_user_id)
  where actor_user_id is not null;

create index if not exists gas_container_types_created_by_idx
  on public.gas_container_types (created_by)
  where created_by is not null;
create index if not exists gas_container_types_updated_by_idx
  on public.gas_container_types (updated_by)
  where updated_by is not null;

create index if not exists product_gas_profiles_org_store_product_fk_idx
  on public.product_gas_profiles (organization_id, store_id, product_id);
create index if not exists product_gas_profiles_org_store_type_fk_idx
  on public.product_gas_profiles (organization_id, store_id, container_type_id);
create index if not exists product_gas_profiles_created_by_idx
  on public.product_gas_profiles (created_by)
  where created_by is not null;
create index if not exists product_gas_profiles_updated_by_idx
  on public.product_gas_profiles (updated_by)
  where updated_by is not null;
