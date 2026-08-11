-- PedeAqui — um Print Agent só pode reivindicar jobs de impressoras explicitamente atribuídas a ele.

create or replace function public.print_agent_claim_internal(p_agent_id uuid, p_limit integer default 5)
returns setof public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_agent public.print_agents%rowtype;
begin
  if p_limit < 1 or p_limit > 20 then raise exception 'invalid claim limit'; end if;
  select * into v_agent from public.print_agents where id = p_agent_id and active;
  if v_agent.id is null then raise exception 'agent unavailable'; end if;

  update public.print_jobs
  set status = 'pending', claimed_by_agent_id = null, lease_expires_at = null, processing_at = null, updated_at = now()
  where organization_id = v_agent.organization_id
    and store_id = v_agent.store_id
    and status = 'processing'
    and lease_expires_at < now();

  return query
  with candidates as (
    select j.id
    from public.print_jobs j
    join public.printers p on p.id = j.printer_id
    where j.organization_id = v_agent.organization_id
      and j.store_id = v_agent.store_id
      and j.status in ('pending','failed')
      and j.available_at <= now()
      and j.attempts < j.max_attempts
      and p.active
      and p.agent_id = v_agent.id
    order by j.priority, j.created_at
    for update of j skip locked
    limit p_limit
  )
  update public.print_jobs j
  set status = 'processing', attempts = attempts + 1,
      claimed_by_agent_id = v_agent.id,
      lease_expires_at = now() + interval '90 seconds',
      processing_at = now(), last_error = null, updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function public.print_agent_claim_internal(uuid,integer) from public, anon, authenticated;
grant execute on function public.print_agent_claim_internal(uuid,integer) to service_role;
