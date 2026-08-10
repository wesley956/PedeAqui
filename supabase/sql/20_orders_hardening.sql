-- PedeAqui — hardening do motor de pedidos.
-- Defesa em profundidade para a sequência e índices de FKs do novo módulo.

create policy order_sequences_deny_direct
on public.order_sequences as restrictive
for all to anon, authenticated
using (false) with check (false);

create index if not exists order_sequences_org_store_fk_idx
  on public.order_sequences (organization_id, store_id);

create index if not exists orders_org_store_cart_fk_idx
  on public.orders (organization_id, store_id, source_cart_id);
create index if not exists orders_org_store_checkout_fk_idx
  on public.orders (organization_id, store_id, checkout_session_id);
create index if not exists orders_canceled_by_idx
  on public.orders (canceled_by) where canceled_by is not null;
create index if not exists orders_created_by_idx
  on public.orders (created_by) where created_by is not null;

create index if not exists order_items_org_store_product_fk_idx
  on public.order_items (organization_id, store_id, product_id) where product_id is not null;

create index if not exists order_item_modifiers_org_store_group_fk_idx
  on public.order_item_modifiers (organization_id, store_id, modifier_group_id) where modifier_group_id is not null;
create index if not exists order_item_modifiers_org_store_modifier_fk_idx
  on public.order_item_modifiers (organization_id, store_id, modifier_id) where modifier_id is not null;

create index if not exists order_state_history_actor_idx
  on public.order_state_history (actor_user_id) where actor_user_id is not null;
