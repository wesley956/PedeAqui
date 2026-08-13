-- PedeAqui — Milestone 20 [199]–[210]
-- Compras e fornecedores. Custos em centavos; quantidades/conversões em NUMERIC exato.

insert into public.permissions (key, description) values
  ('suppliers.view', 'Visualizar fornecedores e catálogos de compra'),
  ('suppliers.manage', 'Gerenciar fornecedores e condições comerciais'),
  ('purchases.view', 'Visualizar pedidos e recebimentos de compra'),
  ('purchases.manage', 'Criar e gerenciar pedidos de compra'),
  ('purchases.receive', 'Registrar recebimentos e correções de compra')
on conflict (key) do update set description=excluded.description;

-- Organizações existentes. Owner/manager recebem o conjunto operacional completo.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p
  on p.key in ('suppliers.view','suppliers.manage','purchases.view','purchases.manage','purchases.receive')
where r.key in ('owner','manager') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p
  on p.key in ('suppliers.view','purchases.view')
where r.key='financial' on conflict do nothing;

-- Novos papéis financial criados depois desta migration recebem somente leitura de Compras.
create or replace function private.grant_purchase_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='financial' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('suppliers.view','purchases.view')
    on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_purchase_permissions_for_role() from public,anon,authenticated;
drop trigger if exists roles_grant_purchase_permissions on public.roles;
create trigger roles_grant_purchase_permissions after insert on public.roles
for each row execute function private.grant_purchase_permissions_for_role();

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  legal_name text,
  tax_document text,
  email text,
  phone text,
  notes text check (notes is null or char_length(notes)<=2000),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint suppliers_org_id_unique unique (organization_id,id)
);
create unique index suppliers_org_document_unique_idx on public.suppliers(organization_id,lower(tax_document))
where tax_document is not null and deleted_at is null;
create index suppliers_org_name_idx on public.suppliers(organization_id,name) where deleted_at is null;

create table public.supplier_stores (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  supplier_id uuid not null,
  active boolean not null default true,
  lead_time_days integer not null default 0 check (lead_time_days between 0 and 365),
  minimum_order_cents bigint not null default 0 check (minimum_order_cents>=0),
  notes text check (notes is null or char_length(notes)<=1000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,store_id,supplier_id),
  constraint supplier_stores_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint supplier_stores_supplier_fk foreign key (organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete cascade
);

create table public.supplier_inventory_items (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  supplier_id uuid not null,
  inventory_item_id uuid not null,
  active boolean not null default true,
  is_preferred boolean not null default false,
  supplier_sku text,
  purchase_unit_label text not null default 'un' check (char_length(trim(purchase_unit_label)) between 1 and 40),
  base_units_per_purchase_unit numeric(18,6) not null check (base_units_per_purchase_unit>0),
  last_unit_cost_cents bigint not null default 0 check (last_unit_cost_cents>=0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,store_id,supplier_id,inventory_item_id),
  constraint supplier_inventory_supplier_store_fk foreign key (organization_id,store_id,supplier_id)
    references public.supplier_stores(organization_id,store_id,supplier_id) on delete cascade,
  constraint supplier_inventory_item_store_fk foreign key (organization_id,store_id,inventory_item_id)
    references public.inventory_item_stores(organization_id,store_id,inventory_item_id) on delete restrict
);
create unique index supplier_inventory_preferred_unique_idx
on public.supplier_inventory_items(organization_id,store_id,inventory_item_id)
where is_preferred=true and active=true;

create table public.purchase_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  next_number bigint not null default 1 check (next_number>0),
  primary key (organization_id,store_id),
  constraint purchase_sequences_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  supplier_id uuid not null,
  display_number bigint not null check (display_number>0),
  status text not null default 'draft' check (status in ('draft','sent','partially_received','received','cancelled')),
  expected_at timestamptz,
  notes text check (notes is null or char_length(notes)<=2000),
  subtotal_cents bigint not null default 0 check (subtotal_cents>=0),
  sent_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_org_store_id_unique unique (organization_id,store_id,id),
  constraint purchase_orders_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint purchase_orders_supplier_store_fk foreign key (organization_id,store_id,supplier_id)
    references public.supplier_stores(organization_id,store_id,supplier_id) on delete restrict,
  constraint purchase_orders_display_unique unique (organization_id,store_id,display_number)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  purchase_order_id uuid not null,
  inventory_item_id uuid not null,
  inventory_name_snapshot text not null,
  base_unit_snapshot text not null check (base_unit_snapshot in ('unit','g','ml')),
  purchase_unit_label_snapshot text not null,
  base_units_per_purchase_unit_snapshot numeric(18,6) not null check (base_units_per_purchase_unit_snapshot>0),
  ordered_purchase_quantity numeric(18,6) not null check (ordered_purchase_quantity>0),
  received_purchase_quantity numeric(18,6) not null default 0 check (received_purchase_quantity>=0),
  unit_cost_cents bigint not null check (unit_cost_cents>=0),
  line_total_cents bigint not null check (line_total_cents>=0),
  created_at timestamptz not null default now(),
  constraint purchase_order_items_order_fk foreign key (organization_id,store_id,purchase_order_id)
    references public.purchase_orders(organization_id,store_id,id) on delete cascade,
  constraint purchase_order_items_inventory_fk foreign key (organization_id,store_id,inventory_item_id)
    references public.inventory_item_stores(organization_id,store_id,inventory_item_id) on delete restrict,
  constraint purchase_order_items_order_item_unique unique (purchase_order_id,inventory_item_id),
  constraint purchase_order_items_org_store_id_unique unique (organization_id,store_id,id)
);

