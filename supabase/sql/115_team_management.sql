-- PedeAqui — prontidão comercial PA-DIAG-014
-- Suspensão de funcionário e cancelamento de convite preservam histórico e são atômicos.

create or replace function public.team_suspend_member_internal(
  p_organization_id uuid,
  p_member_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member public.organization_members%rowtype;
  v_role_key text;
  v_store_roles jsonb;
begin
  if not exists (
    select 1
    from public.organization_members actor
    join public.roles r
      on r.id = actor.role_id and r.organization_id = actor.organization_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.key = 'team.manage'
    where actor.organization_id = p_organization_id
      and actor.user_id = p_actor_user_id
      and actor.status = 'active'
  ) then
    raise exception 'team management permission required';
  end if;

  select * into v_member
  from public.organization_members
  where id = p_member_id and organization_id = p_organization_id
  for update;

  if v_member.id is null then raise exception 'member not found'; end if;
  if v_member.user_id = p_actor_user_id then raise exception 'cannot suspend own access'; end if;

  select r.key into v_role_key
  from public.roles r
  where r.id = v_member.role_id and r.organization_id = p_organization_id;
  if v_role_key = 'owner' then raise exception 'owner access cannot be suspended here'; end if;

  if v_member.status = 'suspended' then
    return jsonb_build_object('changed', false, 'status', 'suspended');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('store_id', usr.store_id, 'role_id', usr.role_id)), '[]'::jsonb)
    into v_store_roles
  from public.user_store_roles usr
  where usr.organization_id = p_organization_id and usr.user_id = v_member.user_id;

  update public.organization_members
  set status = 'suspended', updated_at = now()
  where id = v_member.id and organization_id = p_organization_id;

  delete from public.user_store_roles
  where organization_id = p_organization_id and user_id = v_member.user_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'team.member_suspended', 'organization_member', v_member.id,
    jsonb_build_object('status', v_member.status, 'store_roles', v_store_roles),
    jsonb_build_object('status', 'suspended', 'store_roles', '[]'::jsonb)
  );

  return jsonb_build_object('changed', true, 'status', 'suspended');
end;
$$;

revoke all on function public.team_suspend_member_internal(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.team_suspend_member_internal(uuid,uuid,uuid) to service_role;

create or replace function public.team_cancel_invitation_internal(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  if not exists (
    select 1
    from public.organization_members actor
    join public.roles r
      on r.id = actor.role_id and r.organization_id = actor.organization_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.key = 'team.manage'
    where actor.organization_id = p_organization_id
      and actor.user_id = p_actor_user_id
      and actor.status = 'active'
  ) then
    raise exception 'team management permission required';
  end if;

  select * into v_invitation
  from public.invitations
  where id = p_invitation_id and organization_id = p_organization_id
  for update;

  if v_invitation.id is null then raise exception 'invitation not found'; end if;
  if v_invitation.accepted_at is not null then raise exception 'accepted invitation cannot be canceled'; end if;
  if v_invitation.expires_at <= now() then
    return jsonb_build_object('changed', false, 'status', 'expired');
  end if;

  update public.invitations
  set expires_at = now()
  where id = v_invitation.id and organization_id = p_organization_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_organization_id, p_actor_user_id, 'team.invitation_canceled', 'invitation', v_invitation.id,
    jsonb_build_object('expires_at', v_invitation.expires_at),
    jsonb_build_object('expires_at', now())
  );

  return jsonb_build_object('changed', true, 'status', 'canceled');
end;
$$;

revoke all on function public.team_cancel_invitation_internal(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.team_cancel_invitation_internal(uuid,uuid,uuid) to service_role;
