-- Remote parity hotfix applied to the official Supabase project on 2026-08-13.
--
-- Why this exists after the domain migrations:
-- later role/bootstrap triggers can grant permissions as system roles are created.
-- The original onboarding function also inserted its baseline permission matrix,
-- which could hit role_permissions_pkey for the same (role_id, permission_id).
--
-- Do not fold this change back into 04_bootstrap_organization.sql. That file is
-- historical input already represented by the production migration history.
-- Keeping this as an append-only hotfix makes a fresh environment converge to
-- the same final function definition as production without rewriting history.

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

  if length(trim(organization_name)) < 2
    or length(trim(store_name)) < 2
    or store_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$'
  then
    raise exception 'invalid onboarding data';
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

  -- Triggers added by later modules may already have granted some of these
  -- permissions. Baseline grants therefore need to be conflict-safe.
  insert into public.role_permissions (role_id, permission_id)
  select owner_role_id, id from public.permissions
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select manager_role_id, id
  from public.permissions
  where key <> 'organization.manage'
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select cashier_role_id, id
  from public.permissions
  where key in (
    'dashboard.view', 'orders.view', 'orders.create', 'cash.open',
    'cash.withdraw', 'cash.close', 'customers.view'
  )
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select attendant_role_id, id
  from public.permissions
  where key in (
    'dashboard.view', 'products.view', 'orders.view', 'orders.create',
    'orders.edit', 'customers.view', 'customers.manage'
  )
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select waiter_role_id, id
  from public.permissions
  where key in ('orders.view', 'orders.create', 'orders.edit', 'customers.view')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select kitchen_role_id, id
  from public.permissions
  where key in ('orders.view', 'orders.edit')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select driver_role_id, id
  from public.permissions
  where key = 'orders.view'
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select financial_role_id, id
  from public.permissions
  where key in ('dashboard.view', 'reports.view')
  on conflict do nothing;

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
    jsonb_build_object(
      'organization_name', trim(organization_name),
      'store_name', trim(store_name),
      'store_slug', store_slug
    )
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
