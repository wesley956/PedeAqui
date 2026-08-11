-- PedeAqui — hardening da Central Profissional de Impressão.

create index if not exists production_stations_created_by_idx
  on public.production_stations (created_by) where created_by is not null;
create index if not exists print_agents_created_by_idx
  on public.print_agents (created_by) where created_by is not null;
create index if not exists printers_created_by_idx
  on public.printers (created_by) where created_by is not null;
create index if not exists product_production_stations_product_fk_idx
  on public.product_production_stations (organization_id, store_id, product_id);
create index if not exists print_jobs_created_by_idx
  on public.print_jobs (created_by) where created_by is not null;
create index if not exists print_jobs_reprint_requested_by_idx
  on public.print_jobs (reprint_requested_by) where reprint_requested_by is not null;

alter table public.printers drop constraint if exists printers_fallback_not_self;
alter table public.printers add constraint printers_fallback_not_self
  check (fallback_printer_id is null or fallback_printer_id <> id);

-- Wrapper interno para reexecutar o roteamento de um pedido confirmado.
-- A função privada continua fora da Data API; este wrapper é somente service_role.
create or replace function public.enqueue_order_print_internal(p_order_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.enqueue_order_print_jobs(p_order_id);
$$;
revoke all on function public.enqueue_order_print_internal(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_order_print_internal(uuid) to service_role;

-- Reimpressão é um novo job, nunca alteração do job original.
-- Job e auditoria são gravados na mesma transação.
create or replace function public.reprint_job_internal(
  p_job_id uuid,
  p_reason text,
  p_actor_user_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_original public.print_jobs%rowtype;
  v_new_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reprint reason is required';
  end if;

  select * into v_original
  from public.print_jobs
  where id = p_job_id
  for update;

  if v_original.id is null then raise exception 'print job not found'; end if;

  insert into public.print_jobs (
    organization_id, store_id, order_id, station_id, printer_id,
    document_type, template_key, template_version, payload, rendered_content,
    priority, copies, max_attempts, idempotency_key, original_job_id,
    is_reprint, reprint_reason, reprint_requested_by, source, created_by
  ) values (
    v_original.organization_id, v_original.store_id, v_original.order_id, v_original.station_id, v_original.printer_id,
    v_original.document_type, v_original.template_key, v_original.template_version, v_original.payload, null,
    greatest(0, v_original.priority - 10), v_original.copies, v_original.max_attempts,
    'reprint:' || v_original.id::text || ':' || gen_random_uuid()::text,
    v_original.id, true, trim(p_reason), p_actor_user_id, 'reprint', p_actor_user_id
  ) returning id into v_new_id;

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    v_original.organization_id,
    v_original.store_id,
    p_actor_user_id,
    'print.reprint',
    'print_job',
    v_new_id,
    jsonb_build_object('original_job_id', v_original.id, 'status', v_original.status),
    jsonb_build_object('new_job_id', v_new_id, 'printer_id', v_original.printer_id, 'reason', trim(p_reason))
  );

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
  ) values (
    v_original.organization_id, v_original.store_id, 'print.reprint_requested', 'print_job', v_new_id,
    jsonb_build_object('original_job_id', v_original.id, 'order_id', v_original.order_id),
    'pending', 0, now(), p_actor_user_id
  );

  return v_new_id;
end;
$$;
revoke all on function public.reprint_job_internal(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.reprint_job_internal(uuid,text,uuid) to service_role;

-- Mantém a definição final do backoff explícita no histórico de migrations.
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
      printer_id = v_fallback, fallback_from_printer_id = v_job.printer_id,
      status = 'pending', attempts = 0, available_at = now(), failed_at = null,
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('status','pending','fallback',true,'printer_id',v_fallback);
  elsif v_job.attempts >= v_job.max_attempts then
    update public.print_jobs set
      status = 'failed', failed_at = now(), available_at = now() + interval '1 hour',
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;
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
