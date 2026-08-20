-- PedeAqui — perfil Revenda de Gás [362]–[366]
-- Domínio aditivo de vasilhames, opção estruturada por item e integração com módulos/planos.

-- Catálogo modular v2: o módulo de vasilhames é exclusivo do perfil gas e permanece desligado por padrão.
alter table public.store_modules drop constraint if exists store_modules_module_key_check;
alter table public.store_modules add constraint store_modules_module_key_check check (module_key in (
  'dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production',
  'deliveries','driver','inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings'
));

insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version)
select s.organization_id,s.id,'gas_containers',false,'migration',2
from public.stores s
on conflict(store_id,module_key) do nothing;
update public.store_modules set catalog_version=2 where catalog_version<2;
update public.stores set module_catalog_version=2,updated_at=now() where module_catalog_version<2;

insert into public.permissions(key,description) values
  ('gas_containers.view','Visualizar tipos, saldos e movimentações de vasilhames'),
  ('gas_containers.manage','Gerenciar tipos, vínculos de produtos e ajustes de vasilhames')
on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in ('gas_containers.view','gas_containers.manage')
where r.key in ('owner','manager') on conflict do nothing;

insert into public.features(key,name,description,value_type,active,metadata) values
  ('module.gas_containers','Módulo de vasilhames','Controle de troca, casco e saldo de vasilhames para revendas de gás','boolean',true,'{"module_key":"gas_containers"}'::jsonb)
on conflict(key) do update set name=excluded.name,description=excluded.description,active=true,metadata=excluded.metadata;
insert into public.plan_features(plan_id,feature_id,enabled,limit_value,config)
select p.id,f.id,true,null,'{}'::jsonb
from public.plans p cross join public.features f
where p.key in ('professional','management') and f.key='module.gas_containers'
on conflict(plan_id,feature_id) do update set enabled=true,limit_value=null,updated_at=now();

-- O preço adicional do casco é um componente explícito, sem contaminar preço base/modificadores.
alter table public.cart_items add column if not exists unit_segment_price_cents integer not null default 0;
alter table public.order_items add column if not exists unit_segment_price_cents integer not null default 0;
alter table public.cart_items drop constraint if exists cart_items_math;
alter table public.cart_items add constraint cart_items_segment_price_nonnegative check(unit_segment_price_cents>=0);
alter table public.cart_items add constraint cart_items_math check(unit_total_price_cents=unit_base_price_cents+unit_modifiers_price_cents+unit_segment_price_cents);
alter table public.order_items drop constraint if exists order_items_unit_total_consistency;
alter table public.order_items add constraint order_items_segment_price_nonnegative check(unit_segment_price_cents>=0);
alter table public.order_items add constraint order_items_unit_total_consistency check(unit_total_price_cents=unit_base_price_cents+unit_modifiers_price_cents+unit_segment_price_cents);

