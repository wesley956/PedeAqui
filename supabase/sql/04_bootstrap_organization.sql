-- Atomic onboarding for a newly authenticated owner.
-- The privileged function lives in `private`; the public RPC wrapper is SECURITY INVOKER.

create or replace function private.bootstrap_organization(
  organization_name text,
  store_name text,
  store_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_org_id uuid;
  new_store_id uuid;
  owner_role_id uuid;
  manager_role_id uuid;
  cashier_role_id uuid;
  attendant_role_id uuid;
  waiter_role_id uuid;
  kitchen_role_id uuid;
  driver_role_id uuid;
  financial_role_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if length(trim(organization_name)) < 2 then
    raise exception 'invalid organization name';
  end if;

  if length(trim(store_name)) < 2 then
    raise exception 'invalid store name';
  end if;

  if store_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'invalid store slug';
  end if;

  insert into public.organizations (name, created_by)
  values (trim(organization_name), actor_id)
  returning id into new_org_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'owner', 'Proprietário', true)
  returning id into owner_role_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'manager', 'Gerente', true)
  returning id into manager_role_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'cashier', 'Caixa', true)
  returning id into cashier_role_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'attendant', 'Atendente', true)
  returning id into attendant_role_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'waiter', 'Garçom', true)
  returning id into waiter_role_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'kitchen', 'Cozinha', true)
  returning id into kitchen_role_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'driver', 'Entregador', true)
  returning id into driver_role_id;

  insert into public.roles (organization_id, key, name, is_system)
  values (new_org_id, 'financial', 'Financeiro', true)
  returning id into financial_role_id;

  -- Owner receives the entire current catalog.
  insert into public.role_permissions (role_id, permission_id)
  select owner_role_id, id from public.permissions;

  -- Manager receives operational/admin permissions except organization ownership controls.
  insert into public.role_permissions (role_id, permission_id)
  select manager_role_id, id
  from public.permissions
  where key <> 'organization.manage';

  insert into public.role_permissions (role_id, permission_id)
  select cashier_role_id, id from public.permissions
  where key in ('dashboard.view','orders.view','orders.create','cash.open','cash.withdraw','cash.close','customers.view');

  insert into public.role_permissions (role_id, permission_id)
  select attendant_role_id, id from public.permissions
  where key in ('dashboard.view','products.view','orders.view','orders.create','orders.edit','customers.view','customers.manage');

  insert into public.role_permissions (role_id, permission_id)
  select waiter_role_id, id from public.permissions
  where key in ('orders.view','orders.create','orders.edit','customers.view');

  insert into public.role_permissions (role_id, permission_id)
  select kitchen_role_id, id from public.permissions
  where key in ('orders.view','orders.edit');

  insert into public.role_permissions (role_id, permission_id)
  select driver_role_id, id from public.permissions
  where key in ('orders.view');

  insert into public.role_permissions (role_id, permission_id)
  select financial_role_id, id from public.permissions
  where key in ('dashboard.view','reports.view');

  insert into public.organization_members (organization_id, user_id, role_id, status)
  values (new_org_id, actor_id, owner_role_id, 'active');

  insert into public.stores (organization_id, name, slug, is_primary)
  values (new_org_id, trim(store_name), store_slug, true)
  returning id into new_store_id;

  insert into public.user_store_roles (organization_id, store_id, user_id, role_id)
  values (new_org_id, new_store_id, actor_id, owner_role_id);

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    new_org_id,
    new_store_id,
    actor_id,
    'organization.bootstrap',
    'organization',
    new_org_id,
    jsonb_build_object('organization_name', trim(organization_name), 'store_name', trim(store_name), 'store_slug', store_slug)
  );

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    new_org_id,
    new_store_id,
    'organization.created',
    'organization',
    new_org_id,
    jsonb_build_object('store_id', new_store_id),
    actor_id
  );

  return jsonb_build_object('organization_id', new_org_id, 'store_id', new_store_id);
end;
$$;

revoke all on function private.bootstrap_organization(text, text, text) from public;
grant usage on schema private to authenticated;
grant execute on function private.bootstrap_organization(text, text, text) to authenticated;

create or replace function public.bootstrap_organization(
  organization_name text,
  store_name text,
  store_slug text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.bootstrap_organization(organization_name, store_name, store_slug);
$$;

revoke all on function public.bootstrap_organization(text, text, text) from public;
grant execute on function public.bootstrap_organization(text, text, text) to authenticated;
