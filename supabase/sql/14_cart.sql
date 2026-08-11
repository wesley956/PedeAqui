-- PedeAqui — bloco [036]–[040]
-- Carrinho server-only. O navegador nunca escreve preço/total diretamente.

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  customer_id uuid references public.customers(id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active','converted','abandoned','expired')),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  expires_at timestamptz not null,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint carts_customer_same_org_fk foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete set null,
  constraint carts_org_store_id_unique unique (organization_id, store_id, id),
  constraint carts_total_consistency check (total_cents = greatest(0, subtotal_cents - discount_cents + delivery_fee_cents))
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  cart_id uuid not null,
  product_id uuid not null,
  product_name_snapshot text not null,
  product_image_url_snapshot text,
  quantity integer not null check (quantity between 1 and 99),
  note text check (note is null or char_length(note) <= 500),
  unit_base_price_cents integer not null check (unit_base_price_cents >= 0),
  unit_modifiers_price_cents integer not null default 0 check (unit_modifiers_price_cents >= 0),
  unit_total_price_cents integer not null check (unit_total_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  validation_status text not null default 'valid' check (validation_status in ('valid','unavailable','invalid_modifiers')),
  price_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_cart_same_store_fk foreign key (organization_id, store_id, cart_id)
    references public.carts (organization_id, store_id, id) on delete cascade,
  constraint cart_items_product_same_store_fk foreign key (organization_id, store_id, product_id)
    references public.products (organization_id, store_id, id) on delete restrict,
  constraint cart_items_math check (unit_total_price_cents = unit_base_price_cents + unit_modifiers_price_cents),
  constraint cart_items_line_math check (line_total_cents = unit_total_price_cents::bigint * quantity),
  constraint cart_items_org_store_id_unique unique (organization_id, store_id, id)
);

create table if not exists public.cart_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  cart_item_id uuid not null,
  modifier_group_id uuid not null,
  modifier_id uuid not null,
  group_name_snapshot text not null,
  modifier_name_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  constraint cart_item_modifiers_item_same_store_fk foreign key (organization_id, store_id, cart_item_id)
    references public.cart_items (organization_id, store_id, id) on delete cascade,
  constraint cart_item_modifiers_group_same_store_fk foreign key (organization_id, store_id, modifier_group_id)
    references public.modifier_groups (organization_id, store_id, id) on delete restrict,
  constraint cart_item_modifiers_modifier_same_store_fk foreign key (organization_id, store_id, modifier_id)
    references public.modifiers (organization_id, store_id, id) on delete restrict,
  unique (cart_item_id, modifier_id)
);

create index if not exists carts_store_status_idx on public.carts (store_id, status, updated_at desc);
create index if not exists carts_expires_idx on public.carts (expires_at) where status = 'active';
create index if not exists cart_items_cart_idx on public.cart_items (cart_id, created_at);
create index if not exists cart_item_modifiers_item_idx on public.cart_item_modifiers (cart_item_id);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.cart_item_modifiers enable row level security;