create table if not exists public.gas_container_types(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  code text not null check(char_length(trim(code)) between 1 and 24),
  name text not null check(char_length(trim(name)) between 2 and 100),
  nominal_weight_kg numeric(8,3) check(nominal_weight_kg is null or nominal_weight_kg>0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gas_container_types_store_same_org_fk foreign key(organization_id,store_id) references public.stores(organization_id,id) on delete cascade,
  constraint gas_container_types_org_store_id_unique unique(organization_id,store_id,id)
);
create unique index if not exists gas_container_types_code_unique on public.gas_container_types(store_id,lower(code));

create table if not exists public.product_gas_profiles(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  product_id uuid primary key,
  container_type_id uuid not null,
  exchange_enabled boolean not null default true,
  container_sale_enabled boolean not null default true,
  require_container_choice boolean not null default true,
  container_surcharge_cents integer not null default 0 check(container_surcharge_cents>=0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_gas_profiles_product_same_store_fk foreign key(organization_id,store_id,product_id) references public.products(organization_id,store_id,id) on delete cascade,
  constraint product_gas_profiles_type_same_store_fk foreign key(organization_id,store_id,container_type_id) references public.gas_container_types(organization_id,store_id,id) on delete restrict
);
create index if not exists product_gas_profiles_type_idx on public.product_gas_profiles(store_id,container_type_id,active);

create table if not exists public.cart_item_gas_options(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  cart_item_id uuid primary key,
  container_type_id uuid,
  sale_mode text not null check(sale_mode in ('exchange','with_container')),
  container_code_snapshot text not null,
  container_name_snapshot text not null,
  unit_container_price_cents integer not null default 0 check(unit_container_price_cents>=0),
  created_at timestamptz not null default now(),
  constraint cart_item_gas_options_item_same_store_fk foreign key(organization_id,store_id,cart_item_id) references public.cart_items(organization_id,store_id,id) on delete cascade,
  constraint cart_item_gas_options_type_same_store_fk foreign key(organization_id,store_id,container_type_id) references public.gas_container_types(organization_id,store_id,id) on delete set null(container_type_id)
);

create table if not exists public.order_item_gas_options(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_item_id uuid primary key,
  container_type_id uuid,
  sale_mode text not null check(sale_mode in ('exchange','with_container')),
  container_code_snapshot text not null,
  container_name_snapshot text not null,
  unit_container_price_cents integer not null default 0 check(unit_container_price_cents>=0),
  created_at timestamptz not null default now(),
  constraint order_item_gas_options_item_same_store_fk foreign key(organization_id,store_id,order_item_id) references public.order_items(organization_id,store_id,id) on delete cascade,
  constraint order_item_gas_options_type_same_store_fk foreign key(organization_id,store_id,container_type_id) references public.gas_container_types(organization_id,store_id,id) on delete set null(container_type_id)
);

create table if not exists public.gas_container_movements(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  container_type_id uuid not null,
  order_id uuid,
  order_item_id uuid,
  movement_kind text not null check(movement_kind in ('adjustment','dispatch','delivery_exchange','delivery_with_container','pickup_exchange','pickup_with_container','route_return')),
  full_delta integer not null default 0,
  empty_delta integer not null default 0,
  in_route_delta integer not null default 0,
  idempotency_key text not null check(char_length(trim(idempotency_key)) between 8 and 240),
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint gas_container_movements_type_same_store_fk foreign key(organization_id,store_id,container_type_id) references public.gas_container_types(organization_id,store_id,id) on delete restrict,
  constraint gas_container_movements_order_same_store_fk foreign key(organization_id,store_id,order_id) references public.orders(organization_id,store_id,id) on delete restrict,
  constraint gas_container_movements_item_same_store_fk foreign key(organization_id,store_id,order_item_id) references public.order_items(organization_id,store_id,id) on delete restrict,
  constraint gas_container_movements_nonzero check(full_delta<>0 or empty_delta<>0 or in_route_delta<>0),
  constraint gas_container_movements_idempotency_unique unique(store_id,idempotency_key)
);
create index if not exists gas_container_movements_balance_idx on public.gas_container_movements(store_id,container_type_id,created_at,id);
create index if not exists gas_container_movements_order_idx on public.gas_container_movements(store_id,order_id,order_item_id);

create or replace view public.gas_container_balances as
select t.organization_id,t.store_id,t.id as container_type_id,t.code,t.name,t.nominal_weight_kg,t.active,
  coalesce(sum(m.full_delta),0)::bigint as full_quantity,
  coalesce(sum(m.empty_delta),0)::bigint as empty_quantity,
  coalesce(sum(m.in_route_delta),0)::bigint as in_route_quantity
from public.gas_container_types t
left join public.gas_container_movements m on m.organization_id=t.organization_id and m.store_id=t.store_id and m.container_type_id=t.id
group by t.organization_id,t.store_id,t.id,t.code,t.name,t.nominal_weight_kg,t.active;

for table_name in select unnest(array['gas_container_types','product_gas_profiles','cart_item_gas_options','order_item_gas_options','gas_container_movements']) loop
  execute format('alter table public.%I enable row level security',table_name);
end loop;

revoke all on table public.gas_container_types,public.product_gas_profiles,public.cart_item_gas_options,public.order_item_gas_options,public.gas_container_movements from anon,authenticated;
grant select on table public.gas_container_types,public.product_gas_profiles,public.order_item_gas_options,public.gas_container_movements to authenticated;
grant select,insert,update,delete on table public.gas_container_types,public.product_gas_profiles,public.cart_item_gas_options,public.order_item_gas_options,public.gas_container_movements to service_role;
grant select on public.gas_container_balances to authenticated,service_role;

drop policy if exists gas_container_types_select_authorized on public.gas_container_types;
create policy gas_container_types_select_authorized on public.gas_container_types for select to authenticated using(private.can_access_store(organization_id,store_id));
drop policy if exists product_gas_profiles_select_authorized on public.product_gas_profiles;
create policy product_gas_profiles_select_authorized on public.product_gas_profiles for select to authenticated using(private.can_access_store(organization_id,store_id));
drop policy if exists order_item_gas_options_select_authorized on public.order_item_gas_options;
create policy order_item_gas_options_select_authorized on public.order_item_gas_options for select to authenticated using(private.can_access_store(organization_id,store_id));
drop policy if exists gas_container_movements_select_authorized on public.gas_container_movements;
create policy gas_container_movements_select_authorized on public.gas_container_movements for select to authenticated using(private.can_access_store(organization_id,store_id));

create or replace function public.gas_container_adjust_internal(
  p_organization_id uuid,p_store_id uuid,p_container_type_id uuid,p_full_delta integer,p_empty_delta integer,p_in_route_delta integer,
  p_idempotency_key text,p_reason text,p_actor_user_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_existing public.gas_container_movements%rowtype;
begin
  if coalesce(p_full_delta,0)=0 and coalesce(p_empty_delta,0)=0 and coalesce(p_in_route_delta,0)=0 then raise exception 'movement cannot be zero'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'adjustment reason is required'; end if;
  select * into v_existing from public.gas_container_movements where store_id=p_store_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then return jsonb_build_object('movement_id',v_existing.id,'idempotent',true); end if;
  if not exists(select 1 from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id and s.business_type='gas') then raise exception 'gas profile required'; end if;
  if not exists(select 1 from public.gas_container_types t where t.id=p_container_type_id and t.organization_id=p_organization_id and t.store_id=p_store_id and t.active) then raise exception 'container type unavailable'; end if;
  insert into public.gas_container_movements(organization_id,store_id,container_type_id,movement_kind,full_delta,empty_delta,in_route_delta,idempotency_key,actor_user_id,reason)
  values(p_organization_id,p_store_id,p_container_type_id,'adjustment',coalesce(p_full_delta,0),coalesce(p_empty_delta,0),coalesce(p_in_route_delta,0),trim(p_idempotency_key),p_actor_user_id,trim(p_reason)) returning id into v_id;
  return jsonb_build_object('movement_id',v_id,'idempotent',false);
end $$;
revoke all on function public.gas_container_adjust_internal(uuid,uuid,uuid,integer,integer,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.gas_container_adjust_internal(uuid,uuid,uuid,integer,integer,integer,text,text,uuid) to service_role;

-- Adição atômica no carrinho: o valor do casco é obtido do perfil do produto, nunca do browser.
create or replace function public.cart_add_gas_item_internal(
  p_organization_id uuid,p_store_id uuid,p_token_hash text,p_expires_at timestamptz,p_product_id uuid,p_product_name text,p_product_image_url text,
  p_unit_base_price_cents integer,p_quantity integer,p_note text,p_modifiers jsonb,p_sale_mode text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_cart_id uuid; v_item_id uuid; v_modifier_total integer:=0; v_segment_total integer:=0; v_unit_total integer; v_line_total bigint;
  v_modifier jsonb; v_subtotal bigint; v_profile public.product_gas_profiles%rowtype; v_type public.gas_container_types%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid cart token hash'; end if;
  if p_quantity<1 or p_quantity>99 then raise exception 'invalid quantity'; end if;
  if p_unit_base_price_cents<0 then raise exception 'invalid price'; end if;
  if p_sale_mode not in ('exchange','with_container') then raise exception 'invalid gas sale mode'; end if;
  if jsonb_typeof(coalesce(p_modifiers,'[]'::jsonb))<>'array' then raise exception 'invalid modifiers'; end if;
  if not exists(select 1 from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id and s.business_type='gas') then raise exception 'gas profile required'; end if;
  if not exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and sm.enabled) then raise exception 'gas container module unavailable'; end if;
  select * into v_profile from public.product_gas_profiles p where p.organization_id=p_organization_id and p.store_id=p_store_id and p.product_id=p_product_id and p.active;
  if v_profile.product_id is null then raise exception 'gas product profile unavailable'; end if;
  if p_sale_mode='exchange' and not v_profile.exchange_enabled then raise exception 'exchange is unavailable for product'; end if;
  if p_sale_mode='with_container' and not v_profile.container_sale_enabled then raise exception 'container sale is unavailable for product'; end if;
  select * into v_type from public.gas_container_types t where t.organization_id=p_organization_id and t.store_id=p_store_id and t.id=v_profile.container_type_id and t.active;
  if v_type.id is null then raise exception 'container type unavailable'; end if;
  v_segment_total:=case when p_sale_mode='with_container' then v_profile.container_surcharge_cents else 0 end;

  insert into public.carts(organization_id,store_id,token_hash,expires_at) values(p_organization_id,p_store_id,p_token_hash,p_expires_at)
  on conflict(token_hash) do update set expires_at=greatest(public.carts.expires_at,excluded.expires_at),updated_at=now()
  where public.carts.organization_id=excluded.organization_id and public.carts.store_id=excluded.store_id and public.carts.status='active'
  returning id into v_cart_id;
  if v_cart_id is null then select id into v_cart_id from public.carts where token_hash=p_token_hash and organization_id=p_organization_id and store_id=p_store_id and status='active'; end if;
  if v_cart_id is null then raise exception 'cart unavailable'; end if;

  select coalesce(sum((m->>'unit_price_cents')::integer),0) into v_modifier_total from jsonb_array_elements(coalesce(p_modifiers,'[]'::jsonb)) m;
  v_unit_total:=p_unit_base_price_cents+v_modifier_total+v_segment_total; v_line_total:=v_unit_total::bigint*p_quantity;
  insert into public.cart_items(organization_id,store_id,cart_id,product_id,product_name_snapshot,product_image_url_snapshot,quantity,note,unit_base_price_cents,unit_modifiers_price_cents,unit_segment_price_cents,unit_total_price_cents,line_total_cents)
  values(p_organization_id,p_store_id,v_cart_id,p_product_id,p_product_name,p_product_image_url,p_quantity,nullif(trim(p_note),''),p_unit_base_price_cents,v_modifier_total,v_segment_total,v_unit_total,v_line_total)
  returning id into v_item_id;
  for v_modifier in select value from jsonb_array_elements(coalesce(p_modifiers,'[]'::jsonb)) loop
    insert into public.cart_item_modifiers(organization_id,store_id,cart_item_id,modifier_group_id,modifier_id,group_name_snapshot,modifier_name_snapshot,unit_price_cents)
    values(p_organization_id,p_store_id,v_item_id,(v_modifier->>'group_id')::uuid,(v_modifier->>'modifier_id')::uuid,v_modifier->>'group_name',v_modifier->>'modifier_name',(v_modifier->>'unit_price_cents')::integer);
  end loop;
  insert into public.cart_item_gas_options(organization_id,store_id,cart_item_id,container_type_id,sale_mode,container_code_snapshot,container_name_snapshot,unit_container_price_cents)
  values(p_organization_id,p_store_id,v_item_id,v_type.id,p_sale_mode,v_type.code,v_type.name,v_segment_total);
  select coalesce(sum(line_total_cents),0) into v_subtotal from public.cart_items where cart_id=v_cart_id and validation_status='valid';
  update public.carts set subtotal_cents=v_subtotal,total_cents=greatest(0,v_subtotal-discount_cents+delivery_fee_cents),last_validated_at=now(),updated_at=now() where id=v_cart_id;
  return jsonb_build_object('cart_id',v_cart_id,'item_id',v_item_id,'subtotal_cents',v_subtotal);
end $$;
revoke all on function public.cart_add_gas_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.cart_add_gas_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) to service_role;

-- Checkout canônico preserva o snapshot do modo de venda e o componente de preço segmentado.
create or replace function public.create_order_from_checkout_internal(p_store_id uuid,p_token_hash text,p_order_access_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_cart public.carts%rowtype; v_checkout public.checkout_sessions%rowtype; v_existing public.orders%rowtype; v_customer_id uuid;
  v_order_id uuid; v_order_item_id uuid; v_display_number bigint; v_cart_item public.cart_items%rowtype;
begin
  if p_order_access_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid order access token hash'; end if;
  select * into v_cart from public.carts where store_id=p_store_id and token_hash=p_token_hash for update;
  if v_cart.id is null then raise exception 'cart unavailable'; end if;
  select * into v_existing from public.orders where source_cart_id=v_cart.id;
  if v_existing.id is not null then return jsonb_build_object('order_id',v_existing.id,'display_number',v_existing.display_number,'created',false); end if;
  if v_cart.status<>'active' or v_cart.expires_at<=now() then raise exception 'cart unavailable'; end if;
  select * into v_checkout from public.checkout_sessions where organization_id=v_cart.organization_id and store_id=v_cart.store_id and cart_id=v_cart.id for update;
  if v_checkout.id is null or v_checkout.reviewed_at is null then raise exception 'checkout not reviewed'; end if;
  if v_cart.updated_at>v_checkout.reviewed_at then raise exception 'cart changed after review'; end if;
  if v_checkout.customer_name is null or v_checkout.customer_phone_normalized is null then raise exception 'checkout identity incomplete'; end if;
  if v_checkout.fulfillment_type is null then raise exception 'checkout fulfillment incomplete'; end if;
  if v_checkout.fulfillment_type='delivery' and v_checkout.delivery_quote_status<>'valid' then raise exception 'delivery not validated'; end if;
  if v_checkout.payment_method is null then raise exception 'checkout payment incomplete'; end if;
  if v_checkout.payment_method='cash' and v_checkout.cash_change_for_cents is not null and v_checkout.cash_change_for_cents<v_cart.total_cents then raise exception 'invalid cash change'; end if;
  if exists(select 1 from public.cart_items where cart_id=v_cart.id and validation_status<>'valid') then raise exception 'cart contains invalid items'; end if;
  if not exists(select 1 from public.cart_items where cart_id=v_cart.id) then raise exception 'cart is empty'; end if;

  v_customer_id:=v_checkout.customer_id;
  if v_customer_id is null then
    insert into public.customers(organization_id,name,phone,phone_normalized,email,created_at,updated_at)
    values(v_cart.organization_id,v_checkout.customer_name,v_checkout.customer_phone,v_checkout.customer_phone_normalized,v_checkout.customer_email,now(),now())
    on conflict(organization_id,phone_normalized) where phone_normalized is not null and deleted_at is null
    do update set phone=excluded.phone,email=coalesce(public.customers.email,excluded.email),updated_at=now() returning id into v_customer_id;
  end if;
  update public.checkout_sessions set customer_id=v_customer_id,updated_at=now() where id=v_checkout.id;
  update public.carts set customer_id=v_customer_id where id=v_cart.id;
  insert into public.order_sequences(organization_id,store_id,last_number,updated_at) values(v_cart.organization_id,v_cart.store_id,1,now())
  on conflict(store_id) do update set last_number=public.order_sequences.last_number+1,updated_at=now() returning last_number into v_display_number;

  insert into public.orders(organization_id,store_id,source_cart_id,checkout_session_id,public_access_token_hash,display_number,channel,fulfillment_type,order_status,payment_status,production_status,fulfillment_status,customer_id,customer_name_snapshot,customer_phone_snapshot,customer_email_snapshot,address_postal_code_snapshot,address_street_snapshot,address_number_snapshot,address_complement_snapshot,address_district_snapshot,address_city_snapshot,address_state_snapshot,address_reference_snapshot,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method_snapshot,cash_change_for_cents,delivery_estimated_min_minutes,delivery_estimated_max_minutes)
  values(v_cart.organization_id,v_cart.store_id,v_cart.id,v_checkout.id,p_order_access_token_hash,v_display_number,'digital_menu',v_checkout.fulfillment_type,'pending_confirmation','pending','pending_confirmation','pending',v_customer_id,v_checkout.customer_name,v_checkout.customer_phone,v_checkout.customer_email,v_checkout.address_postal_code,v_checkout.address_street,v_checkout.address_number,v_checkout.address_complement,v_checkout.address_district,v_checkout.address_city,v_checkout.address_state,v_checkout.address_reference,v_cart.subtotal_cents,v_cart.discount_cents,v_cart.delivery_fee_cents,v_cart.total_cents,v_checkout.payment_method,v_checkout.cash_change_for_cents,v_checkout.delivery_estimated_min_minutes,v_checkout.delivery_estimated_max_minutes)
  returning id into v_order_id;

  for v_cart_item in select * from public.cart_items where cart_id=v_cart.id order by created_at,id loop
    insert into public.order_items(organization_id,store_id,order_id,product_id,product_name_snapshot,product_image_url_snapshot,quantity,note,unit_base_price_cents,unit_modifiers_price_cents,unit_segment_price_cents,unit_total_price_cents,line_total_cents)
    values(v_cart.organization_id,v_cart.store_id,v_order_id,v_cart_item.product_id,v_cart_item.product_name_snapshot,v_cart_item.product_image_url_snapshot,v_cart_item.quantity,v_cart_item.note,v_cart_item.unit_base_price_cents,v_cart_item.unit_modifiers_price_cents,v_cart_item.unit_segment_price_cents,v_cart_item.unit_total_price_cents,v_cart_item.line_total_cents)
    returning id into v_order_item_id;
    insert into public.order_item_modifiers(organization_id,store_id,order_item_id,modifier_group_id,modifier_id,group_name_snapshot,modifier_name_snapshot,unit_price_cents)
    select v_cart.organization_id,v_cart.store_id,v_order_item_id,m.modifier_group_id,m.modifier_id,m.group_name_snapshot,m.modifier_name_snapshot,m.unit_price_cents from public.cart_item_modifiers m where m.cart_item_id=v_cart_item.id order by m.created_at,m.id;
    insert into public.order_item_gas_options(organization_id,store_id,order_item_id,container_type_id,sale_mode,container_code_snapshot,container_name_snapshot,unit_container_price_cents)
    select v_cart.organization_id,v_cart.store_id,v_order_item_id,g.container_type_id,g.sale_mode,g.container_code_snapshot,g.container_name_snapshot,g.unit_container_price_cents from public.cart_item_gas_options g where g.cart_item_id=v_cart_item.id;
  end loop;
  insert into public.order_state_history(organization_id,store_id,order_id,state_domain,from_state,to_state,source) values
    (v_cart.organization_id,v_cart.store_id,v_order_id,'order',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'payment',null,'pending','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'production',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'fulfillment',null,'pending','checkout');
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at)
  values(v_cart.organization_id,v_cart.store_id,'order.created','order',v_order_id,jsonb_build_object('display_number',v_display_number,'channel','digital_menu','fulfillment_type',v_checkout.fulfillment_type,'total_cents',v_cart.total_cents),'pending',0,now());
  update public.carts set status='converted',updated_at=now() where id=v_cart.id;
  return jsonb_build_object('order_id',v_order_id,'display_number',v_display_number,'created',true);
end $$;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text,text) to service_role;

create or replace function private.apply_gas_container_order_transition() returns trigger language plpgsql security definer set search_path='' as $$
declare r record; v_kind text; v_full integer; v_empty integer; v_route integer; v_key text;
begin
  if old.fulfillment_status is not distinct from new.fulfillment_status then return new; end if;
  for r in
    select oi.id as order_item_id,oi.quantity,g.container_type_id,g.sale_mode
    from public.order_items oi join public.order_item_gas_options g on g.order_item_id=oi.id
    where oi.organization_id=new.organization_id and oi.store_id=new.store_id and oi.order_id=new.id and g.container_type_id is not null
  loop
    v_kind:=null; v_full:=0; v_empty:=0; v_route:=0;
    if new.fulfillment_status='picked_up' and old.fulfillment_status is distinct from 'picked_up' then
      v_kind:='dispatch'; v_full:=-r.quantity; v_route:=r.quantity;
    elsif new.fulfillment_status='delivered' and old.fulfillment_status is distinct from 'delivered' then
      v_kind:=case when r.sale_mode='exchange' then 'delivery_exchange' else 'delivery_with_container' end;
      v_route:=-r.quantity; v_empty:=case when r.sale_mode='exchange' then r.quantity else 0 end;
    elsif new.fulfillment_status='picked_up_by_customer' and old.fulfillment_status is distinct from 'picked_up_by_customer' then
      v_kind:=case when r.sale_mode='exchange' then 'pickup_exchange' else 'pickup_with_container' end;
      v_full:=-r.quantity; v_empty:=case when r.sale_mode='exchange' then r.quantity else 0 end;
    elsif new.fulfillment_status='canceled' and old.fulfillment_status in ('picked_up','out_for_delivery') then
      v_kind:='route_return'; v_full:=r.quantity; v_route:=-r.quantity;
    end if;
    if v_kind is not null then
      v_key:=new.id::text||':'||r.order_item_id::text||':'||old.fulfillment_status||'->'||new.fulfillment_status;
      insert into public.gas_container_movements(organization_id,store_id,container_type_id,order_id,order_item_id,movement_kind,full_delta,empty_delta,in_route_delta,idempotency_key,metadata)
      values(new.organization_id,new.store_id,r.container_type_id,new.id,r.order_item_id,v_kind,v_full,v_empty,v_route,v_key,jsonb_build_object('from',old.fulfillment_status,'to',new.fulfillment_status,'sale_mode',r.sale_mode))
      on conflict(store_id,idempotency_key) do nothing;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists orders_gas_container_transition on public.orders;
create trigger orders_gas_container_transition after update of fulfillment_status on public.orders for each row execute function private.apply_gas_container_order_transition();
revoke all on function private.apply_gas_container_order_transition() from public,anon,authenticated;

-- Atualiza o motor de mutação modular para o catálogo v2 e bloqueia o add-on fora do plano.
create or replace function public.set_store_modules_internal(
  p_organization_id uuid,p_store_id uuid,p_changes jsonb,p_source text,p_actor_user_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_revision bigint; v_business_type text; v_item jsonb; v_key text; v_enabled boolean; v_before jsonb; v_after jsonb; v_new_revision bigint; v_ent record;
begin
  if p_organization_id is null or p_store_id is null or p_actor_user_id is null then raise exception 'organization, store and actor are required'; end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'expected module configuration revision is required'; end if;
  if p_source not in ('preset','manual','support') then raise exception 'invalid module configuration source'; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)=0 then raise exception 'module changes must be a non-empty array'; end if;
  select s.module_config_revision,s.business_type into v_revision,v_business_type from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id for update;
  if v_revision is null then raise exception 'store not found'; end if;
  if v_revision<>p_expected_revision then raise exception 'module configuration revision conflict'; end if;
  if p_source<>'support' and not exists(
    select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.status='active' and (
      exists(select 1 from public.roles r join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id and p.key='stores.manage' where r.id=m.role_id and r.organization_id=p_organization_id)
      or exists(select 1 from public.user_store_roles usr join public.roles r on r.id=usr.role_id and r.organization_id=usr.organization_id join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id and p.key='stores.manage' where usr.organization_id=p_organization_id and usr.store_id=p_store_id and usr.user_id=p_actor_user_id)
    )
  ) then raise exception 'actor cannot manage store modules'; end if;
  select coalesce(jsonb_object_agg(sm.module_key,sm.enabled),'{}'::jsonb) into v_before from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id;
  for v_item in select value from jsonb_array_elements(p_changes) loop
    v_key:=trim(coalesce(v_item->>'module_key',''));
    if v_key not in ('dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver','inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings') then raise exception 'unknown module key: %',v_key; end if;
    if not(v_item?'enabled') then raise exception 'enabled is required for module %',v_key; end if;
    v_enabled:=(v_item->>'enabled')::boolean;
    if v_key='gas_containers' and v_enabled then
      if v_business_type<>'gas' then raise exception 'gas_containers is not supported by business profile'; end if;
      select * into v_ent from private.organization_entitlement(p_organization_id,'module.gas_containers',now());
      if v_ent.feature_id is null or not coalesce(v_ent.enabled,false) then raise exception 'feature is not entitled for organization'; end if;
    end if;
    insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by)
    values(p_organization_id,p_store_id,v_key,v_enabled,p_source,2,p_actor_user_id)
    on conflict(store_id,module_key) do update set enabled=excluded.enabled,configuration_source=excluded.configuration_source,catalog_version=excluded.catalog_version,updated_by=excluded.updated_by,updated_at=now();
  end loop;
  if v_business_type<>'restaurant' and exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='dining' and sm.enabled) then raise exception 'dining is not supported by business profile'; end if;
  if v_business_type<>'gas' and exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and sm.enabled) then raise exception 'gas_containers is not supported by business profile'; end if;
  if exists(
    with dependencies(module_key,dependency_key) as(values ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),('gas_containers','orders'),('gas_containers','catalog'))
    select 1 from dependencies d join public.store_modules m on m.organization_id=p_organization_id and m.store_id=p_store_id and m.module_key=d.module_key and m.enabled left join public.store_modules dep on dep.organization_id=p_organization_id and dep.store_id=p_store_id and dep.module_key=d.dependency_key and dep.enabled where dep.module_key is null
  ) then raise exception 'module dependency violation'; end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='cash' and not sm.enabled) and exists(select 1 from public.cash_sessions cs where cs.organization_id=p_organization_id and cs.store_id=p_store_id and cs.status='open') then raise exception 'cash_session_open'; end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='dining' and not sm.enabled) and exists(select 1 from public.tabs t where t.organization_id=p_organization_id and t.store_id=p_store_id and t.status in ('open','settling')) then raise exception 'dining_tab_open'; end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key in ('deliveries','driver') and not sm.enabled) and exists(select 1 from public.deliveries d where d.organization_id=p_organization_id and d.store_id=p_store_id and d.delivered_at is null and d.canceled_at is null) then raise exception 'delivery_in_progress'; end if;
  if exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and not sm.enabled) and exists(select 1 from public.gas_container_balances b where b.organization_id=p_organization_id and b.store_id=p_store_id and b.in_route_quantity<>0) then raise exception 'gas_containers_in_route'; end if;
  select coalesce(jsonb_object_agg(sm.module_key,sm.enabled),'{}'::jsonb) into v_after from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id;
  if v_before=v_after then return jsonb_build_object('changed',false,'revision',v_revision); end if;
  v_new_revision:=v_revision+1;
  update public.stores set module_config_revision=v_new_revision,module_catalog_version=2,module_preset=case when p_source in ('manual','support') then 'custom' else module_preset end,updated_at=now() where id=p_store_id and organization_id=p_organization_id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(p_organization_id,p_store_id,p_actor_user_id,'store.modules.changed','store',p_store_id,jsonb_build_object('modules',v_before,'revision',v_revision),jsonb_build_object('modules',v_after,'revision',v_new_revision,'source',p_source));
  return jsonb_build_object('changed',true,'revision',v_new_revision);
