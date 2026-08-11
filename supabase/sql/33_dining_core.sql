-- PedeAqui — bloco [127]–[139]
-- Salão: mesas, comandas, rodadas, divisão de conta e QR público.

insert into public.permissions (key, description) values
  ('dining.view', 'Visualizar mesas, comandas e conta do salão'),
  ('dining.manage', 'Gerenciar mesas, comandas, participantes e transferências'),
  ('dining.order', 'Lançar rodadas do salão e enviar para produção'),
  ('dining.settle', 'Receber e encerrar comandas do salão')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('dining.view','dining.manage','dining.order','dining.settle') where r.key in ('owner','manager') on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('dining.view','dining.manage','dining.order') where r.key = 'waiter' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('dining.view','dining.manage','dining.order','dining.settle') where r.key = 'attendant' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('dining.view','dining.settle') where r.key = 'cashier' on conflict do nothing;

create or replace function private.grant_dining_permissions_for_role()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.key in ('owner','manager') then
    insert into public.role_permissions (role_id, permission_id) select new.id, p.id from public.permissions p where p.key in ('dining.view','dining.manage','dining.order','dining.settle') on conflict do nothing;
  elsif new.key = 'waiter' then
    insert into public.role_permissions (role_id, permission_id) select new.id, p.id from public.permissions p where p.key in ('dining.view','dining.manage','dining.order') on conflict do nothing;
  elsif new.key = 'attendant' then
    insert into public.role_permissions (role_id, permission_id) select new.id, p.id from public.permissions p where p.key in ('dining.view','dining.manage','dining.order','dining.settle') on conflict do nothing;
  elsif new.key = 'cashier' then
    insert into public.role_permissions (role_id, permission_id) select new.id, p.id from public.permissions p where p.key in ('dining.view','dining.settle') on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_dining_permissions_for_role() from public, anon, authenticated;
drop trigger if exists roles_grant_dining_permissions on public.roles;
create trigger roles_grant_dining_permissions after insert on public.roles for each row execute function private.grant_dining_permissions_for_role();

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, store_id uuid not null,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'), name text not null check (char_length(trim(name)) between 1 and 80), capacity integer not null default 4 check (capacity between 1 and 100),
  status text not null default 'available' check (status in ('available','occupied','reserved','cleaning','disabled')), area text check (area is null or char_length(trim(area)) between 1 and 80), sort_order integer not null default 0 check (sort_order >= 0),
  position_x numeric(8,2), position_y numeric(8,2), qr_enabled boolean not null default false,
  public_code text not null default encode(gen_random_bytes(15), 'hex') check (public_code ~ '^[0-9a-f]{30}$'), opened_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint dining_tables_store_same_org_fk foreign key (organization_id, store_id) references public.stores (organization_id, id) on delete cascade,
  constraint dining_tables_org_store_id_unique unique (organization_id, store_id, id), constraint dining_tables_store_code_unique unique (store_id, code), constraint dining_tables_public_code_unique unique (public_code)
);
create table if not exists public.tab_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade, store_id uuid primary key, last_number bigint not null default 0 check (last_number >= 0), updated_at timestamptz not null default now(),
  constraint tab_sequences_store_same_org_fk foreign key (organization_id, store_id) references public.stores (organization_id, id) on delete cascade
);
create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, store_id uuid not null, table_id uuid not null,
  display_number bigint not null check (display_number > 0), status text not null default 'open' check (status in ('open','settling','closed','canceled')), guest_count integer not null default 1 check (guest_count between 1 and 100),
  label text check (label is null or char_length(trim(label)) between 1 and 120), customer_id uuid, opened_by uuid references auth.users(id) on delete set null, closed_by uuid references auth.users(id) on delete set null,
  canceled_by uuid references auth.users(id) on delete set null, opened_at timestamptz not null default now(), settling_at timestamptz, closed_at timestamptz, canceled_at timestamptz, cancel_reason text, version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint tabs_store_same_org_fk foreign key (organization_id, store_id) references public.stores (organization_id, id) on delete cascade,
  constraint tabs_table_same_store_fk foreign key (organization_id, store_id, table_id) references public.tables (organization_id, store_id, id) on delete restrict,
  constraint tabs_customer_same_org_fk foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete set null (customer_id),
  constraint tabs_org_store_id_unique unique (organization_id, store_id, id), constraint tabs_store_display_unique unique (store_id, display_number),
  constraint tabs_terminal_timestamps check ((status <> 'settling' or settling_at is not null) and (status <> 'closed' or closed_at is not null) and (status <> 'canceled' or canceled_at is not null))
);
create unique index if not exists tabs_one_active_per_table_idx on public.tabs (table_id) where status in ('open','settling');

