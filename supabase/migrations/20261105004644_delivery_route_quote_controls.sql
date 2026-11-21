create table public.delivery_road_distance_cache (
  store_id uuid not null references public.stores(id) on delete cascade,
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  distance_meters numeric not null check (distance_meters > 0 and distance_meters <= 30000),
  expires_at timestamptz not null,
  primary key (store_id, cache_key)
);

create table public.delivery_route_quote_budget (
  day date primary key,
  reserved_quotes integer not null check (reserved_quotes between 1 and 200)
);

alter table public.delivery_road_distance_cache enable row level security;
alter table public.delivery_route_quote_budget enable row level security;
revoke all on public.delivery_road_distance_cache, public.delivery_route_quote_budget from public, anon, authenticated;
grant select, insert, update, delete on public.delivery_road_distance_cache, public.delivery_route_quote_budget to service_role;

create function public.reserve_delivery_route_quote()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_reserved integer;
begin
  insert into public.delivery_route_quote_budget as budget (day, reserved_quotes)
  values (v_day, 1)
  on conflict (day) do update set reserved_quotes = budget.reserved_quotes + 1
    where budget.reserved_quotes < 200
  returning reserved_quotes into v_reserved;

  if v_reserved = 1 then
    delete from public.delivery_route_quote_budget where day < v_day - 7;
    delete from public.delivery_road_distance_cache where expires_at <= now();
  end if;

  return v_reserved is not null;
end;
$$;

revoke all on function public.reserve_delivery_route_quote() from public, anon, authenticated;
grant execute on function public.reserve_delivery_route_quote() to service_role;

create function public.create_road_delivery_order_from_checkout(
  p_store_id uuid,
  p_token_hash text,
  p_order_access_token_hash text,
  p_expected_total_cents bigint,
  p_reviewed_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cart public.carts%rowtype;
  v_checkout public.checkout_sessions%rowtype;
begin
  select * into v_cart from public.carts
  where store_id = p_store_id and token_hash = p_token_hash for update;

  if v_cart.id is not null and not exists (
    select 1 from public.orders where source_cart_id = v_cart.id
  ) then
    select * into v_checkout from public.checkout_sessions
    where cart_id = v_cart.id and store_id = p_store_id
      and organization_id = v_cart.organization_id for update;

    if p_reviewed_at is null
      or v_checkout.reviewed_at is distinct from p_reviewed_at
      or v_checkout.fulfillment_type is distinct from 'delivery'
      or v_cart.total_cents is distinct from p_expected_total_cents then
      raise exception using errcode = 'PDR01', message = 'checkout quote changed';
    end if;
  end if;

  return public.create_order_from_checkout_internal(
    p_store_id, p_token_hash, p_order_access_token_hash, 'digital_menu'
  );
end;
$$;

revoke all on function public.create_road_delivery_order_from_checkout(uuid, text, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.create_road_delivery_order_from_checkout(uuid, text, text, bigint, timestamptz) to service_role;