create table public.purchase_order_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  purchase_order_id uuid not null,
  from_status text,
  to_status text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchase_order_history_order_fk foreign key (organization_id,store_id,purchase_order_id)
    references public.purchase_orders(organization_id,store_id,id) on delete cascade
);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  purchase_order_id uuid not null,
  receipt_kind text not null default 'receipt' check (receipt_kind in ('receipt','correction')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 240),
  reference text,
  notes text check (notes is null or char_length(notes)<=2000),
  corrects_receipt_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchase_receipts_order_fk foreign key (organization_id,store_id,purchase_order_id)
    references public.purchase_orders(organization_id,store_id,id) on delete restrict,
  constraint purchase_receipts_corrects_fk foreign key (corrects_receipt_id)
    references public.purchase_receipts(id) on delete restrict,
  constraint purchase_receipts_org_idem_unique unique (organization_id,idempotency_key),
  constraint purchase_receipts_org_store_id_unique unique (organization_id,store_id,id)
);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  receipt_id uuid not null,
  purchase_order_item_id uuid not null,
  purchase_quantity_delta numeric(18,6) not null check (purchase_quantity_delta<>0),
  base_quantity_delta numeric(18,6) not null check (base_quantity_delta<>0),
  unit_cost_cents bigint not null check (unit_cost_cents>=0),
  unit_cost_micros_per_base_unit bigint not null check (unit_cost_micros_per_base_unit>=0),
  line_total_cents bigint not null check (line_total_cents>=0),
  reason text,
  inventory_movement_id uuid,
  created_at timestamptz not null default now(),
  constraint purchase_receipt_items_receipt_fk foreign key (organization_id,store_id,receipt_id)
    references public.purchase_receipts(organization_id,store_id,id) on delete restrict,
  constraint purchase_receipt_items_order_item_fk foreign key (organization_id,store_id,purchase_order_item_id)
    references public.purchase_order_items(organization_id,store_id,id) on delete restrict,
  constraint purchase_receipt_items_movement_fk foreign key (inventory_movement_id)
    references public.inventory_movements(id) on delete restrict
);

alter table public.suppliers enable row level security;
alter table public.supplier_stores enable row level security;
alter table public.supplier_inventory_items enable row level security;
alter table public.purchase_sequences enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_order_history enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

revoke all on table public.suppliers,public.supplier_stores,public.supplier_inventory_items,public.purchase_sequences,
  public.purchase_orders,public.purchase_order_items,public.purchase_order_history,public.purchase_receipts,public.purchase_receipt_items
from anon,authenticated;
grant select,insert,update,delete on table public.suppliers,public.supplier_stores,public.supplier_inventory_items,public.purchase_sequences,
  public.purchase_orders,public.purchase_order_items,public.purchase_order_history,public.purchase_receipts,public.purchase_receipt_items
to service_role;

create or replace function private.prevent_purchase_history_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'purchase history is immutable'; end; $$;
revoke all on function private.prevent_purchase_history_mutation() from public,anon,authenticated;
create trigger purchase_order_history_immutable before update or delete on public.purchase_order_history
for each row execute function private.prevent_purchase_history_mutation();
create trigger purchase_receipts_immutable before update or delete on public.purchase_receipts
for each row execute function private.prevent_purchase_history_mutation();
create trigger purchase_receipt_items_immutable before update or delete on public.purchase_receipt_items
for each row execute function private.prevent_purchase_history_mutation();