create table if not exists public.tab_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, store_id uuid not null, tab_id uuid not null, customer_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120), seat_number integer check (seat_number is null or seat_number between 1 and 100), created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint tab_members_tab_same_store_fk foreign key (organization_id, store_id, tab_id) references public.tabs (organization_id, store_id, id) on delete cascade,
  constraint tab_members_customer_same_org_fk foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete set null (customer_id),
  constraint tab_members_org_store_id_unique unique (organization_id, store_id, id)
);
create unique index if not exists tab_members_seat_unique_idx on public.tab_members (tab_id, seat_number) where seat_number is not null;

alter table public.orders add column if not exists tab_id uuid;
alter table public.orders add column if not exists tab_round_number integer;
alter table public.orders drop constraint if exists orders_tab_same_store_fk;
alter table public.orders add constraint orders_tab_same_store_fk foreign key (organization_id, store_id, tab_id) references public.tabs (organization_id, store_id, id) on delete set null (tab_id);
alter table public.orders drop constraint if exists orders_tab_round_consistency;
alter table public.orders add constraint orders_tab_round_consistency check ((tab_id is null and tab_round_number is null) or (tab_id is not null and tab_round_number is not null and tab_round_number > 0));
alter table public.orders drop constraint if exists orders_dining_channel_consistency;
alter table public.orders add constraint orders_dining_channel_consistency check ((tab_id is null and channel not in ('waiter','table_qr')) or (tab_id is not null and channel in ('waiter','table_qr') and fulfillment_type = 'table'));
create unique index if not exists orders_tab_round_unique_idx on public.orders (tab_id, tab_round_number) where tab_id is not null;
create index if not exists orders_tab_created_idx on public.orders (organization_id, store_id, tab_id, created_at) where tab_id is not null;

alter table public.orders alter column payment_method_snapshot drop not null;
alter table public.orders drop constraint if exists orders_payment_method_snapshot_check;
alter table public.orders add constraint orders_payment_method_snapshot_check check (payment_method_snapshot is null or payment_method_snapshot in ('cash','pix','credit_card','debit_card'));
alter table public.orders drop constraint if exists orders_table_payment_method_consistency;
alter table public.orders add constraint orders_table_payment_method_consistency check ((channel in ('waiter','table_qr') and fulfillment_type = 'table') or payment_method_snapshot is not null);

create table if not exists public.tab_item_allocations (
  organization_id uuid not null references public.organizations(id) on delete cascade, store_id uuid not null, tab_id uuid not null, order_item_id uuid not null, tab_member_id uuid not null,
  quantity integer not null check (quantity > 0), created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (order_item_id, tab_member_id),
  constraint tab_item_allocations_tab_same_store_fk foreign key (organization_id, store_id, tab_id) references public.tabs (organization_id, store_id, id) on delete cascade,
  constraint tab_item_allocations_item_same_store_fk foreign key (organization_id, store_id, order_item_id) references public.order_items (organization_id, store_id, id) on delete cascade,
  constraint tab_item_allocations_member_same_store_fk foreign key (organization_id, store_id, tab_member_id) references public.tab_members (organization_id, store_id, id) on delete cascade
);
create index if not exists dining_tables_store_status_idx on public.tables (organization_id, store_id, status, sort_order, code);
create index if not exists tabs_store_status_idx on public.tabs (organization_id, store_id, status, opened_at desc);
create index if not exists tab_members_tab_idx on public.tab_members (organization_id, store_id, tab_id, seat_number, created_at);
create index if not exists tab_allocations_tab_idx on public.tab_item_allocations (organization_id, store_id, tab_id, tab_member_id);