-- Carrinhos públicos são manipulados exclusivamente por serviços server-side.
create policy carts_deny_direct on public.carts as restrictive for all to anon, authenticated using (false) with check (false);
create policy cart_items_deny_direct on public.cart_items as restrictive for all to anon, authenticated using (false) with check (false);
create policy cart_item_modifiers_deny_direct on public.cart_item_modifiers as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function public.cart_add_item_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_product_id uuid,
  p_product_name text,
  p_product_image_url text,
  p_unit_base_price_cents integer,
  p_quantity integer,
  p_note text,
  p_modifiers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart_id uuid;
  v_item_id uuid;
  v_modifier_total integer := 0;
  v_unit_total integer;
  v_line_total bigint;
  v_modifier jsonb;
  v_subtotal bigint;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid cart token hash'; end if;
  if p_quantity < 1 or p_quantity > 99 then raise exception 'invalid quantity'; end if;
  if p_unit_base_price_cents < 0 then raise exception 'invalid price'; end if;
  if jsonb_typeof(coalesce(p_modifiers, '[]'::jsonb)) <> 'array' then raise exception 'invalid modifiers'; end if;

  insert into public.carts (organization_id, store_id, token_hash, expires_at)
  values (p_organization_id, p_store_id, p_token_hash, p_expires_at)
  on conflict (token_hash) do update
    set expires_at = greatest(public.carts.expires_at, excluded.expires_at), updated_at = now()
    where public.carts.organization_id = excluded.organization_id
      and public.carts.store_id = excluded.store_id
      and public.carts.status = 'active'
  returning id into v_cart_id;

  if v_cart_id is null then
    select id into v_cart_id from public.carts
    where token_hash = p_token_hash and organization_id = p_organization_id and store_id = p_store_id and status = 'active';
  end if;
  if v_cart_id is null then raise exception 'cart unavailable'; end if;

  select coalesce(sum((m->>'unit_price_cents')::integer), 0)
  into v_modifier_total
  from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) m;

  v_unit_total := p_unit_base_price_cents + v_modifier_total;
  v_line_total := v_unit_total::bigint * p_quantity;

  insert into public.cart_items (
    organization_id, store_id, cart_id, product_id, product_name_snapshot, product_image_url_snapshot,
    quantity, note, unit_base_price_cents, unit_modifiers_price_cents, unit_total_price_cents, line_total_cents
  ) values (
    p_organization_id, p_store_id, v_cart_id, p_product_id, p_product_name, p_product_image_url,
    p_quantity, nullif(trim(p_note), ''), p_unit_base_price_cents, v_modifier_total, v_unit_total, v_line_total
  ) returning id into v_item_id;

  for v_modifier in select value from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) loop
    insert into public.cart_item_modifiers (
      organization_id, store_id, cart_item_id, modifier_group_id, modifier_id,
      group_name_snapshot, modifier_name_snapshot, unit_price_cents
    ) values (
      p_organization_id, p_store_id, v_item_id,
      (v_modifier->>'group_id')::uuid,
      (v_modifier->>'modifier_id')::uuid,
      v_modifier->>'group_name',
      v_modifier->>'modifier_name',
      (v_modifier->>'unit_price_cents')::integer
    );
  end loop;

  select coalesce(sum(line_total_cents), 0) into v_subtotal
  from public.cart_items where cart_id = v_cart_id and validation_status = 'valid';

  update public.carts
  set subtotal_cents = v_subtotal,
      total_cents = greatest(0, v_subtotal - discount_cents + delivery_fee_cents),
      last_validated_at = now(), updated_at = now()
  where id = v_cart_id;

  return jsonb_build_object('cart_id', v_cart_id, 'item_id', v_item_id, 'subtotal_cents', v_subtotal);
end;
$$;

