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

-- Bootstrap controlado: somente restaurantes que possuem exatamente UMA categoria
-- ativa chamada Bebidas recebem o relacionamento persistido. Depois disso o runtime
-- trabalha exclusivamente com category_id; o label não vira regra permanente.
insert into public.store_complement_categories(organization_id, store_id, category_id, sort_order)
select c.organization_id, c.store_id, c.id, 0
from public.categories c
join public.stores s on s.id=c.store_id and s.organization_id=c.organization_id
where s.business_type='restaurant'
  and c.active=true
  and c.deleted_at is null
  and lower(trim(c.name))='bebidas'
  and 1=(select count(*) from public.categories c2 where c2.store_id=c.store_id and c2.organization_id=c.organization_id and c2.active=true and c2.deleted_at is null and lower(trim(c2.name))='bebidas')
on conflict(store_id, category_id) do nothing;

create or replace function public.replace_complement_categories_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_rows jsonb,
  p_actor_user_id uuid
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  r jsonb;
  v_category_id uuid;
  v_sort_order integer;
  v_count integer:=0;
begin
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb))<>'array' then raise exception 'invalid complement categories'; end if;
  if not exists(select 1 from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id) then raise exception 'store unavailable'; end if;

  delete from public.store_complement_categories
  where organization_id=p_organization_id and store_id=p_store_id;

  for r in select value from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_category_id:=(r->>'category_id')::uuid;
    v_sort_order:=coalesce((r->>'sort_order')::integer,0);
    if v_sort_order<0 or v_sort_order>10000 then raise exception 'invalid complement category order'; end if;
    if not exists(
      select 1 from public.categories c
      where c.id=v_category_id and c.organization_id=p_organization_id and c.store_id=p_store_id and c.deleted_at is null
    ) then raise exception 'complement category does not belong to store'; end if;
    insert into public.store_complement_categories(organization_id,store_id,category_id,sort_order,created_by)
    values(p_organization_id,p_store_id,v_category_id,v_sort_order,p_actor_user_id);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.replace_complement_categories_internal(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.replace_complement_categories_internal(uuid,uuid,jsonb,uuid) to service_role;
