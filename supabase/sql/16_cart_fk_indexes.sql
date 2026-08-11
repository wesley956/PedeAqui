-- High-volume cart tables justify covering FK indexes from day one.

create index if not exists carts_org_store_fk_idx
  on public.carts (organization_id, store_id);
create index if not exists carts_org_customer_fk_idx
  on public.carts (organization_id, customer_id)
  where customer_id is not null;

create index if not exists cart_items_org_store_cart_fk_idx
  on public.cart_items (organization_id, store_id, cart_id);
create index if not exists cart_items_org_store_product_fk_idx
  on public.cart_items (organization_id, store_id, product_id);

create index if not exists cart_item_modifiers_org_store_item_fk_idx
  on public.cart_item_modifiers (organization_id, store_id, cart_item_id);
create index if not exists cart_item_modifiers_org_store_group_fk_idx
  on public.cart_item_modifiers (organization_id, store_id, modifier_group_id);
create index if not exists cart_item_modifiers_org_store_modifier_fk_idx
  on public.cart_item_modifiers (organization_id, store_id, modifier_id);