end $$;
revoke all on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_modules_internal(uuid,uuid,jsonb,text,uuid,bigint) to service_role;

create or replace function private.bootstrap_organization_modular(
  organization_name text,store_name text,store_slug text,p_business_type text,p_module_preset text,p_enabled_modules text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=(select auth.uid()); v_result jsonb; v_org_id uuid; v_store_id uuid; v_existing_org_id uuid; v_existing_store_id uuid; v_ent record;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text,0));
  select m.organization_id,s.id into v_existing_org_id,v_existing_store_id from public.organization_members m join public.stores s on s.organization_id=m.organization_id and s.status='active' where m.user_id=actor_id and m.status='active' order by s.is_primary desc,s.created_at,s.id limit 1;
  if v_existing_org_id is not null and v_existing_store_id is not null then return jsonb_build_object('organization_id',v_existing_org_id,'store_id',v_existing_store_id,'reused',true); end if;
  if p_business_type not in ('restaurant','gas','generic_commerce') then raise exception 'invalid business type'; end if;
  if p_module_preset not in ('essential','complete','custom') then raise exception 'invalid module preset'; end if;
  if p_enabled_modules is null then raise exception 'enabled modules are required'; end if;
  if exists(select 1 from unnest(p_enabled_modules)x(module_key) where module_key not in ('dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver','inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings')) then raise exception 'unknown module key'; end if;
  if not(array['dashboard','orders','catalog','customers','settings']::text[]<@p_enabled_modules) then raise exception 'core modules are required'; end if;
  if p_business_type<>'restaurant' and 'dining'=any(p_enabled_modules) then raise exception 'dining is not supported by business profile'; end if;
  if p_business_type<>'gas' and 'gas_containers'=any(p_enabled_modules) then raise exception 'gas_containers is not supported by business profile'; end if;
  if exists(with dependencies(module_key,dependency_key) as(values ('dining','orders'),('dining','catalog'),('pdv','orders'),('pdv','catalog'),('cash','orders'),('fiscal','orders'),('production','orders'),('deliveries','orders'),('driver','deliveries'),('purchases','inventory'),('purchases','suppliers'),('growth','customers'),('growth','orders'),('gas_containers','orders'),('gas_containers','catalog')) select 1 from dependencies d where d.module_key=any(p_enabled_modules) and not(d.dependency_key=any(p_enabled_modules))) then raise exception 'module dependency violation'; end if;
  v_result:=private.bootstrap_organization(organization_name,store_name,store_slug); v_org_id:=(v_result->>'organization_id')::uuid; v_store_id:=(v_result->>'store_id')::uuid;
  if 'gas_containers'=any(p_enabled_modules) then select * into v_ent from private.organization_entitlement(v_org_id,'module.gas_containers',now()); if v_ent.feature_id is null or not coalesce(v_ent.enabled,false) then raise exception 'feature is not entitled for organization'; end if; end if;
  update public.stores set business_type=p_business_type,module_preset=p_module_preset,module_catalog_version=2,module_config_revision=0,updated_at=now() where id=v_store_id and organization_id=v_org_id;
  with module_catalog(module_key) as(values ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),('deliveries'),('driver'),('inventory'),('gas_containers'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings'))
  insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version,updated_by) select v_org_id,v_store_id,c.module_key,c.module_key=any(p_enabled_modules),'preset',2,actor_id from module_catalog c
  on conflict(store_id,module_key) do update set enabled=excluded.enabled,configuration_source=excluded.configuration_source,catalog_version=excluded.catalog_version,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data) values(v_org_id,v_store_id,actor_id,'organization.modules.bootstrap','store',v_store_id,jsonb_build_object('business_type',p_business_type,'preset',p_module_preset,'enabled_modules',to_jsonb(p_enabled_modules),'catalog_version',2));
  return v_result||jsonb_build_object('business_type',p_business_type,'module_preset',p_module_preset,'reused',false);
