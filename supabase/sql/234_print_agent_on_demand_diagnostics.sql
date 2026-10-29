-- Read-only diagnostic commands. No cron, polling job, print claim or remote shell.
create table if not exists public.print_agent_diagnostics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  agent_id uuid not null references public.print_agents(id) on delete cascade,
  requested_by uuid not null,
  intent_key uuid not null,
  status text not null default 'pending' check (status in ('pending','completed','cancelled','expired')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  completed_at timestamptz,
  report jsonb,
  unique(agent_id, intent_key),
  check (expires_at > requested_at),
  check (report is null or (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 32768)),
  check ((status = 'completed') = (report is not null and completed_at is not null))
);
create unique index if not exists print_agent_diagnostics_one_pending
  on public.print_agent_diagnostics(agent_id) where status = 'pending';
create index if not exists print_agent_diagnostics_store_recent
  on public.print_agent_diagnostics(organization_id, store_id, requested_at desc);
alter table public.print_agent_diagnostics enable row level security;
revoke all on public.print_agent_diagnostics from public, anon, authenticated;
grant select, insert, update, delete on public.print_agent_diagnostics to service_role;

create or replace function public.print_agent_request_diagnostic_internal(
  p_agent_id uuid, p_organization_id uuid, p_store_id uuid, p_actor_user_id uuid, p_intent_key uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  -- Serialize repeated clicks and simultaneous operators on this computer.
  perform 1 from public.print_agents where id = p_agent_id
    and organization_id = p_organization_id and store_id = p_store_id and active for update;
  if not found then raise exception 'agent unavailable'; end if;
  select id into v_id from public.print_agent_diagnostics where agent_id = p_agent_id and intent_key = p_intent_key;
  if found then return v_id; end if;
  update public.print_agent_diagnostics set status = 'expired'
    where agent_id = p_agent_id and status = 'pending' and expires_at <= now();
  select id into v_id from public.print_agent_diagnostics where agent_id = p_agent_id and status = 'pending';
  if found then return v_id; end if;
  -- Bound accidental report generation even after a rapid sequence of completions.
  if exists (select 1 from public.print_agent_diagnostics where agent_id = p_agent_id and requested_at > now() - interval '1 minute') then
    raise exception 'diagnostic rate limit';
  end if;
  insert into public.print_agent_diagnostics(organization_id, store_id, agent_id, requested_by, intent_key)
    values(p_organization_id, p_store_id, p_agent_id, p_actor_user_id, p_intent_key) returning id into v_id;
  return v_id;
end;
$$;

-- One RPC replaces the existing heartbeat RPC for capable agents. No extra
-- HTTP polling and no collection unless a human has created a pending request.
create or replace function public.print_agent_heartbeat_diagnostic_internal(
  p_agent_id uuid, p_version text, p_capabilities jsonb, p_printers jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_command jsonb;
begin
  perform public.print_agent_heartbeat_internal(p_agent_id, p_version, p_capabilities, p_printers);
  if p_capabilities->>'onDemandDiagnostics' = 'true' then
    select jsonb_build_object('id', d.id, 'expiresAt', d.expires_at)
      into v_command from public.print_agent_diagnostics d
      join public.print_agents a on a.id = d.agent_id and a.organization_id = d.organization_id and a.store_id = d.store_id
      where d.agent_id = p_agent_id and d.status = 'pending' and d.expires_at > now() and a.active;
  end if;
  return jsonb_build_object('ok', true, 'diagnostic', v_command);
end;
$$;

create or replace function public.print_agent_complete_diagnostic_internal(
  p_agent_id uuid, p_request_id uuid, p_report jsonb
) returns text language plpgsql security invoker set search_path = '' as $$
declare v_request public.print_agent_diagnostics%rowtype;
begin
  select d.* into v_request from public.print_agent_diagnostics d
    join public.print_agents a on a.id = d.agent_id and a.organization_id = d.organization_id and a.store_id = d.store_id
    where d.id = p_request_id and d.agent_id = p_agent_id and a.active for update of d;
  if not found then return 'unavailable'; end if;
  -- Lost responses may be retried: preserve the very first accepted report.
  if v_request.status = 'completed' then return 'completed'; end if;
  if v_request.status <> 'pending' then return v_request.status; end if;
  if v_request.expires_at <= now() then
    update public.print_agent_diagnostics set status = 'expired' where id = v_request.id;
    return 'expired';
  end if;
  update public.print_agent_diagnostics set status = 'completed', completed_at = now(), report = p_report where id = v_request.id;
  return 'completed';
end;
$$;

revoke all on function public.print_agent_request_diagnostic_internal(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.print_agent_heartbeat_diagnostic_internal(uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.print_agent_complete_diagnostic_internal(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.print_agent_request_diagnostic_internal(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.print_agent_heartbeat_diagnostic_internal(uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.print_agent_complete_diagnostic_internal(uuid,uuid,jsonb) to service_role;
