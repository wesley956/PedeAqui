-- Stabilization #819: make Print Agent creation/reconnect replay-safe without
-- persisting plaintext credentials. The database stores only token hashes plus
-- credential generation metadata. Idempotency responses contain agent id/version,
-- never the bearer credential itself.

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
  p_idempotency_key text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_store public.stores%rowtype;
  v_name text := trim(p_name);
  v_idem public.idempotency_keys%rowtype;
  v_inserted integer := 0;
  v_fingerprint text;
  v_agent public.print_agents%rowtype;
  v_response jsonb;
begin
  if p_actor_user_id is null then raise exception 'print agent actor is required'; end if;
  if p_agent_id is null then raise exception 'print agent id is required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'invalid print agent name'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid print agent token hash'; end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) < 8
     or char_length(trim(p_idempotency_key)) > 240 then
    raise exception 'invalid print agent idempotency key';
  end if;

  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'store_id', p_store_id,
    'name', v_name,
    'actor_user_id', p_actor_user_id
  )::text);

  insert into public.idempotency_keys(
    organization_id, store_id, scope, idempotency_key, request_fingerprint,
    status, expires_at
  ) values (
    v_store.organization_id, v_store.id, 'printing.agent.create', trim(p_idempotency_key),
    v_fingerprint, 'processing', now() + interval '24 hours'
  ) on conflict (organization_id, scope, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.idempotency_keys
  where organization_id = v_store.organization_id
    and scope = 'printing.agent.create'
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if v_idem.id is null then raise exception 'print agent idempotency unavailable'; end if;
  if v_idem.request_fingerprint is distinct from v_fingerprint then
    raise exception 'idempotency key reused with different print agent payload';
  end if;
  if v_inserted = 0 and v_idem.status = 'completed' and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 and v_idem.status = 'processing' and v_idem.expires_at > now() then
    raise exception 'print agent creation is already processing';
  end if;

  update public.idempotency_keys
  set status = 'processing', response_code = null, response_body = null,
      expires_at = now() + interval '24 hours', updated_at = now()
  where id = v_idem.id;

  insert into public.print_agents (
    id, organization_id, store_id, name, token_hash, active, status,
    credential_version, credential_rotated_at, credential_rotated_by, created_by
  ) values (
    p_agent_id, v_store.organization_id, p_store_id, v_name, p_token_hash, true, 'unknown',
    1, now(), p_actor_user_id, p_actor_user_id
  ) returning * into v_agent;

  v_response := jsonb_build_object(
    'id', v_agent.id,
    'name', v_agent.name,
    'credential_version', v_agent.credential_version,
    'created', true
  );

  update public.idempotency_keys
  set status = 'completed', response_code = 200, response_body = v_response, updated_at = now()
  where id = v_idem.id;

  return v_response || jsonb_build_object('replayed', false);
end;
$function$;

create or replace function public.print_agent_reconnect_idempotent_internal(
  p_agent_id uuid,
  p_token_hash text,
  p_idempotency_key text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_agent public.print_agents%rowtype;
  v_idem public.idempotency_keys%rowtype;
  v_inserted integer := 0;
  v_fingerprint text;
  v_response jsonb;
  v_next_version integer;
begin
  if p_actor_user_id is null then raise exception 'print agent actor is required'; end if;
  if p_agent_id is null then raise exception 'print agent id is required'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid print agent token hash'; end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) < 8
     or char_length(trim(p_idempotency_key)) > 240 then
    raise exception 'invalid print agent idempotency key';
  end if;

  select * into v_agent from public.print_agents where id = p_agent_id;
  if v_agent.id is null then raise exception 'print agent not found'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'agent_id', p_agent_id,
    'store_id', v_agent.store_id,
    'actor_user_id', p_actor_user_id
  )::text);

  insert into public.idempotency_keys(
    organization_id, store_id, scope, idempotency_key, request_fingerprint,
    status, expires_at
  ) values (
    v_agent.organization_id, v_agent.store_id, 'printing.agent.reconnect', trim(p_idempotency_key),
    v_fingerprint, 'processing', now() + interval '24 hours'
  ) on conflict (organization_id, scope, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.idempotency_keys
  where organization_id = v_agent.organization_id
    and scope = 'printing.agent.reconnect'
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if v_idem.id is null then raise exception 'print agent reconnect idempotency unavailable'; end if;
  if v_idem.request_fingerprint is distinct from v_fingerprint then
    raise exception 'idempotency key reused with different print agent reconnect payload';
  end if;
  if v_inserted = 0 and v_idem.status = 'completed' and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 and v_idem.status = 'processing' and v_idem.expires_at > now() then
    raise exception 'print agent reconnect is already processing';
  end if;

  update public.idempotency_keys
  set status = 'processing', response_code = null, response_body = null,
      expires_at = now() + interval '24 hours', updated_at = now()
  where id = v_idem.id;

  select * into v_agent from public.print_agents where id = p_agent_id for update;
  if v_agent.id is null then raise exception 'print agent not found'; end if;
  v_next_version := v_agent.credential_version + 1;

  update public.print_agents
  set token_hash = p_token_hash,
      credential_version = v_next_version,
      credential_rotated_at = now(),
      credential_rotated_by = p_actor_user_id,
      active = true,
      status = 'unknown',
      last_error = null,
      updated_at = now()
  where id = p_agent_id
  returning * into v_agent;

  v_response := jsonb_build_object(
    'id', v_agent.id,
    'name', v_agent.name,
    'credential_version', v_agent.credential_version,
    'rotated', true
  );

  update public.idempotency_keys
  set status = 'completed', response_code = 200, response_body = v_response, updated_at = now()
  where id = v_idem.id;

  return v_response || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function public.print_agent_create_idempotent_internal(uuid,uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.print_agent_reconnect_idempotent_internal(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.print_agent_create_idempotent_internal(uuid,uuid,text,text,text,uuid) to service_role;
grant execute on function public.print_agent_reconnect_idempotent_internal(uuid,text,text,uuid) to service_role;