end $$;
revoke all on function private.bootstrap_organization_modular(text,text,text,text,text,text[]) from public;
grant execute on function private.bootstrap_organization_modular(text,text,text,text,text,text[]) to authenticated;

create or replace function public.set_store_module_preset_internal(
  p_organization_id uuid,p_store_id uuid,p_module_preset text,p_enabled_modules text[],p_actor_user_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_changes jsonb; v_result jsonb; v_old_preset text; v_revision bigint; v_changed boolean;
begin
  if p_module_preset not in ('essential','complete') then raise exception 'invalid restorable preset'; end if;
  if p_enabled_modules is null then raise exception 'enabled modules are required'; end if;
  select s.module_preset into v_old_preset from public.stores s where s.organization_id=p_organization_id and s.id=p_store_id;
  if v_old_preset is null then raise exception 'store not found'; end if;
  select jsonb_agg(jsonb_build_object('module_key',c.module_key,'enabled',c.module_key=any(p_enabled_modules))) into v_changes
  from(values ('dashboard'),('orders'),('conversations'),('dining'),('catalog'),('pdv'),('cash'),('finance'),('fiscal'),('production'),('deliveries'),('driver'),('inventory'),('gas_containers'),('suppliers'),('purchases'),('customers'),('growth'),('scale'),('team'),('settings'))c(module_key);
  v_result:=public.set_store_modules_internal(p_organization_id,p_store_id,v_changes,'preset',p_actor_user_id,p_expected_revision);
  v_changed:=coalesce((v_result->>'changed')::boolean,false); v_revision:=coalesce((v_result->>'revision')::bigint,p_expected_revision);
  if v_old_preset is distinct from p_module_preset then
    if not v_changed then v_revision:=v_revision+1; end if;
    update public.stores set module_preset=p_module_preset,module_config_revision=v_revision,module_catalog_version=2,updated_at=now() where organization_id=p_organization_id and id=p_store_id;
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(p_organization_id,p_store_id,p_actor_user_id,'store.modules.preset_changed','store',p_store_id,jsonb_build_object('preset',v_old_preset),jsonb_build_object('preset',p_module_preset,'revision',v_revision,'catalog_version',2));
  end if;
  return jsonb_build_object('changed',v_changed or v_old_preset is distinct from p_module_preset,'revision',v_revision,'preset',p_module_preset);
end $$;
revoke all on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_store_module_preset_internal(uuid,uuid,text,text[],uuid,bigint) to service_role;
