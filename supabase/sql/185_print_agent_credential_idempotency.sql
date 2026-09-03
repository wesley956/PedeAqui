-- Stabilization #819: make Print Agent creation/reconnect reconciliable without
-- persisting plaintext credentials. New credentials are derived server-side from
-- (agent id, credential version); the database stores only their SHA-256 hash.

alter table public.print_agents
  add column if not exists credential_version integer not null default 0,
  add column if not exists credential_rotated_at timestamptz,
  add column if not exists credential_rotated_by uuid;

alter table public.print_agents
  drop constraint if exists print_agents_credential_version_check;
alter table public.print_agents
  add constraint print_agents_credential_version_check check (credential_version >= 0);

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'print_agents_credential_rotated_by_fkey'
      and conrelid = 'public.print_agents'::regclass
  ) then
    alter table public.print_agents
      add constraint print_agents_credential_rotated_by_fkey
      foreign key (credential_rotated_by) references auth.users(id) on delete set null;
  end if;
end
$block$;

create or replace function public.print_agent_create_idempotent_internal(
  p_agent_id uuid,
  p_store_id uuid,
  p_name text,
  p_token_hash text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_name text := trim(p_name);
  v_lock_key bigint;
  v_agent public.print_agents%rowtype;
begin
  if p_actor_user_id is null then raise exception 'print agent actor is required'; end if;
  if p_agent_id is null then raise exception 'print agent id is required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'invalid print agent name'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid print agent token hash'; end if;

  select organization_id into v_organization_id
  from public.stores
  where id = p_store_id;
  if v_organization_id is null then raise exception 'store not found'; end if;

  v_lock_key := pg_catalog.hashtextextended(
    concat_ws('|', 'print-agent-create', p_store_id::text, p_actor_user_id::text, lower(v_name)),
    0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_lock_key);

  select * into v_agent
  from public.print_agents
  where organization_id = v_organization_id
    and store_id = p_store_id
    and created_by = p_actor_user_id
    and lower(trim(name)) = lower(v_name)
    and credential_version > 0
    and created_at >= now() - interval '15 minutes'
  order by created_at desc
  limit 1;

  if v_agent.id is not null then
    return jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.name,
      'credential_version', v_agent.credential_version,
      'created', false
    );
  end if;

  insert into public.print_agents (
    id, organization_id, store_id, name, token_hash, active, status,
    credential_version, credential_rotated_at, credential_rotated_by, created_by
  ) values (
    p_agent_id, v_organization_id, p_store_id, v_name, p_token_hash, true, 'unknown',
    1, now(), p_actor_user_id, p_actor_user_id
  )
  returning * into v_agent;

  return jsonb_build_object(
    'id', v_agent.id,
    'name', v_agent.name,
    'credential_version', v_agent.credential_version,
    'created', true
  );
end;
$function$;

revoke all on function public.print_agent_create_idempotent_internal(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.print_agent_create_idempotent_internal(uuid,uuid,text,text,uuid) to service_role;
