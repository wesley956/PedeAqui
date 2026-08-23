-- PedeAqui — PA-PUBLIC-UX-003 / #752
-- Categorias sugeridas durante a montagem do pedido. É merchandising da loja,
-- não módulo/entitlement e nunca altera o catálogo ou histórico existente.

create table if not exists public.store_complement_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_complement_categories_store_category_unique unique (store_id, category_id)
);

create index if not exists store_complement_categories_order_idx
  on public.store_complement_categories(store_id, sort_order, created_at);

alter table public.store_complement_categories enable row level security;
revoke all on table public.store_complement_categories from anon, authenticated;
grant select, insert, update, delete on table public.store_complement_categories to service_role;

-- Segurança adicional no banco: a categoria precisa pertencer à mesma organização/unidade.
create or replace function private.enforce_complement_category_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and c.organization_id = new.organization_id
      and c.store_id = new.store_id
      and c.deleted_at is null
  ) then
    raise exception 'complement category does not belong to store';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_complement_category_scope() from public, anon, authenticated;

drop trigger if exists store_complement_categories_scope on public.store_complement_categories;
create trigger store_complement_categories_scope
before insert or update of organization_id, store_id, category_id
on public.store_complement_categories
for each row execute function private.enforce_complement_category_scope();
