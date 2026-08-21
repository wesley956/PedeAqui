-- Driver phone + PIN access.
-- The PIN itself is never stored in public tables; Supabase Auth stores the password hash.
-- This table stores only enrollment-token hashes and brute-force control metadata.

create table if not exists public.driver_pin_access (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  phone_e164 text not null unique,
  enrollment_token_hash text,
  enrollment_expires_at timestamptz,
  enrollment_used_at timestamptz,
  enabled boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_pin_access_phone_e164_check check (phone_e164 ~ '^\+[1-9][0-9]{9,14}$')
);

create index if not exists idx_driver_pin_access_scope
  on public.driver_pin_access(organization_id, store_id, driver_id);

create index if not exists idx_driver_pin_access_enrollment
  on public.driver_pin_access(enrollment_token_hash)
  where enrollment_token_hash is not null;

alter table public.driver_pin_access enable row level security;
revoke all on table public.driver_pin_access from anon, authenticated;

create or replace function public.activate_driver_pin_access(raw_token text, actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  access_row public.driver_pin_access%rowtype;
  target_driver public.drivers%rowtype;
  driver_role_id uuid;
begin
  if actor_user_id is null then raise exception 'actor user is required'; end if;
  if not exists (select 1 from auth.users u where u.id = actor_user_id) then
    raise exception 'auth user does not exist';
  end if;

  select * into access_row
  from public.driver_pin_access a
  where a.enrollment_token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and a.enabled = true
    and a.enrollment_expires_at > now()
  for update;

  if access_row.driver_id is null then raise exception 'invalid or expired driver enrollment'; end if;
  if access_row.user_id is not null and access_row.user_id <> actor_user_id then
    raise exception 'driver access is already linked to another user';
  end if;

  select * into target_driver
  from public.drivers d
  where d.id = access_row.driver_id
    and d.organization_id = access_row.organization_id
    and d.store_id = access_row.store_id
    and d.deleted_at is null
  for update;

  if target_driver.id is null then raise exception 'driver access target not found'; end if;
  if target_driver.user_id is not null and target_driver.user_id <> actor_user_id then
    raise exception 'driver is linked to another user';
  end if;

  if exists (
    select 1
    from public.user_store_roles usr
    join public.roles r on r.id = usr.role_id
    where usr.user_id = actor_user_id and r.key <> 'driver'
  ) then
    raise exception 'driver PIN cannot replace credentials of a non-driver account';
  end if;

  if exists (
    select 1
    from public.drivers d
    where d.store_id = access_row.store_id
      and d.user_id = actor_user_id
      and d.deleted_at is null
      and d.id <> access_row.driver_id
  ) then
    raise exception 'user is already linked to another driver in this store';
  end if;

  select r.id into driver_role_id
  from public.roles r
  where r.organization_id = access_row.organization_id and r.key = 'driver'
  limit 1;
  if driver_role_id is null then raise exception 'driver role is unavailable'; end if;

  insert into public.profiles (id, display_name, phone, status)
  values (actor_user_id, target_driver.name, access_row.phone_e164, 'active')
  on conflict (id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    phone = excluded.phone,
    status = 'active',
    updated_at = now();

  insert into public.organization_members (organization_id, user_id, status)
  values (access_row.organization_id, actor_user_id, 'active')
  on conflict (organization_id, user_id)
  do update set status = 'active', updated_at = now();

  insert into public.user_store_roles (organization_id, store_id, user_id, role_id)
  values (access_row.organization_id, access_row.store_id, actor_user_id, driver_role_id)
  on conflict (store_id, user_id, role_id) do nothing;

  update public.drivers
  set user_id = actor_user_id,
      active = true,
      updated_by = actor_user_id,
      updated_at = now()
  where id = access_row.driver_id;

  update public.driver_pin_access
  set user_id = actor_user_id,
      enrollment_token_hash = null,
      enrollment_used_at = now(),
      failed_attempts = 0,
      locked_until = null,
      enabled = true,
      updated_at = now()
  where driver_id = access_row.driver_id;

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    access_row.organization_id,
    access_row.store_id,
    actor_user_id,
    'delivery.driver_pin_access_activated',
    'driver',
    access_row.driver_id,
    jsonb_build_object('phone', access_row.phone_e164)
  );

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, created_by
  ) values (
    access_row.organization_id,
    access_row.store_id,
    'delivery.driver_pin_access_activated',
    'driver',
    access_row.driver_id,
    jsonb_build_object('user_id', actor_user_id),
    actor_user_id
  );

  return jsonb_build_object(
    'organization_id', access_row.organization_id,
    'store_id', access_row.store_id,
    'driver_id', access_row.driver_id
  );
end;
$function$;

create or replace function public.register_driver_pin_failure(p_phone text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_attempts integer;
  next_lock timestamptz;
begin
  select failed_attempts into current_attempts
  from public.driver_pin_access
  where phone_e164 = p_phone and enabled = true
  for update;

  if current_attempts is null then return null; end if;

  current_attempts := current_attempts + 1;
  if current_attempts >= 5 then
    next_lock := now() + interval '15 minutes';
    update public.driver_pin_access
      set failed_attempts = 0, locked_until = next_lock, updated_at = now()
      where phone_e164 = p_phone;
  else
    update public.driver_pin_access
      set failed_attempts = current_attempts, updated_at = now()
      where phone_e164 = p_phone;
  end if;

  return next_lock;
end;
$function$;

create or replace function public.register_driver_pin_success(p_phone text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  access_row public.driver_pin_access%rowtype;
begin
  select * into access_row
  from public.driver_pin_access
  where phone_e164 = p_phone and user_id = p_user_id and enabled = true
  for update;

  if access_row.driver_id is null then raise exception 'driver PIN access mismatch'; end if;

  update public.driver_pin_access
  set failed_attempts = 0,
      locked_until = null,
      last_login_at = now(),
      updated_at = now()
  where driver_id = access_row.driver_id;

  return jsonb_build_object(
    'organization_id', access_row.organization_id,
    'store_id', access_row.store_id,
    'driver_id', access_row.driver_id
  );
end;
$function$;

revoke all on function public.activate_driver_pin_access(text, uuid) from public, anon, authenticated;
revoke all on function public.register_driver_pin_failure(text) from public, anon, authenticated;
revoke all on function public.register_driver_pin_success(text, uuid) from public, anon, authenticated;
grant execute on function public.activate_driver_pin_access(text, uuid) to service_role;
grant execute on function public.register_driver_pin_failure(text) to service_role;
grant execute on function public.register_driver_pin_success(text, uuid) to service_role;
