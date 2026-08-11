-- Cover foreign keys introduced by [033]–[035] where row counts can grow.

create index if not exists customer_addresses_created_by_idx
  on public.customer_addresses (created_by)
  where created_by is not null;
create index if not exists customer_addresses_updated_by_idx
  on public.customer_addresses (updated_by)
  where updated_by is not null;

create index if not exists store_delivery_settings_org_store_idx
  on public.store_delivery_settings (organization_id, store_id);

create index if not exists delivery_neighborhoods_org_store_idx
  on public.delivery_neighborhoods (organization_id, store_id)
  where deleted_at is null;
create index if not exists delivery_neighborhoods_created_by_idx
  on public.delivery_neighborhoods (created_by)
  where created_by is not null;
create index if not exists delivery_neighborhoods_updated_by_idx
  on public.delivery_neighborhoods (updated_by)
  where updated_by is not null;
