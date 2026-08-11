-- PedeAqui — bloco [041]–[046]
-- Checkout server-side associado 1:1 ao carrinho.

create table if not exists public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  cart_id uuid not null,
  customer_id uuid,
  customer_name text check (customer_name is null or char_length(trim(customer_name)) between 2 and 120),
  customer_phone text,
  customer_phone_normalized text,
  customer_email text,
  fulfillment_type text check (fulfillment_type is null or fulfillment_type in ('delivery','pickup')),
  address_postal_code text,
  address_street text,
  address_number text,
  address_complement text,
  address_district text,
  address_city text,
  address_state text check (address_state is null or address_state ~ '^[A-Z]{2}$'),
  address_reference text,
  delivery_quote_status text not null default 'not_required'
    check (delivery_quote_status in ('not_required','required','valid','unserviceable')),
  delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
  delivery_estimated_min_minutes integer check (delivery_estimated_min_minutes is null or delivery_estimated_min_minutes between 0 and 1440),
  delivery_estimated_max_minutes integer check (delivery_estimated_max_minutes is null or delivery_estimated_max_minutes between 0 and 1440),
  payment_method text check (payment_method is null or payment_method in ('cash','pix','credit_card','debit_card')),
  cash_change_for_cents bigint check (cash_change_for_cents is null or cash_change_for_cents >= 0),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_sessions_cart_same_store_fk
    foreign key (organization_id, store_id, cart_id)
    references public.carts (organization_id, store_id, id) on delete cascade,
  constraint checkout_sessions_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete set null (customer_id),
  constraint checkout_sessions_cart_unique unique (cart_id),
  constraint checkout_sessions_org_store_id_unique unique (organization_id, store_id, id),
  constraint checkout_delivery_address_consistency check (
    fulfillment_type <> 'delivery'
    or delivery_quote_status in ('required','valid','unserviceable')
  ),
  constraint checkout_pickup_no_fee check (
    fulfillment_type <> 'pickup'
    or (delivery_fee_cents = 0 and delivery_quote_status = 'not_required')
  ),
  constraint checkout_cash_change_consistency check (
    payment_method = 'cash' or cash_change_for_cents is null
  )
);

create table if not exists public.store_payment_methods (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  method text not null check (method in ('cash','pix','credit_card','debit_card')),
  enabled boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, method),
  constraint store_payment_methods_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade
);

create index if not exists checkout_sessions_org_store_cart_idx
  on public.checkout_sessions (organization_id, store_id, cart_id);
create index if not exists checkout_sessions_org_customer_idx
  on public.checkout_sessions (organization_id, customer_id)
  where customer_id is not null;
create index if not exists store_payment_methods_org_store_idx
  on public.store_payment_methods (organization_id, store_id, enabled, sort_order);

alter table public.checkout_sessions enable row level security;
alter table public.store_payment_methods enable row level security;

-- Checkout público é sempre mediado por código server-side.
revoke all on table public.checkout_sessions from anon, authenticated;
grant select, insert, update, delete on table public.checkout_sessions to service_role;

create policy checkout_sessions_deny_direct
on public.checkout_sessions as restrictive
for all to anon, authenticated
using (false) with check (false);

-- Configuração de pagamento pode ser lida/alterada por usuários autorizados da loja.
grant select, insert, update, delete on table public.store_payment_methods to authenticated, service_role;

create policy store_payment_methods_view
on public.store_payment_methods for select to authenticated
using (private.can_access_store(organization_id, store_id));

create policy store_payment_methods_insert
on public.store_payment_methods for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'stores.manage'));

create policy store_payment_methods_update
on public.store_payment_methods for update to authenticated
using (private.has_permission(organization_id, store_id, 'stores.manage'))
with check (private.has_permission(organization_id, store_id, 'stores.manage'));

create policy store_payment_methods_delete
on public.store_payment_methods for delete to authenticated
using (private.has_permission(organization_id, store_id, 'stores.manage'));

