-- PedeAqui — [349]
-- Provisionamento comercial mobile pelo Painel do Proprietário.
-- O platform admin cria outro tenant sem se tornar membro dele.
-- WhatsApp é opcional; convite de proprietário não usa senha padrão.

alter table public.stores
  add column if not exists platform_demo boolean not null default false;

create index if not exists stores_platform_demo_idx
  on public.stores (platform_demo)
  where platform_demo = true;

alter table public.invitations
  add column if not exists invitation_kind text not null default 'standard';

alter table public.invitations
  drop constraint if exists invitations_kind_check,
  add constraint invitations_kind_check
    check (invitation_kind in ('standard','platform_owner'));

create or replace function public.platform_provision_restaurant_internal(
  p_actor_user_id uuid,
  p_organization_name text,
  p_store_name text,
  p_store_slug text,
  p_owner_email text default null,
  p_invite_token_hash text default null,
  p_platform_demo boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_store_id uuid;
  v_invitation_id uuid;
  v_owner_role_id uuid;
  v_manager_role_id uuid;
  v_cashier_role_id uuid;
  v_attendant_role_id uuid;
  v_waiter_role_id uuid;
  v_kitchen_role_id uuid;
  v_driver_role_id uuid;
  v_financial_role_id uuid;
  v_owner_email text := nullif(lower(trim(coalesce(p_owner_email,''))), '');
begin
  if p_actor_user_id is null or not exists (select 1 from auth.users u where u.id = p_actor_user_id) then
    raise exception 'valid platform actor required';
  end if;
  if char_length(trim(coalesce(p_organization_name,''))) < 2
    or char_length(trim(coalesce(p_store_name,''))) < 2
    or p_store_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$'
  then
    raise exception 'invalid restaurant onboarding data';
  end if;
  if v_owner_email is not null and v_owner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid owner email';
  end if;
  if v_owner_email is not null and coalesce(p_invite_token_hash,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'valid invitation token hash required';
  end if;
  if p_platform_demo and v_owner_email is not null then
    raise exception 'demo tenant cannot invite an owner';
  end if;
  if exists (select 1 from public.stores s where s.slug = p_store_slug) then
    raise exception 'store slug already exists';
  end if;
  if p_platform_demo and exists (select 1 from public.stores s where s.platform_demo = true) then
    raise exception 'platform demo already exists';
  end if;

  insert into public.organizations (name, created_by, status)
  values (trim(p_organization_name), p_actor_user_id, 'trial')
  returning id into v_org_id;

  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'owner', 'Proprietário', true) returning id into v_owner_role_id;
  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'manager', 'Gerente', true) returning id into v_manager_role_id;
  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'cashier', 'Caixa', true) returning id into v_cashier_role_id;
  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'attendant', 'Atendente', true) returning id into v_attendant_role_id;
  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'waiter', 'Garçom', true) returning id into v_waiter_role_id;
  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'kitchen', 'Cozinha', true) returning id into v_kitchen_role_id;
  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'driver', 'Entregador', true) returning id into v_driver_role_id;
  insert into public.roles (organization_id, key, name, is_system) values
    (v_org_id, 'financial', 'Financeiro', true) returning id into v_financial_role_id;

  -- Triggers de módulos posteriores podem antecipar grants; por isso tudo é conflict-safe.
  insert into public.role_permissions (role_id, permission_id)
  select v_owner_role_id, id from public.permissions on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select v_manager_role_id, id from public.permissions where key <> 'organization.manage' on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select v_cashier_role_id, id from public.permissions
    where key in ('dashboard.view','orders.view','orders.create','cash.open','cash.withdraw','cash.close','customers.view')
    on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select v_attendant_role_id, id from public.permissions
    where key in ('dashboard.view','products.view','orders.view','orders.create','orders.edit','customers.view','customers.manage')
    on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select v_waiter_role_id, id from public.permissions
    where key in ('orders.view','orders.create','orders.edit','customers.view') on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select v_kitchen_role_id, id from public.permissions
    where key in ('orders.view','orders.edit') on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select v_driver_role_id, id from public.permissions where key = 'orders.view' on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select v_financial_role_id, id from public.permissions
    where key in ('dashboard.view','reports.view') on conflict do nothing;

  insert into public.stores (organization_id, name, slug, is_primary, status, platform_demo)
  values (v_org_id, trim(p_store_name), p_store_slug, true, 'active', p_platform_demo)
  returning id into v_store_id;

  -- O canal nasce desativado/pendente. Nenhum número Meta é necessário para criar o restaurante.
  insert into public.store_conversation_settings (
    organization_id, store_id, whatsapp_enabled, provider, connection_status, onboarding_status, updated_at
  ) values (
    v_org_id, v_store_id, false, 'meta_cloud', 'not_connected', 'not_started', now()
  ) on conflict (store_id) do nothing;

  if v_owner_email is not null then
    insert into public.invitations (
      organization_id, email, token_hash, role_id, store_ids, invited_by,
      expires_at, invitation_kind
    ) values (
      v_org_id, v_owner_email, p_invite_token_hash, v_owner_role_id, array[v_store_id],
      p_actor_user_id, now() + interval '7 days', 'platform_owner'
    ) returning id into v_invitation_id;
  end if;

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    v_org_id, v_store_id, p_actor_user_id, 'platform.restaurant_provisioned', 'organization', v_org_id,
    jsonb_build_object(
      'store_id', v_store_id,
      'store_slug', p_store_slug,
      'owner_invited', v_owner_email is not null,
      'platform_demo', p_platform_demo,
      'whatsapp_status', 'not_connected'
    )
  );

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    v_org_id, v_store_id, 'platform.restaurant_provisioned', 'organization', v_org_id,
    jsonb_build_object('store_id', v_store_id, 'platform_demo', p_platform_demo), p_actor_user_id
  );

  return jsonb_build_object(
    'organization_id', v_org_id,
    'store_id', v_store_id,
    'store_slug', p_store_slug,
    'invitation_id', v_invitation_id,
    'owner_invited', v_owner_email is not null,
    'platform_demo', p_platform_demo
  );
