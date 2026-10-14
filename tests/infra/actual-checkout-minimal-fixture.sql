-- Disposable PG16 fixture only. Load REAL original checkout RPC from supabase/sql/21_order_access_token.sql.
-- Minimal referenced tables and columns; not a substitute for full Supabase schema/RLS.
create schema if not exists public;
create table public.carts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 store_id uuid not null, token_hash text not null, status text not null default 'active',
 expires_at timestamptz not null default now()+interval '2 hours',
 updated_at timestamptz not null default now()-interval '10 minutes',
 customer_id uuid, subtotal_cents bigint not null default 5000,
 discount_cents bigint not null default 0, delivery_fee_cents bigint not null default 0,
 total_cents bigint not null default 5000, unique(store_id,token_hash)
);
create table public.checkout_sessions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 store_id uuid not null, cart_id uuid not null unique references public.carts(id),
 reviewed_at timestamptz default now(), updated_at timestamptz default now(),
 customer_id uuid, customer_name text, customer_phone_normalized text,
 customer_phone text, customer_email text, fulfillment_type text, delivery_quote_status text,
 payment_method text, cash_change_for_cents bigint,
 address_postal_code text, address_street text, address_number text,
 address_complement text, address_district text, address_city text,
 address_state text, address_reference text,
 delivery_estimated_min_minutes integer, delivery_estimated_max_minutes integer
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 store_id uuid not null, source_cart_id uuid not null unique references public.carts(id),
 checkout_session_id uuid not null unique references public.checkout_sessions(id),
 public_access_token_hash text not null, display_number bigint not null,
 channel text, fulfillment_type text, order_status text, payment_status text,
 production_status text, fulfillment_status text,
 customer_id uuid, customer_name_snapshot text, customer_phone_snapshot text,
 customer_email_snapshot text,
 address_postal_code_snapshot text, address_street_snapshot text,
 address_number_snapshot text, address_complement_snapshot text,
 address_district_snapshot text, address_city_snapshot text,
 address_state_snapshot text, address_reference_snapshot text,
 subtotal_cents bigint, discount_cents bigint, delivery_fee_cents bigint,
 total_cents bigint, payment_method_snapshot text, cash_change_for_cents bigint,
 delivery_estimated_min_minutes integer, delivery_estimated_max_minutes integer,
 unique(store_id, display_number)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 name text, phone text, phone_normalized text, email text, deleted_at timestamptz,
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index customers_phone_test on public.customers(organization_id,phone_normalized)
 where phone_normalized is not null and deleted_at is null;
create table public.cart_items (
 id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.carts(id),
 validation_status text not null default 'valid', created_at timestamptz default now(),
 product_id uuid, product_name_snapshot text, product_image_url_snapshot text,
 quantity integer, note text, unit_base_price_cents bigint, unit_modifiers_price_cents bigint,
 unit_total_price_cents bigint, line_total_cents bigint
);
create table public.cart_item_modifiers (
 id uuid primary key default gen_random_uuid(), cart_item_id uuid not null,
 created_at timestamptz default now(), modifier_group_id uuid, modifier_id uuid,
 group_name_snapshot text, modifier_name_snapshot text, unit_price_cents bigint
);
create table public.order_sequences(
 store_id uuid primary key, organization_id uuid not null,
 last_number bigint not null default 0, updated_at timestamptz default now()
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 store_id uuid not null, order_id uuid not null references public.orders(id),
 product_id uuid, product_name_snapshot text, product_image_url_snapshot text,
 quantity integer, note text, unit_base_price_cents bigint, unit_modifiers_price_cents bigint,
 unit_total_price_cents bigint, line_total_cents bigint
);
create table public.order_item_modifiers(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 store_id uuid not null, order_item_id uuid not null,
 modifier_group_id uuid, modifier_id uuid, group_name_snapshot text,
 modifier_name_snapshot text, unit_price_cents bigint
);
create table public.order_state_history(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 store_id uuid not null, order_id uuid not null,
 state_domain text, from_state text, to_state text, source text
);
create table public.domain_events(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 store_id uuid not null, event_type text, entity_type text, entity_id uuid,
 payload jsonb, status text, attempts integer, occurred_at timestamptz
);