create or replace function public.cart_update_quantity_internal(
  p_store_id uuid, p_token_hash text, p_item_id uuid, p_quantity integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_cart_id uuid; v_subtotal bigint;
begin
  if p_quantity < 1 or p_quantity > 99 then raise exception 'invalid quantity'; end if;
  select id into v_cart_id from public.carts where store_id = p_store_id and token_hash = p_token_hash and status = 'active' and expires_at > now();
  if v_cart_id is null then raise exception 'cart unavailable'; end if;
  update public.cart_items set quantity = p_quantity, line_total_cents = unit_total_price_cents::bigint * p_quantity, updated_at = now()
  where id = p_item_id and cart_id = v_cart_id;
  if not found then raise exception 'cart item not found'; end if;
  select coalesce(sum(line_total_cents),0) into v_subtotal from public.cart_items where cart_id=v_cart_id and validation_status='valid';
  update public.carts set subtotal_cents=v_subtotal,total_cents=greatest(0,v_subtotal-discount_cents+delivery_fee_cents),updated_at=now() where id=v_cart_id;
  return jsonb_build_object('cart_id',v_cart_id,'subtotal_cents',v_subtotal);
end; $$;

create or replace function public.cart_remove_item_internal(
  p_store_id uuid, p_token_hash text, p_item_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_cart_id uuid; v_subtotal bigint;
begin
  select id into v_cart_id from public.carts where store_id=p_store_id and token_hash=p_token_hash and status='active' and expires_at>now();
  if v_cart_id is null then raise exception 'cart unavailable'; end if;
  delete from public.cart_items where id=p_item_id and cart_id=v_cart_id;
  if not found then raise exception 'cart item not found'; end if;
  select coalesce(sum(line_total_cents),0) into v_subtotal from public.cart_items where cart_id=v_cart_id and validation_status='valid';
  update public.carts set subtotal_cents=v_subtotal,total_cents=greatest(0,v_subtotal-discount_cents+delivery_fee_cents),updated_at=now() where id=v_cart_id;
  return jsonb_build_object('cart_id',v_cart_id,'subtotal_cents',v_subtotal);
end; $$;

create or replace function public.cart_apply_reprice_internal(
  p_store_id uuid, p_token_hash text, p_updates jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cart_id uuid;
  u jsonb;
  m jsonb;
  v_subtotal bigint;
  v_invalid integer;
begin
  if jsonb_typeof(coalesce(p_updates,'[]'::jsonb)) <> 'array' then raise exception 'invalid updates'; end if;
  select id into v_cart_id from public.carts where store_id=p_store_id and token_hash=p_token_hash and status='active' and expires_at>now() for update;
  if v_cart_id is null then raise exception 'cart unavailable'; end if;

  for u in select value from jsonb_array_elements(coalesce(p_updates,'[]'::jsonb)) loop
    update public.cart_items
    set product_name_snapshot = coalesce(u->>'product_name', product_name_snapshot),
        product_image_url_snapshot = case when u ? 'product_image_url' then nullif(u->>'product_image_url','') else product_image_url_snapshot end,
        unit_base_price_cents = coalesce((u->>'unit_base_price_cents')::integer, unit_base_price_cents),
        unit_modifiers_price_cents = coalesce((u->>'unit_modifiers_price_cents')::integer, unit_modifiers_price_cents),
        unit_total_price_cents = coalesce((u->>'unit_total_price_cents')::integer, unit_total_price_cents),
        line_total_cents = coalesce((u->>'line_total_cents')::bigint, line_total_cents),
        validation_status = (u->>'validation_status'),
        price_changed_at = case when coalesce((u->>'price_changed')::boolean,false) then now() else price_changed_at end,
        updated_at = now()
    where id=(u->>'item_id')::uuid and cart_id=v_cart_id;

    if u ? 'modifiers' and (u->>'validation_status') = 'valid' then
      delete from public.cart_item_modifiers where cart_item_id=(u->>'item_id')::uuid;
      for m in select value from jsonb_array_elements(u->'modifiers') loop
        insert into public.cart_item_modifiers (
          organization_id, store_id, cart_item_id, modifier_group_id, modifier_id,
          group_name_snapshot, modifier_name_snapshot, unit_price_cents
        )
        select ci.organization_id, ci.store_id, ci.id,
          (m->>'group_id')::uuid,(m->>'modifier_id')::uuid,m->>'group_name',m->>'modifier_name',(m->>'unit_price_cents')::integer
        from public.cart_items ci where ci.id=(u->>'item_id')::uuid and ci.cart_id=v_cart_id;
      end loop;
    end if;
  end loop;

  select coalesce(sum(line_total_cents),0) into v_subtotal from public.cart_items where cart_id=v_cart_id and validation_status='valid';
  select count(*) into v_invalid from public.cart_items where cart_id=v_cart_id and validation_status<>'valid';
  update public.carts set subtotal_cents=v_subtotal,total_cents=greatest(0,v_subtotal-discount_cents+delivery_fee_cents),last_validated_at=now(),updated_at=now() where id=v_cart_id;
  return jsonb_build_object('cart_id',v_cart_id,'subtotal_cents',v_subtotal,'invalid_items',v_invalid);
end; $$;

revoke all on function public.cart_add_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.cart_update_quantity_internal(uuid,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.cart_remove_item_internal(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.cart_apply_reprice_internal(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.cart_add_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb) to service_role;
grant execute on function public.cart_update_quantity_internal(uuid,text,uuid,integer) to service_role;
grant execute on function public.cart_remove_item_internal(uuid,text,uuid) to service_role;
grant execute on function public.cart_apply_reprice_internal(uuid,text,jsonb) to service_role;
