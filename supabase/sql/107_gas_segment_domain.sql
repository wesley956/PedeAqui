-- PedeAqui — perfil Revenda de Gás [362]–[366]
-- Domínio aditivo de vasilhames, preços segmentados e entitlement comercial.

alter table public.store_modules drop constraint if exists store_modules_module_key_check;
alter table public.store_modules add constraint store_modules_module_key_check check (module_key in (
  'dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production',
  'deliveries','driver','inventory','gas_containers','suppliers','purchases','customers','growth','scale','team','settings'
));

insert into public.store_modules(organization_id,store_id,module_key,enabled,configuration_source,catalog_version)
select s.organization_id,s.id,'gas_containers',false,'migration',2 from public.stores s
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
select p.id,f.id,true,null,'{}'::jsonb from public.plans p cross join public.features f
where p.key in ('professional','management') and f.key='module.gas_containers'
on conflict(plan_id,feature_id) do update set enabled=true,limit_value=null,updated_at=now();

alter table public.cart_items add column if not exists unit_segment_price_cents integer not null default 0;
alter table public.order_items add column if not exists unit_segment_price_cents integer not null default 0;
alter table public.cart_items drop constraint if exists cart_items_math;
alter table public.cart_items drop constraint if exists cart_items_segment_price_nonnegative;
alter table public.cart_items add constraint cart_items_segment_price_nonnegative check(unit_segment_price_cents>=0);
alter table public.cart_items add constraint cart_items_math check(unit_total_price_cents=unit_base_price_cents+unit_modifiers_price_cents+unit_segment_price_cents);
alter table public.order_items drop constraint if exists order_items_unit_total_consistency;
alter table public.order_items drop constraint if exists order_items_segment_price_nonnegative;
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

alter table public.gas_container_types enable row level security;
alter table public.product_gas_profiles enable row level security;
alter table public.cart_item_gas_options enable row level security;
alter table public.order_item_gas_options enable row level security;
alter table public.gas_container_movements enable row level security;
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

-- Add item atômico: o valor do casco vem do perfil do produto e nunca do navegador.
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

create or replace function private.apply_gas_container_order_transition() returns trigger language plpgsql security definer set search_path='' as $$
declare r record; v_kind text; v_full integer; v_empty integer; v_route integer; v_key text;
begin
  if old.fulfillment_status is not distinct from new.fulfillment_status then return new; end if;
  for r in select oi.id order_item_id,oi.quantity,g.container_type_id,g.sale_mode from public.order_items oi join public.order_item_gas_options g on g.order_item_id=oi.id where oi.organization_id=new.organization_id and oi.store_id=new.store_id and oi.order_id=new.id and g.container_type_id is not null loop
    v_kind:=null; v_full:=0; v_empty:=0; v_route:=0;
    if new.fulfillment_status='picked_up' and old.fulfillment_status is distinct from 'picked_up' then v_kind:='dispatch'; v_full:=-r.quantity; v_route:=r.quantity;
    elsif new.fulfillment_status='delivered' and old.fulfillment_status is distinct from 'delivered' then v_kind:=case when r.sale_mode='exchange' then 'delivery_exchange' else 'delivery_with_container' end; v_route:=-r.quantity; v_empty:=case when r.sale_mode='exchange' then r.quantity else 0 end;
    elsif new.fulfillment_status='picked_up_by_customer' and old.fulfillment_status is distinct from 'picked_up_by_customer' then v_kind:=case when r.sale_mode='exchange' then 'pickup_exchange' else 'pickup_with_container' end; v_full:=-r.quantity; v_empty:=case when r.sale_mode='exchange' then r.quantity else 0 end;
    elsif new.fulfillment_status='canceled' and old.fulfillment_status in ('picked_up','out_for_delivery') then v_kind:='route_return'; v_full:=r.quantity; v_route:=-r.quantity;
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
