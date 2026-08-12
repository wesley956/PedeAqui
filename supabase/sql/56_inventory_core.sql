-- PedeAqui — Milestone 19 [186]–[198]
-- Estoque e fichas técnicas. Quantidades usam NUMERIC exato; ledger é fonte de verdade.

insert into public.permissions (key, description) values
  ('inventory.view', 'Visualizar estoque e movimentações'),
  ('inventory.manage', 'Gerenciar insumos e configurações de estoque'),
  ('inventory.adjust', 'Realizar entradas, perdas, ajustes, contagens e transferências'),
  ('recipes.view', 'Visualizar fichas técnicas'),
  ('recipes.manage', 'Criar novas versões de fichas técnicas')
on conflict (key) do update set description = excluded.description;

-- Organizações existentes.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in ('inventory.view','inventory.manage','inventory.adjust','recipes.view','recipes.manage')
where r.key in ('owner','manager') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='recipes.view'
where r.key='kitchen' on conflict do nothing;

-- Novos papéis operacionais. Owner/manager recebem o catálogo completo pelo bootstrap.
create or replace function private.grant_inventory_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='kitchen' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key='recipes.view' on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_inventory_permissions_for_role() from public,anon,authenticated;
drop trigger if exists roles_grant_inventory_permissions on public.roles;
create trigger roles_grant_inventory_permissions after insert on public.roles
for each row execute function private.grant_inventory_permissions_for_role();

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  sku text,
  base_unit text not null check (base_unit in ('unit','g','ml')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint inventory_items_org_id_unique unique (organization_id,id)
);
create unique index inventory_items_org_sku_unique_idx on public.inventory_items(organization_id,lower(sku))
where sku is not null and deleted_at is null;
create index inventory_items_org_name_idx on public.inventory_items(organization_id,name) where deleted_at is null;

create table public.inventory_item_stores (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  inventory_item_id uuid not null,
  active boolean not null default true,
  minimum_quantity numeric(18,6) not null default 0 check (minimum_quantity >= 0),
  allow_negative boolean not null default true,
  average_cost_micros_per_base_unit bigint not null default 0 check (average_cost_micros_per_base_unit >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,store_id,inventory_item_id),
  constraint inventory_item_stores_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint inventory_item_stores_item_fk foreign key (organization_id,inventory_item_id)
    references public.inventory_items(organization_id,id) on delete cascade
);
create index inventory_item_stores_lookup_idx on public.inventory_item_stores(organization_id,store_id,active,inventory_item_id);

create table public.inventory_balances (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(18,6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id,store_id,inventory_item_id),
  constraint inventory_balances_item_store_fk foreign key (organization_id,store_id,inventory_item_id)
    references public.inventory_item_stores(organization_id,store_id,inventory_item_id) on delete cascade
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  inventory_item_id uuid not null,
  movement_type text not null check (movement_type in ('purchase','sale','loss','adjustment','transfer','production','return')),
  quantity_delta numeric(18,6) not null check (quantity_delta <> 0),
  unit_cost_micros bigint not null default 0 check (unit_cost_micros >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 240),
  source_type text,
  source_id uuid,
  order_id uuid,
  transfer_group_id uuid,
  reason text check (reason is null or char_length(trim(reason)) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_item_store_fk foreign key (organization_id,store_id,inventory_item_id)
    references public.inventory_item_stores(organization_id,store_id,inventory_item_id) on delete restrict,
  constraint inventory_movements_order_fk foreign key (organization_id,store_id,order_id)
    references public.orders(organization_id,store_id,id) on delete restrict,
  constraint inventory_movements_org_idem_unique unique (organization_id,idempotency_key)
);
create index inventory_movements_store_item_created_idx on public.inventory_movements(organization_id,store_id,inventory_item_id,created_at desc,id desc);
create index inventory_movements_order_idx on public.inventory_movements(organization_id,store_id,order_id) where order_id is not null;
create index inventory_movements_transfer_idx on public.inventory_movements(organization_id,transfer_group_id) where transfer_group_id is not null;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  target_type text not null check (target_type in ('product','modifier')),
  product_id uuid,
  modifier_id uuid,
  version integer not null check (version > 0),
  active boolean not null default true,
  effective_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recipes_target_check check (
    (target_type='product' and product_id is not null and modifier_id is null)
    or (target_type='modifier' and modifier_id is not null and product_id is null)
  ),
  constraint recipes_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint recipes_product_fk foreign key (organization_id,store_id,product_id)
    references public.products(organization_id,store_id,id) on delete restrict,
  constraint recipes_modifier_fk foreign key (organization_id,store_id,modifier_id)
    references public.modifiers(organization_id,store_id,id) on delete restrict,
  constraint recipes_org_store_id_unique unique (organization_id,store_id,id)
);
create unique index recipes_product_version_unique_idx on public.recipes(organization_id,store_id,product_id,version) where product_id is not null;
create unique index recipes_modifier_version_unique_idx on public.recipes(organization_id,store_id,modifier_id,version) where modifier_id is not null;
create index recipes_product_effective_idx on public.recipes(organization_id,store_id,product_id,effective_at desc,version desc) where product_id is not null;
create index recipes_modifier_effective_idx on public.recipes(organization_id,store_id,modifier_id,effective_at desc,version desc) where modifier_id is not null;

create table public.recipe_items (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  recipe_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(18,6) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (organization_id,store_id,recipe_id,inventory_item_id),
  constraint recipe_items_recipe_fk foreign key (organization_id,store_id,recipe_id)
    references public.recipes(organization_id,store_id,id) on delete restrict,
  constraint recipe_items_inventory_fk foreign key (organization_id,store_id,inventory_item_id)
    references public.inventory_item_stores(organization_id,store_id,inventory_item_id) on delete restrict
);

alter table public.inventory_items enable row level security;
alter table public.inventory_item_stores enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;

-- Dados de estoque/custo passam apenas por camada server-side autorizada.
revoke all on table public.inventory_items, public.inventory_item_stores, public.inventory_balances, public.inventory_movements, public.recipes, public.recipe_items from anon,authenticated;
grant select,insert,update,delete on table public.inventory_items, public.inventory_item_stores, public.inventory_balances, public.inventory_movements, public.recipes, public.recipe_items to service_role;

create or replace function private.prevent_inventory_movement_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'inventory movement ledger is immutable'; end; $$;
revoke all on function private.prevent_inventory_movement_mutation() from public,anon,authenticated;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements for each row execute function private.prevent_inventory_movement_mutation();

create or replace function private.prevent_recipe_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'recipe versions are immutable'; end; $$;
revoke all on function private.prevent_recipe_mutation() from public,anon,authenticated;
create trigger recipes_immutable before update or delete on public.recipes for each row execute function private.prevent_recipe_mutation();
create trigger recipe_items_immutable before update or delete on public.recipe_items for each row execute function private.prevent_recipe_mutation();