alter table public.tables enable row level security; alter table public.tab_sequences enable row level security; alter table public.tabs enable row level security; alter table public.tab_members enable row level security; alter table public.tab_item_allocations enable row level security;
revoke all on table public.tables, public.tab_sequences, public.tabs, public.tab_members, public.tab_item_allocations from anon, authenticated;
grant select on table public.tables, public.tabs, public.tab_members, public.tab_item_allocations to authenticated;
grant select, insert, update, delete on table public.tables, public.tab_sequences, public.tabs, public.tab_members, public.tab_item_allocations to service_role;
create policy dining_tables_view on public.tables for select to authenticated using (private.has_permission(organization_id, store_id, 'dining.view'));
create policy tabs_view on public.tabs for select to authenticated using (private.has_permission(organization_id, store_id, 'dining.view'));
create policy tab_members_view on public.tab_members for select to authenticated using (private.has_permission(organization_id, store_id, 'dining.view'));
create policy tab_allocations_view on public.tab_item_allocations for select to authenticated using (private.has_permission(organization_id, store_id, 'dining.view'));

create or replace function private.seed_order_payment_intent()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_source text; v_suffix text;
begin
  if new.channel in ('pdv','waiter','table_qr') or new.payment_method_snapshot is null then return new; end if;
  v_source := case when new.channel = 'digital_menu' then 'checkout' else 'system' end;
  v_suffix := case when new.channel = 'digital_menu' then 'checkout' else new.channel end;
  insert into public.payments (organization_id, store_id, order_id, method, status, amount_cents, cash_tendered_cents, idempotency_key, source, metadata)
  values (new.organization_id,new.store_id,new.id,new.payment_method_snapshot,'pending',new.total_cents,case when new.payment_method_snapshot='cash' then new.cash_change_for_cents else null end,'order:'||new.id::text||':'||v_suffix||':payment:1',v_source,jsonb_build_object('seeded_from_order',true,'channel',new.channel))
  on conflict (organization_id, idempotency_key) do nothing;
  return new;
end; $$;
revoke all on function private.seed_order_payment_intent() from public, anon, authenticated;

create or replace function private.assert_tab_allocation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_item public.order_items%rowtype; v_order public.orders%rowtype; v_member public.tab_members%rowtype; v_allocated integer;
begin
  select * into v_item from public.order_items where id = new.order_item_id; if v_item.id is null then raise exception 'order item not found'; end if;
  select * into v_order from public.orders where id = v_item.order_id; if v_order.id is null or v_order.tab_id is distinct from new.tab_id then raise exception 'item is not part of tab'; end if;
  select * into v_member from public.tab_members where id = new.tab_member_id; if v_member.id is null or v_member.tab_id is distinct from new.tab_id then raise exception 'member is not part of tab'; end if;
  select coalesce(sum(a.quantity),0)::integer into v_allocated from public.tab_item_allocations a where a.order_item_id = new.order_item_id and a.tab_member_id <> new.tab_member_id;
  if v_allocated + new.quantity > v_item.quantity then raise exception 'allocated quantity exceeds item quantity'; end if; return new;
end; $$;
revoke all on function private.assert_tab_allocation() from public, anon, authenticated;
drop trigger if exists tab_item_allocations_guard on public.tab_item_allocations;
create trigger tab_item_allocations_guard before insert or update on public.tab_item_allocations for each row execute function private.assert_tab_allocation();
