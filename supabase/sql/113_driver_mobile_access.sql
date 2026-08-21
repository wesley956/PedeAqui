-- Driver mobile access: bind a standard team invitation to one driver and complete
-- the user<->driver link atomically when the invited account accepts the token.

create table if not exists public.driver_access_invitations (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_access_invitations_driver
  on public.driver_access_invitations(organization_id, store_id, driver_id, created_at desc);

-- A user represents at most one active driver record per store. This protects the
-- mobile route from ambiguous identity without changing historical deleted rows.
create unique index if not exists uq_drivers_store_user_active
  on public.drivers(store_id, user_id)
  where user_id is not null and deleted_at is null;

alter table public.driver_access_invitations enable row level security;
revoke all on table public.driver_access_invitations from anon, authenticated;

create or replace function private.accept_invitation(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  invite public.invitations%rowtype;
  target_store_id uuid;
  is_owner_invitation boolean := false;
  driver_access public.driver_access_invitations%rowtype;
  target_driver public.drivers%rowtype;
  next_path text := null;
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

  select * into driver_access
  from public.driver_access_invitations dai
  where dai.invitation_id = invite.id;

  if driver_access.invitation_id is not null then
    if invite.invitation_kind <> 'standard' then
      raise exception 'driver access requires a standard invitation';
    end if;
    if driver_access.organization_id <> invite.organization_id
      or not (driver_access.store_id = any(invite.store_ids)) then
      raise exception 'driver access invitation scope mismatch';
    end if;
    if not exists (
      select 1 from public.roles r
      where r.id = invite.role_id
        and r.organization_id = invite.organization_id
        and r.key = 'driver'
    ) then
      raise exception 'driver access invitation has invalid role';
    end if;

    select * into target_driver
    from public.drivers d
    where d.id = driver_access.driver_id
      and d.organization_id = invite.organization_id
      and d.store_id = driver_access.store_id
      and d.deleted_at is null
    for update;

    if target_driver.id is null then raise exception 'driver access target not found'; end if;
    if target_driver.user_id is not null and target_driver.user_id <> actor_id then
      raise exception 'driver access already linked to another user';
    end if;
    if exists (
      select 1 from public.drivers d
      where d.store_id = driver_access.store_id
        and d.user_id = actor_id
        and d.deleted_at is null
        and d.id <> target_driver.id
    ) then
      raise exception 'user already linked to another driver in this store';
    end if;
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

  if driver_access.invitation_id is not null then
    update public.drivers
    set user_id = actor_id,
        active = true,
        updated_by = actor_id,
        updated_at = now()
    where id = target_driver.id;
    next_path := '/entregador';
  end if;

  update public.invitations set accepted_at = now() where id = invite.id;

  select id into target_store_id
  from public.stores
  where organization_id = invite.organization_id
    and id = any(invite.store_ids) and status = 'active'
  order by is_primary desc limit 1;

  if driver_access.invitation_id is not null then
    target_store_id := driver_access.store_id;
  end if;

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    invite.organization_id, target_store_id, actor_id, 'team.invitation_accepted', 'invitation', invite.id,
    jsonb_build_object(
      'role_id', invite.role_id,
      'store_ids', invite.store_ids,
      'invitation_kind', invite.invitation_kind,
      'driver_id', case when driver_access.invitation_id is not null then driver_access.driver_id else null end
    )
  );

  if driver_access.invitation_id is not null then
    insert into public.audit_logs (
      organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      invite.organization_id,
      driver_access.store_id,
      actor_id,
      'delivery.driver_mobile_access_linked',
      'driver',
      driver_access.driver_id,
      jsonb_build_object('invitation_id', invite.id, 'user_id', actor_id)
    );
  end if;

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    invite.organization_id, target_store_id, 'team.invitation_accepted', 'invitation', invite.id,
    jsonb_build_object(
      'user_id', actor_id,
      'invitation_kind', invite.invitation_kind,
      'driver_id', case when driver_access.invitation_id is not null then driver_access.driver_id else null end
    ),
    actor_id
  );

  return jsonb_build_object(
    'organization_id', invite.organization_id,
    'store_id', target_store_id,
    'next_path', next_path
  );
end;
$function$;

revoke all on function private.accept_invitation(text) from public;
grant execute on function private.accept_invitation(text) to authenticated;
