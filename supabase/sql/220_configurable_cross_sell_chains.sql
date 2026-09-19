-- PedeAqui — configurable cross-sell chains
-- Regras opcionais por categoria de origem. Quando não existem regras específicas,
-- o runtime continua usando store_complement_categories como fallback global.

create table if not exists public.store_complement_category_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  source_category_id uuid not null references public.categories(id) on delete cascade,
  target_category_id uuid not null references public.categories(id) on delete cascade,
  title text,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_complement_category_rules_source_target_check check (source_category_id <> target_category_id),
  constraint store_complement_category_rules_title_check check (title is null or char_length(trim(title)) between 1 and 80),
  constraint store_complement_category_rules_unique unique (store_id, source_category_id, target_category_id)
);

create index if not exists store_complement_category_rules_source_order_idx
  on public.store_complement_category_rules(organization_id, store_id, source_category_id, active, sort_order);

create index if not exists store_complement_category_rules_target_idx
  on public.store_complement_category_rules(target_category_id);

create index if not exists store_complement_category_rules_created_by_idx
  on public.store_complement_category_rules(created_by)
  where created_by is not null;

alter table public.store_complement_category_rules enable row level security;
revoke all on table public.store_complement_category_rules from anon, authenticated;
grant select, insert, update, delete on table public.store_complement_category_rules to service_role;

drop policy if exists store_complement_category_rules_deny_direct on public.store_complement_category_rules;
create policy store_complement_category_rules_deny_direct
on public.store_complement_category_rules
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function private.enforce_complement_category_rule_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.categories c
     where c.id = new.source_category_id
       and c.organization_id = new.organization_id
       and c.store_id = new.store_id
       and c.deleted_at is null
  ) then
    raise exception 'source complement category does not belong to store';
  end if;

  if not exists (
    select 1
      from public.categories c
     where c.id = new.target_category_id
       and c.organization_id = new.organization_id
       and c.store_id = new.store_id
       and c.deleted_at is null
  ) then
    raise exception 'target complement category does not belong to store';
  end if;

  if new.source_category_id = new.target_category_id then
    raise exception 'source and target complement categories must differ';
  end if;

  new.title := nullif(trim(new.title), '');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_complement_category_rule_scope() from public, anon, authenticated;

drop trigger if exists store_complement_category_rules_scope on public.store_complement_category_rules;
create trigger store_complement_category_rules_scope
before insert or update of organization_id, store_id, source_category_id, target_category_id, title
on public.store_complement_category_rules
for each row execute function private.enforce_complement_category_rule_scope();

create or replace function public.replace_complement_category_rules_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_source_category_id uuid,
  p_rows jsonb,
  p_actor_user_id uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_target_category_id uuid;
  v_title text;
  v_sort_order integer;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid complement category rules';
  end if;

  if not exists (
    select 1 from public.stores s
     where s.id = p_store_id
       and s.organization_id = p_organization_id
  ) then
    raise exception 'store unavailable';
  end if;

  if not exists (
    select 1 from public.categories c
     where c.id = p_source_category_id
       and c.organization_id = p_organization_id
       and c.store_id = p_store_id
       and c.deleted_at is null
  ) then
    raise exception 'source complement category does not belong to store';
  end if;

  delete from public.store_complement_category_rules
   where organization_id = p_organization_id
     and store_id = p_store_id
     and source_category_id = p_source_category_id;

  for r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_target_category_id := (r->>'target_category_id')::uuid;
    v_title := nullif(trim(r->>'title'), '');
    v_sort_order := coalesce((r->>'sort_order')::integer, 0);

    if v_target_category_id = p_source_category_id then
      raise exception 'source and target complement categories must differ';
    end if;
    if v_sort_order < 0 or v_sort_order > 10000 then
      raise exception 'invalid complement category rule order';
    end if;
    if v_title is not null and char_length(v_title) > 80 then
      raise exception 'invalid complement category rule title';
    end if;
    if not exists (
      select 1 from public.categories c
       where c.id = v_target_category_id
         and c.organization_id = p_organization_id
         and c.store_id = p_store_id
         and c.deleted_at is null
    ) then
      raise exception 'target complement category does not belong to store';
    end if;

    insert into public.store_complement_category_rules(
      organization_id,
      store_id,
      source_category_id,
      target_category_id,
      title,
      sort_order,
      active,
      created_by
    ) values (
      p_organization_id,
      p_store_id,
      p_source_category_id,
      v_target_category_id,
      v_title,
      v_sort_order,
      true,
      p_actor_user_id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.replace_complement_category_rules_internal(uuid,uuid,uuid,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.replace_complement_category_rules_internal(uuid,uuid,uuid,jsonb,uuid)
  to service_role;
