-- OMNI #948 — audited support retry for durable provider commands.
create or replace function public.integration_reprocess_outbox(
  p_outbox_id uuid,
  p_actor_user_id uuid default null,
  p_correlation_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_command public.integration_outbox%rowtype;
begin
  update public.integration_outbox
     set status = 'pending',
         available_at = now(),
         last_error_kind = null,
         last_error = null,
         locked_at = null,
         locked_by = null
   where id = p_outbox_id
     and status in ('retry', 'dead_letter')
  returning * into v_command;

  if not found then return false; end if;

  insert into public.integration_audit_log (
    organization_id, store_id, integration_account_id, actor_user_id,
    provider, capability, action, source, correlation_id, metadata
  ) values (
    v_command.organization_id, v_command.store_id, v_command.integration_account_id,
    p_actor_user_id, v_command.provider, v_command.capability,
    'outbox_reprocessed', case when p_actor_user_id is null then 'reconciliation' else 'admin' end,
    p_correlation_id,
    jsonb_build_object('outbox_id', v_command.id, 'operation', v_command.operation, 'order_id', v_command.order_id)
  );
  return true;
end;
$$;

revoke all on function public.integration_reprocess_outbox(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.integration_reprocess_outbox(uuid, uuid, text) to service_role;

comment on function public.integration_reprocess_outbox(uuid, uuid, text) is
  'Audited retry for retry/dead-letter provider commands. Reuses the persisted idempotency key and never changes canonical order status directly.';
