-- PedeAqui — Milestone 18 [175]–[185]
-- Entregadores e execução logística sem duplicar o estado mestre do pedido.

insert into public.permissions (key, description) values
  ('delivery.assign', 'Atribuir e reatribuir entregadores aos pedidos'),
  ('delivery.update', 'Atualizar o andamento de entregas atribuídas')
on conflict (key) do update set description = excluded.description;

-- Backfill para organizações existentes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('delivery.view','delivery.manage','delivery.assign','delivery.update')
where r.key in ('owner','manager') on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('delivery.view','delivery.assign','delivery.update')
where r.key = 'attendant' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('delivery.view','delivery.update')
where r.key = 'driver' on conflict do nothing;

-- Para novos papéis não-owner/manager. Owner e manager recebem o catálogo inteiro no bootstrap.
create or replace function private.grant_delivery_operations_permissions_for_role()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.key = 'attendant' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('delivery.view','delivery.assign','delivery.update') on conflict do nothing;
  elsif new.key = 'driver' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('delivery.view','delivery.update') on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_delivery_operations_permissions_for_role() from public, anon, authenticated;
drop trigger if exists roles_grant_delivery_operations_permissions on public.roles;
create trigger roles_grant_delivery_operations_permissions after insert on public.roles
for each row execute function private.grant_delivery_operations_permissions_for_role();

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 100),
  phone text check (phone is null or char_length(trim(phone)) between 8 and 30),
  active boolean not null default true,
  on_duty boolean not null default false,
  max_active_deliveries integer not null default 3 check (max_active_deliveries between 1 and 20),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint drivers_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint drivers_org_store_id_unique unique (organization_id,store_id,id)
);
create unique index if not exists drivers_store_user_unique_idx on public.drivers(store_id,user_id)
where user_id is not null and deleted_at is null;
create index if not exists drivers_store_availability_idx on public.drivers(organization_id,store_id,active,on_duty,name)
where deleted_at is null;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid not null,
  driver_id uuid,
  promised_by_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_store_same_org_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint deliveries_order_same_store_fk foreign key (organization_id,store_id,order_id)
    references public.orders(organization_id,store_id,id) on delete restrict,
  constraint deliveries_driver_same_store_fk foreign key (organization_id,store_id,driver_id)
    references public.drivers(organization_id,store_id,id) on delete restrict,
  constraint deliveries_org_store_id_unique unique (organization_id,store_id,id),
  constraint deliveries_order_unique unique (order_id)
);
create index if not exists deliveries_store_driver_idx on public.deliveries(organization_id,store_id,driver_id,updated_at desc);
create index if not exists deliveries_store_order_idx on public.deliveries(organization_id,store_id,order_id);

create table if not exists public.delivery_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  delivery_id uuid not null,
  order_id uuid not null,
  event_type text not null check (event_type in ('created','assigned','reassigned','picked_up','out_for_delivery','delivered','canceled')),
  from_driver_id uuid,
  to_driver_id uuid,
  reason text check (reason is null or char_length(trim(reason)) between 3 and 500),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 240),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint delivery_history_delivery_same_store_fk foreign key (organization_id,store_id,delivery_id)
    references public.deliveries(organization_id,store_id,id) on delete restrict,
  constraint delivery_history_order_same_store_fk foreign key (organization_id,store_id,order_id)
    references public.orders(organization_id,store_id,id) on delete restrict,
  constraint delivery_history_from_driver_fk foreign key (organization_id,store_id,from_driver_id)
    references public.drivers(organization_id,store_id,id) on delete restrict,
  constraint delivery_history_to_driver_fk foreign key (organization_id,store_id,to_driver_id)
    references public.drivers(organization_id,store_id,id) on delete restrict,
  constraint delivery_history_org_idem_unique unique (organization_id,idempotency_key)
);
create index if not exists delivery_history_delivery_created_idx on public.delivery_history(organization_id,store_id,delivery_id,created_at,id);

alter table public.drivers enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_history enable row level security;

revoke all on table public.drivers, public.deliveries, public.delivery_history from anon, authenticated;
grant select on table public.drivers, public.deliveries, public.delivery_history to authenticated;
grant select,insert,update,delete on table public.drivers, public.deliveries, public.delivery_history to service_role;

create policy drivers_view on public.drivers for select to authenticated using (
  private.has_permission(organization_id,store_id,'delivery.manage')
  or private.has_permission(organization_id,store_id,'delivery.assign')
  or (user_id = (select auth.uid()) and private.has_permission(organization_id,store_id,'delivery.view'))
);
create policy deliveries_view on public.deliveries for select to authenticated using (
  private.has_permission(organization_id,store_id,'delivery.assign')
  or private.has_permission(organization_id,store_id,'delivery.manage')
  or exists (
    select 1 from public.drivers d
    where d.organization_id=deliveries.organization_id and d.store_id=deliveries.store_id
      and d.id=deliveries.driver_id and d.user_id=(select auth.uid()) and d.deleted_at is null
      and private.has_permission(deliveries.organization_id,deliveries.store_id,'delivery.view')
  )
);
create policy delivery_history_view on public.delivery_history for select to authenticated using (
  private.has_permission(organization_id,store_id,'delivery.assign')
  or private.has_permission(organization_id,store_id,'delivery.manage')
  or exists (
    select 1 from public.deliveries x join public.drivers d on d.id=x.driver_id and d.store_id=x.store_id
    where x.id=delivery_history.delivery_id and d.user_id=(select auth.uid()) and d.deleted_at is null
      and private.has_permission(delivery_history.organization_id,delivery_history.store_id,'delivery.view')
  )
);

create or replace function private.prevent_delivery_history_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'delivery history is immutable'; end; $$;
revoke all on function private.prevent_delivery_history_mutation() from public, anon, authenticated;
drop trigger if exists delivery_history_immutable on public.delivery_history;
create trigger delivery_history_immutable before update or delete on public.delivery_history
for each row execute function private.prevent_delivery_history_mutation();
