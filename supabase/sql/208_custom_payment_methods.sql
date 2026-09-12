-- PedeAqui — formas de pagamento personalizadas por unidade.
-- Mantém os quatro métodos nativos e adiciona uma categoria técnica estável `custom`.

create table if not exists public.store_custom_payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 60),
  enabled boolean not null default true,
  sort_order integer not null default 100 check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_custom_payment_methods_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint store_custom_payment_methods_org_store_id_unique
    unique (organization_id, store_id, id)
);

create unique index if not exists store_custom_payment_methods_name_unique
  on public.store_custom_payment_methods (store_id, lower(trim(name)))
  where archived_at is null;

create index if not exists store_custom_payment_methods_org_store_idx
  on public.store_custom_payment_methods (organization_id, store_id, enabled, sort_order)
  where archived_at is null;

alter table public.store_custom_payment_methods enable row level security;

grant select, insert, update, delete on table public.store_custom_payment_methods to authenticated, service_role;

create policy store_custom_payment_methods_view
on public.store_custom_payment_methods for select to authenticated
using (private.can_access_store(organization_id, store_id));

create policy store_custom_payment_methods_insert
on public.store_custom_payment_methods for insert to authenticated
with check (private.has_permission(organization_id, store_id, 'stores.manage'));

create policy store_custom_payment_methods_update
on public.store_custom_payment_methods for update to authenticated
using (private.has_permission(organization_id, store_id, 'stores.manage'))
with check (private.has_permission(organization_id, store_id, 'stores.manage'));

create policy store_custom_payment_methods_delete
on public.store_custom_payment_methods for delete to authenticated
using (private.has_permission(organization_id, store_id, 'stores.manage'));

alter table public.checkout_sessions
  add column if not exists custom_payment_method_id uuid,
  add column if not exists custom_payment_method_name text;

alter table public.checkout_sessions
  drop constraint if exists checkout_sessions_payment_method_check;
alter table public.checkout_sessions
  add constraint checkout_sessions_payment_method_check
  check (payment_method is null or payment_method in ('cash','pix','credit_card','debit_card','custom'));

alter table public.checkout_sessions
  add constraint checkout_sessions_custom_payment_method_fk
  foreign key (organization_id, store_id, custom_payment_method_id)
  references public.store_custom_payment_methods (organization_id, store_id, id)
  on delete set null (custom_payment_method_id);

alter table public.checkout_sessions
  add constraint checkout_sessions_custom_payment_consistency check (
    (payment_method = 'custom' and custom_payment_method_id is not null and char_length(trim(custom_payment_method_name)) between 2 and 60)
    or
    (payment_method is distinct from 'custom' and custom_payment_method_id is null and custom_payment_method_name is null)
  );

alter table public.orders
  add column if not exists custom_payment_method_name_snapshot text;

alter table public.orders
  drop constraint if exists orders_payment_method_snapshot_check;
alter table public.orders
  add constraint orders_payment_method_snapshot_check
  check (payment_method_snapshot in ('cash','pix','credit_card','debit_card','custom'));

alter table public.orders
  add constraint orders_custom_payment_consistency check (
    (payment_method_snapshot = 'custom' and char_length(trim(custom_payment_method_name_snapshot)) between 2 and 60)
    or
    (payment_method_snapshot <> 'custom' and custom_payment_method_name_snapshot is null)
  );

create or replace function public.orders_copy_custom_payment_method_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.payment_method_snapshot = 'custom' then
    select c.custom_payment_method_name
      into new.custom_payment_method_name_snapshot
    from public.checkout_sessions c
    where c.id = new.checkout_session_id
      and c.organization_id = new.organization_id
      and c.store_id = new.store_id;

    if new.custom_payment_method_name_snapshot is null then
      raise exception 'custom payment method snapshot missing';
    end if;
  else
    new.custom_payment_method_name_snapshot := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_copy_custom_payment_method_snapshot on public.orders;
create trigger orders_copy_custom_payment_method_snapshot
before insert on public.orders
for each row execute function public.orders_copy_custom_payment_method_snapshot();
