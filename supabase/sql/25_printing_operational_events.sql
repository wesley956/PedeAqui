-- PedeAqui — eventos operacionais da central de impressão.
-- Evita alertas repetidos: eventos de saúde só nas transições.

create or replace function public.print_agent_heartbeat_internal(
  p_agent_id uuid, p_version text, p_capabilities jsonb, p_printers jsonb
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_item jsonb;
  v_printer public.printers%rowtype;
  v_next_status text;
begin
  update public.print_agents set
    status = 'online', version = nullif(trim(coalesce(p_version,'')),''),
    capabilities = coalesce(p_capabilities,'{}'::jsonb), last_seen_at = now(), last_error = null, updated_at = now()
  where id = p_agent_id and active;
  if not found then raise exception 'agent unavailable'; end if;

  if jsonb_typeof(coalesce(p_printers,'[]'::jsonb)) <> 'array' then raise exception 'invalid printers payload'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_printers,'[]'::jsonb)) loop
    select * into v_printer
    from public.printers
    where id = (v_item->>'id')::uuid and agent_id = p_agent_id
    for update;

    if v_printer.id is null then continue; end if;
    v_next_status := case
      when v_item->>'status' in ('online','offline','degraded','unknown') then v_item->>'status'
      else v_printer.status
    end;

    update public.printers set
      status = v_next_status,
      last_seen_at = now(),
      last_error = nullif(left(coalesce(v_item->>'error',''),2000),''),
      updated_at = now()
    where id = v_printer.id;

    if v_printer.status is distinct from v_next_status and v_next_status = 'offline' then
      insert into public.domain_events (
        organization_id, store_id, event_type, entity_type, entity_id,
        payload, status, attempts, occurred_at
      ) values (
        v_printer.organization_id, v_printer.store_id, 'print.printer_offline', 'printer', v_printer.id,
        jsonb_build_object('printer_name', v_printer.name, 'previous_status', v_printer.status),
        'pending', 0, now()
      );
    elsif v_printer.status = 'offline' and v_next_status = 'online' then
      insert into public.domain_events (
        organization_id, store_id, event_type, entity_type, entity_id,
        payload, status, attempts, occurred_at
      ) values (
        v_printer.organization_id, v_printer.store_id, 'print.printer_recovered', 'printer', v_printer.id,
        jsonb_build_object('printer_name', v_printer.name),
        'pending', 0, now()
      );
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.print_agent_heartbeat_internal(uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.print_agent_heartbeat_internal(uuid,text,jsonb,jsonb) to service_role;

create or replace function public.print_agent_fail_internal(p_agent_id uuid, p_job_id uuid, p_error text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job public.print_jobs%rowtype;
  v_fallback uuid;
  v_backoff_seconds integer;
begin
  select * into v_job from public.print_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'processing' or v_job.claimed_by_agent_id <> p_agent_id then
    raise exception 'job not owned by agent';
  end if;

  select fallback_printer_id into v_fallback from public.printers where id = v_job.printer_id;
  v_backoff_seconds := least(600, 30 * power(2, greatest(v_job.attempts - 1, 0))::integer);

  if v_job.attempts >= v_job.max_attempts and v_fallback is not null and v_job.fallback_from_printer_id is null then
    update public.print_jobs set
      printer_id = v_fallback,
      fallback_from_printer_id = v_job.printer_id,
      status = 'pending', attempts = 0, available_at = now(), failed_at = null,
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;

    insert into public.domain_events (
      organization_id, store_id, event_type, entity_type, entity_id,
      payload, status, attempts, occurred_at
    ) values (
      v_job.organization_id, v_job.store_id, 'print.fallback_activated', 'print_job', v_job.id,
      jsonb_build_object('from_printer_id', v_job.printer_id, 'to_printer_id', v_fallback, 'order_id', v_job.order_id),
      'pending', 0, now()
    );

    return jsonb_build_object('status','pending','fallback',true,'printer_id',v_fallback);
  elsif v_job.attempts >= v_job.max_attempts then
    update public.print_jobs set
      status = 'failed', failed_at = now(), available_at = now() + interval '1 hour',
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;

    insert into public.domain_events (
      organization_id, store_id, event_type, entity_type, entity_id,
      payload, status, attempts, occurred_at
    ) values (
      v_job.organization_id, v_job.store_id, 'print.job_failed', 'print_job', v_job.id,
      jsonb_build_object('printer_id', v_job.printer_id, 'order_id', v_job.order_id, 'attempts', v_job.attempts),
      'pending', 0, now()
    );

    return jsonb_build_object('status','failed','fallback',false);
  else
    update public.print_jobs set
      status = 'pending', available_at = now() + make_interval(secs => v_backoff_seconds),
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('status','pending','retry_in_seconds',v_backoff_seconds,'fallback',false);
  end if;
end;
$$;
revoke all on function public.print_agent_fail_internal(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.print_agent_fail_internal(uuid,uuid,text) to service_role;
