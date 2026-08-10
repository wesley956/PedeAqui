-- Preserve the cart tenant if a customer is ever hard-deleted.
-- PostgreSQL 17 supports a SET NULL column list, so only customer_id is nulled.

alter table public.carts
  drop constraint if exists carts_customer_id_fkey,
  drop constraint if exists carts_customer_same_org_fk;

alter table public.carts
  add constraint carts_customer_same_org_fk
  foreign key (organization_id, customer_id)
  references public.customers (organization_id, id)
  on delete set null (customer_id);
