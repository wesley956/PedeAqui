-- Accept an invitation without exposing invitation rows to the invited user.
-- Standard invitations create organization membership but keep the role store-scoped.

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
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select lower(email) into actor_email
  from auth.users
  where id = actor_id;

  if actor_email is null then
    raise exception 'authenticated user has no email';
  end if;

  select * into invite
  from public.invitations
  where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if invite.id is null then
    raise exception 'invalid or expired invitation';
  end if;

  if lower(invite.email) <> actor_email then
    raise exception 'invitation email does not match authenticated user';
  end if;

  if invite.role_id is null then
    raise exception 'invitation role is unavailable';
  end if;

  if exists (
    select 1 from public.roles r
    where r.id = invite.role_id
      and r.organization_id = invite.organization_id
      and r.key = 'owner'
  ) then
    raise exception 'owner role cannot be granted by standard invitation';
  end if;

  insert into public.profiles (id, status)
  values (actor_id, 'active')
  on conflict (id) do update set status = 'active', updated_at = now();

  -- Membership establishes tenant membership only. Standard invitation roles live in
  -- user_store_roles, preventing accidental organization-wide privilege escalation.
  insert into public.organization_members (organization_id, user_id, role_id, status)
  values (invite.organization_id, actor_id, null, 'active')
  on conflict (organization_id, user_id)
  do update set status = 'active', updated_at = now();

  foreach target_store_id in array invite.store_ids loop
    if exists (
      select 1 from public.stores s
      where s.id = target_store_id
        and s.organization_id = invite.organization_id
    ) then
      insert into public.user_store_roles (organization_id, store_id, user_id, role_id)
      values (invite.organization_id, target_store_id, actor_id, invite.role_id)
      on conflict (store_id, user_id, role_id) do nothing;
    end if;
  end loop;

  update public.invitations
  set accepted_at = now()
  where id = invite.id;

  select id into target_store_id
  from public.stores
  where organization_id = invite.organization_id
    and id = any(invite.store_ids)
    and status = 'active'
  order by is_primary desc
  limit 1;

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    invite.organization_id,
    target_store_id,
    actor_id,
    'team.invitation_accepted',
    'invitation',
    invite.id,
    jsonb_build_object('role_id', invite.role_id, 'store_ids', invite.store_ids)
  );

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    invite.organization_id,
    target_store_id,
    'team.invitation_accepted',
    'invitation',
    invite.id,
    jsonb_build_object('user_id', actor_id),
    actor_id
  );

  return jsonb_build_object(
    'organization_id', invite.organization_id,
    'store_id', target_store_id
  );
end;
$$;

revoke all on function private.accept_invitation(text) from public;
grant execute on function private.accept_invitation(text) to authenticated;

create or replace function public.accept_invitation(raw_token text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.accept_invitation(raw_token);
$$;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;
