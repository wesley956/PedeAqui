-- Hardening descoberto durante Milestone 18.
-- O bootstrap concede o catálogo inteiro a owner/manager depois de criar os papéis.
-- Triggers de módulos devem complementar apenas papéis operacionais, evitando PK duplicada.

create or replace function private.grant_cash_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='cashier' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('cash.view','cash.open','cash.supply','cash.withdraw','cash.close') on conflict do nothing;
  elsif new.key='financial' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key='cash.view' on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_cash_permissions_for_role() from public,anon,authenticated;

create or replace function private.grant_conversation_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='attendant' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('conversations.view','conversations.manage','conversations.reply') on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_conversation_permissions_for_role() from public,anon,authenticated;

create or replace function private.grant_dining_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='waiter' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('dining.view','dining.manage','dining.order') on conflict do nothing;
  elsif new.key='attendant' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('dining.view','dining.manage','dining.order','dining.settle') on conflict do nothing;
  elsif new.key='cashier' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key in ('dining.view','dining.settle') on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_dining_permissions_for_role() from public,anon,authenticated;

create or replace function private.grant_growth_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='attendant' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p where p.key='growth.view' on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_growth_permissions_for_role() from public,anon,authenticated;