-- Mantém checkout + taxa do carrinho consistentes na mesma transação.
create or replace function public.checkout_set_fulfillment_internal(
  p_store_id uuid,
  p_token_hash text,
  p_fulfillment_type text,
  p_address jsonb,
  p_delivery_quote_status text,
  p_delivery_fee_cents bigint,
  p_estimated_min_minutes integer,
  p_estimated_max_minutes integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cart public.carts%rowtype;
  v_checkout_id uuid;
begin
  if p_fulfillment_type not in ('delivery','pickup') then
    raise exception 'invalid fulfillment type';
  end if;

  if p_delivery_fee_cents < 0 then raise exception 'invalid delivery fee'; end if;

  select * into v_cart
  from public.carts
  where store_id = p_store_id
    and token_hash = p_token_hash
    and status = 'active'
    and expires_at > now()
  for update;

  if v_cart.id is null then raise exception 'cart unavailable'; end if;

  if p_fulfillment_type = 'pickup' then
    p_address := null;
    p_delivery_quote_status := 'not_required';
    p_delivery_fee_cents := 0;
    p_estimated_min_minutes := null;
    p_estimated_max_minutes := null;
  elsif p_delivery_quote_status not in ('required','valid','unserviceable') then
    raise exception 'invalid delivery quote status';
  end if;

  insert into public.checkout_sessions (
    organization_id, store_id, cart_id, fulfillment_type,
    address_postal_code, address_street, address_number, address_complement,
    address_district, address_city, address_state, address_reference,
    delivery_quote_status, delivery_fee_cents,
    delivery_estimated_min_minutes, delivery_estimated_max_minutes,
    reviewed_at, updated_at
  ) values (
    v_cart.organization_id, v_cart.store_id, v_cart.id, p_fulfillment_type,
    case when p_address is null then null else p_address->>'postal_code' end,
    case when p_address is null then null else p_address->>'street' end,
    case when p_address is null then null else p_address->>'number' end,
    case when p_address is null then null else nullif(p_address->>'complement','') end,
    case when p_address is null then null else p_address->>'district' end,
    case when p_address is null then null else p_address->>'city' end,
    case when p_address is null then null else p_address->>'state' end,
    case when p_address is null then null else nullif(p_address->>'reference','') end,
    p_delivery_quote_status, p_delivery_fee_cents,
    p_estimated_min_minutes, p_estimated_max_minutes,
    null, now()
  )
  on conflict (cart_id) do update set
    fulfillment_type = excluded.fulfillment_type,
    address_postal_code = excluded.address_postal_code,
    address_street = excluded.address_street,
    address_number = excluded.address_number,
    address_complement = excluded.address_complement,
    address_district = excluded.address_district,
    address_city = excluded.address_city,
    address_state = excluded.address_state,
    address_reference = excluded.address_reference,
    delivery_quote_status = excluded.delivery_quote_status,
    delivery_fee_cents = excluded.delivery_fee_cents,
    delivery_estimated_min_minutes = excluded.delivery_estimated_min_minutes,
    delivery_estimated_max_minutes = excluded.delivery_estimated_max_minutes,
    reviewed_at = null,
    updated_at = now()
  returning id into v_checkout_id;

  update public.carts
  set delivery_fee_cents = p_delivery_fee_cents,
      total_cents = greatest(0, subtotal_cents - discount_cents + p_delivery_fee_cents),
      updated_at = now()
  where id = v_cart.id;

  return jsonb_build_object(
    'checkout_id', v_checkout_id,
    'cart_id', v_cart.id,
    'delivery_fee_cents', p_delivery_fee_cents,
    'total_cents', greatest(0, v_cart.subtotal_cents - v_cart.discount_cents + p_delivery_fee_cents)
  );
end;
$$;

revoke all on function public.checkout_set_fulfillment_internal(uuid,text,text,jsonb,text,bigint,integer,integer)
from public, anon, authenticated;
grant execute on function public.checkout_set_fulfillment_internal(uuid,text,text,jsonb,text,bigint,integer,integer)
to service_role;

-- Defaults para lojas já existentes. Novas lojas usam fallback do serviço até configuração explícita.
insert into public.store_payment_methods (organization_id, store_id, method, enabled, sort_order)
select s.organization_id, s.id, x.method, true, x.sort_order
from public.stores s
cross join (values
  ('pix'::text, 10),
  ('credit_card'::text, 20),
  ('debit_card'::text, 30),
  ('cash'::text, 40)
) as x(method, sort_order)
on conflict (store_id, method) do nothing;
