-- iFood order lifecycle reconciliation (#940).
-- Provider lifecycle HTTP calls are asynchronous. Only a durable iFood event
-- may advance the canonical PedeAqui state and confirm the matching outbox row.

create or replace function public.integration_reconcile_ifood_order_lifecycle(
  p_organization_id uuid,
  p_store_id uuid,
  p_order_id uuid,
  p_integration_account_id uuid,
  p_external_order_id text,
  p_milestone text,
  p_external_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_external public.external_orders%rowtype;
  v_confirmed_commands integer := 0;
  v_chained_commands integer := 0;
  v_sync_status text := 'synced';
  v_reason text := 'Cancelado pelo iFood';
begin
  if p_milestone not in ('confirmed', 'preparing', 'ready', 'canceled', 'concluded') then
    raise exception 'unsupported iFood lifecycle milestone: %', p_milestone;
  end if;

  select * into v_external
    from public.external_orders
   where organization_id = p_organization_id
     and store_id = p_store_id
     and order_id = p_order_id
     and integration_account_id = p_integration_account_id
     and provider = 'ifood'
     and external_order_id = p_external_order_id
   for update;
  if not found then
    raise exception 'iFood external order link not found';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     and organization_id = p_organization_id
     and store_id = p_store_id
   for update;
  if not found then
    raise exception 'canonical order not found';
  end if;

  -- Forward-only canonical state reconciliation. These are the same internal
  -- transition RPCs used by OrderService; duplicate/out-of-order provider
  -- events therefore become no-ops instead of creating a second state machine.
  if p_milestone in ('confirmed', 'preparing', 'ready', 'concluded') then
    if v_order.order_status = 'pending_confirmation' then
      perform public.order_transition_internal(
        p_order_id => p_order_id,
        p_domain => 'order',
        p_to_state => 'confirmed',
        p_reason => null,
        p_actor_user_id => null,
        p_source => 'panel'
      );
      select * into v_order from public.orders where id = p_order_id for update;
    end if;

    if p_milestone in ('preparing', 'ready', 'concluded')
       and v_order.order_status = 'confirmed'
       and v_order.production_status in ('pending_confirmation', 'queued') then
      perform public.order_start_production_internal(
        p_order_id => p_order_id,
        p_actor_user_id => null,
        p_source => 'panel'
      );
      select * into v_order from public.orders where id = p_order_id for update;
    end if;

    if p_milestone in ('ready', 'concluded')
       and v_order.order_status = 'confirmed'
       and v_order.production_status = 'preparing' then
      perform public.order_transition_internal(
        p_order_id => p_order_id,
        p_domain => 'production',
        p_to_state => 'ready',
        p_reason => null,
        p_actor_user_id => null,
        p_source => 'panel'
      );
      select * into v_order from public.orders where id = p_order_id for update;
    end if;
  elsif p_milestone = 'canceled' then
    if v_order.order_status in ('pending_confirmation', 'confirmed') then
      perform public.order_transition_internal(
        p_order_id => p_order_id,
        p_domain => 'order',
        p_to_state => 'canceled',
        p_reason => v_reason,
        p_actor_user_id => null,
        p_source => 'panel'
      );
    end if;

    select * into v_order from public.orders where id = p_order_id for update;
    if v_order.production_status in ('pending_confirmation', 'queued', 'preparing', 'ready') then
      perform public.order_transition_internal(
        p_order_id => p_order_id,
        p_domain => 'production',
        p_to_state => 'canceled',
        p_reason => v_reason,
        p_actor_user_id => null,
        p_source => 'panel'
      );
    end if;

    select * into v_order from public.orders where id = p_order_id for update;
    if v_order.fulfillment_status in ('pending', 'awaiting_assignment', 'assigned', 'picked_up', 'out_for_delivery', 'awaiting_pickup') then
      perform public.order_transition_internal(
        p_order_id => p_order_id,
        p_domain => 'fulfillment',
        p_to_state => 'canceled',
        p_reason => v_reason,
        p_actor_user_id => null,
        p_source => 'panel'
      );
    end if;
  end if;

  -- Confirm only commands whose effect is now proven by a provider event.
  with confirmed_rows as (
    update public.integration_outbox o
       set status = 'confirmed',
           sent_at = coalesce(o.sent_at, now()),
           confirmed_at = coalesce(o.confirmed_at, now()),
           locked_at = null,
           locked_by = null,
           last_error = null,
           last_error_kind = null
     where o.organization_id = p_organization_id
       and o.store_id = p_store_id
       and o.order_id = p_order_id
       and o.integration_account_id = p_integration_account_id
       and o.provider = 'ifood'
       and o.capability = 'ifood_orders'
       and o.status = 'sent'
       and (
         (p_milestone = 'confirmed' and o.operation = 'confirm')
         or (p_milestone = 'preparing' and o.operation in ('confirm', 'start_preparation'))
         or (p_milestone in ('ready', 'concluded') and o.operation in ('confirm', 'start_preparation', 'mark_ready'))
         or (p_milestone = 'canceled' and o.operation = 'request_cancellation')
       )
    returning o.*
  ), chained as (
    insert into public.integration_outbox (
      organization_id,
      store_id,
      order_id,
      integration_account_id,
      provider,
      capability,
      operation,
      idempotency_key,
      status,
      payload,
      available_at
    )
    select
      c.organization_id,
      c.store_id,
      c.order_id,
      c.integration_account_id,
      'ifood',
      'ifood_orders',
      'start_preparation',
      'ifood-order:' || c.order_id::text || ':start_preparation:-',
      'pending',
      jsonb_build_object(
        'externalOrderId', p_external_order_id,
        'externalMerchantId', coalesce(c.payload->>'externalMerchantId', v_external.last_snapshot #>> '{merchant,id}')
      ),
      now()
    from confirmed_rows c
    where c.operation = 'confirm'
      and c.payload->>'afterConfirmation' = 'start_preparation'
      and p_milestone in ('confirmed', 'preparing', 'ready', 'concluded')
      and coalesce(c.payload->>'externalMerchantId', v_external.last_snapshot #>> '{merchant,id}') is not null
    on conflict (integration_account_id, idempotency_key) do nothing
    returning 1
  )
  select
    (select count(*) from confirmed_rows),
    (select count(*) from chained)
    into v_confirmed_commands, v_chained_commands;

  if exists (
    select 1 from public.integration_outbox o
     where o.organization_id = p_organization_id
       and o.store_id = p_store_id
       and o.order_id = p_order_id
       and o.provider = 'ifood'
       and o.capability = 'ifood_orders'
       and o.status = 'dead_letter'
  ) then
    v_sync_status := 'attention';
  elsif exists (
    select 1 from public.integration_outbox o
     where o.organization_id = p_organization_id
       and o.store_id = p_store_id
       and o.order_id = p_order_id
       and o.provider = 'ifood'
       and o.capability = 'ifood_orders'
       and o.status in ('pending', 'processing', 'sent', 'retry')
  ) then
    v_sync_status := 'pending';
  else
    v_sync_status := 'synced';
  end if;

  update public.external_orders
     set sync_status = v_sync_status,
         updated_at = now()
   where id = v_external.id;

  insert into public.integration_audit_log (
    organization_id,
    store_id,
    integration_account_id,
    actor_user_id,
    provider,
    capability,
    action,
    source,
    correlation_id,
    metadata
  ) values (
    p_organization_id,
    p_store_id,
    p_integration_account_id,
    null,
    'ifood',
    'ifood_orders',
    'order_lifecycle_reconciled',
    'reconciliation',
    p_external_event_id,
    jsonb_build_object(
      'order_id', p_order_id,
      'external_order_id', p_external_order_id,
      'milestone', p_milestone,
      'confirmed_commands', v_confirmed_commands,
      'chained_commands', v_chained_commands,
      'sync_status', v_sync_status
    )
  );

  return jsonb_build_object(
    'milestone', p_milestone,
    'confirmed_commands', v_confirmed_commands,
    'chained_commands', v_chained_commands,
    'sync_status', v_sync_status
  );
end;
$$;

revoke all on function public.integration_reconcile_ifood_order_lifecycle(uuid, uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.integration_reconcile_ifood_order_lifecycle(uuid, uuid, uuid, uuid, text, text, text)
  to service_role;

comment on function public.integration_reconcile_ifood_order_lifecycle(uuid, uuid, uuid, uuid, text, text, text) is
  'Advances a canonical order and confirms iFood lifecycle outbox commands only after a durable provider event proves the transition.';
