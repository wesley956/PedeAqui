-- PedeAqui — [324]
-- Reconhecimento seguro de cliente recorrente e persistência transacional de endereço.

create or replace function private.customer_address_fingerprint(
  p_postal_code text,
  p_street text,
  p_number text,
  p_complement text,
  p_district text,
  p_city text,
  p_state text
) returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws('|',
    regexp_replace(lower(trim(coalesce(p_postal_code, ''))), '[^0-9]', '', 'g'),
    lower(trim(coalesce(p_street, ''))),
    lower(trim(coalesce(p_number, ''))),
    lower(trim(coalesce(p_complement, ''))),
    lower(trim(coalesce(p_district, ''))),
    lower(trim(coalesce(p_city, ''))),
    upper(trim(coalesce(p_state, '')))
  ));
$$;

revoke all on function private.customer_address_fingerprint(text,text,text,text,text,text,text) from public;
grant execute on function private.customer_address_fingerprint(text,text,text,text,text,text,text) to service_role;

alter table public.customer_addresses
  add column if not exists address_fingerprint text;

update public.customer_addresses
set address_fingerprint = private.customer_address_fingerprint(
  postal_code, street, number, complement, district, city, state
)
where address_fingerprint is null;

alter table public.customer_addresses
  alter column address_fingerprint set not null;

create or replace function private.set_customer_address_fingerprint()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.address_fingerprint := private.customer_address_fingerprint(
    new.postal_code, new.street, new.number, new.complement,
    new.district, new.city, new.state
  );
  return new;
end;
$$;

revoke all on function private.set_customer_address_fingerprint() from public;
grant execute on function private.set_customer_address_fingerprint() to service_role;

drop trigger if exists customer_addresses_fingerprint on public.customer_addresses;
create trigger customer_addresses_fingerprint
before insert or update of postal_code, street, number, complement, district, city, state
on public.customer_addresses
for each row execute function private.set_customer_address_fingerprint();

create unique index if not exists customer_addresses_customer_fingerprint_unique
  on public.customer_addresses (organization_id, customer_id, address_fingerprint)
  where deleted_at is null;

create table if not exists public.customer_recognition_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  customer_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_recognition_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint customer_recognition_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete cascade,
  constraint customer_recognition_expiry_check check (expires_at > created_at)
);

create index if not exists customer_recognition_lookup_idx
  on public.customer_recognition_tokens (organization_id, store_id, token_hash)
  where revoked_at is null;
create index if not exists customer_recognition_customer_idx
  on public.customer_recognition_tokens (organization_id, store_id, customer_id, expires_at desc)
  where revoked_at is null;

alter table public.customer_recognition_tokens enable row level security;
revoke all on table public.customer_recognition_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_recognition_tokens to service_role;

-- Persist the delivery snapshot only after an order is created successfully.
-- This never makes checkout/browser data authoritative: the order snapshot already passed
-- DeliveryQuoteService + final checkout revalidation before this trigger runs.
create or replace function private.persist_order_customer_address()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_first boolean;
begin
  if new.fulfillment_type <> 'delivery'
     or new.customer_id is null
     or new.address_postal_code_snapshot is null
     or new.address_street_snapshot is null
     or new.address_number_snapshot is null
     or new.address_district_snapshot is null
     or new.address_city_snapshot is null
     or new.address_state_snapshot is null then
    return new;
  end if;

  select not exists (
    select 1
    from public.customer_addresses a
    where a.organization_id = new.organization_id
      and a.customer_id = new.customer_id
      and a.deleted_at is null
  ) into v_is_first;

  insert into public.customer_addresses (
    organization_id, customer_id, label, recipient_name, phone,
    postal_code, street, number, complement, district, city, state, reference,
    is_default, created_by, updated_by, created_at, updated_at
  ) values (
    new.organization_id, new.customer_id, 'Principal', new.customer_name_snapshot, new.customer_phone_snapshot,
    new.address_postal_code_snapshot, new.address_street_snapshot, new.address_number_snapshot,
    new.address_complement_snapshot, new.address_district_snapshot, new.address_city_snapshot,
    new.address_state_snapshot, new.address_reference_snapshot,
    v_is_first, null, null, now(), now()
  )
  on conflict (organization_id, customer_id, address_fingerprint)
    where deleted_at is null
  do update set
    recipient_name = excluded.recipient_name,
    phone = excluded.phone,
    reference = excluded.reference,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.persist_order_customer_address() from public;
grant execute on function private.persist_order_customer_address() to service_role;

drop trigger if exists orders_persist_customer_address on public.orders;
create trigger orders_persist_customer_address
after insert on public.orders
for each row execute function private.persist_order_customer_address();