end;
$$;

revoke all on function public.platform_provision_restaurant_internal(uuid,text,text,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.platform_provision_restaurant_internal(uuid,text,text,text,text,text,boolean)
  to service_role;

-- Plataforma pode emitir um convite de proprietário, mas convites normais continuam impedidos de escalar para owner.
create or replace function private.accept_invitation(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  invite public.invitations%rowtype;
  target_store_id uuid;
  is_owner_invitation boolean := false;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  select lower(email) into actor_email from auth.users where id = actor_id;
  if actor_email is null then raise exception 'authenticated user has no email'; end if;

  select * into invite
  from public.invitations
  where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and accepted_at is null and expires_at > now()
  for update;

  if invite.id is null then raise exception 'invalid or expired invitation'; end if;
  if lower(invite.email) <> actor_email then raise exception 'invitation email does not match authenticated user'; end if;
  if invite.role_id is null then raise exception 'invitation role is unavailable'; end if;

  select exists (
    select 1 from public.roles r
    where r.id = invite.role_id and r.organization_id = invite.organization_id and r.key = 'owner'
  ) into is_owner_invitation;

  if is_owner_invitation and invite.invitation_kind <> 'platform_owner' then
    raise exception 'owner role cannot be granted by standard invitation';
  end if;
  if invite.invitation_kind = 'platform_owner' and not is_owner_invitation then
    raise exception 'platform owner invitation has invalid role';
  end if;

  insert into public.profiles (id, status)
  values (actor_id, 'active')
  on conflict (id) do update set status = 'active', updated_at = now();

  insert into public.organization_members (organization_id, user_id, role_id, status)
  values (invite.organization_id, actor_id, case when is_owner_invitation then invite.role_id else null end, 'active')
  on conflict (organization_id, user_id)
  do update set
    role_id = case when is_owner_invitation then excluded.role_id else public.organization_members.role_id end,
    status = 'active', updated_at = now();

  foreach target_store_id in array invite.store_ids loop
    if exists (
      select 1 from public.stores s
      where s.id = target_store_id and s.organization_id = invite.organization_id
    ) then
      insert into public.user_store_roles (organization_id, store_id, user_id, role_id)
      values (invite.organization_id, target_store_id, actor_id, invite.role_id)
      on conflict (store_id, user_id, role_id) do nothing;
    end if;
  end loop;

  update public.invitations set accepted_at = now() where id = invite.id;

  select id into target_store_id
  from public.stores
  where organization_id = invite.organization_id
    and id = any(invite.store_ids) and status = 'active'
  order by is_primary desc limit 1;

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    invite.organization_id, target_store_id, actor_id, 'team.invitation_accepted', 'invitation', invite.id,
    jsonb_build_object('role_id', invite.role_id, 'store_ids', invite.store_ids, 'invitation_kind', invite.invitation_kind)
  );
  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    invite.organization_id, target_store_id, 'team.invitation_accepted', 'invitation', invite.id,
    jsonb_build_object('user_id', actor_id, 'invitation_kind', invite.invitation_kind), actor_id
  );

  return jsonb_build_object('organization_id', invite.organization_id, 'store_id', target_store_id);
end;
$$;

revoke all on function private.accept_invitation(text) from public, anon;
grant execute on function private.accept_invitation(text) to authenticated;
