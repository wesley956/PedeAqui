-- PedeAqui — bloco [083]–[091]
-- Workflow operacional do Gestor de Pedidos sem criar mega-status.

-- "Iniciar produção" precisa preservar as transições formais
-- pending_confirmation -> queued -> preparing, mas deve ser atômico para a UI.
create or replace function public.order_start_production_internal(
  p_order_id uuid,
  p_actor_user_id uuid default null,
  p_source text default 'panel'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_result jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.order_status <> 'confirmed' then raise exception 'order must be confirmed before production starts'; end if;

  if v_order.production_status = 'pending_confirmation' then
    perform public.order_transition_internal(
      p_order_id, 'production', 'queued', null, p_actor_user_id, p_source
    );
    v_result := public.order_transition_internal(
      p_order_id, 'production', 'preparing', null, p_actor_user_id, p_source
    );
  elsif v_order.production_status = 'queued' then
    v_result := public.order_transition_internal(
      p_order_id, 'production', 'preparing', null, p_actor_user_id, p_source
    );
  elsif v_order.production_status = 'preparing' then
    v_result := jsonb_build_object(
      'order_id', v_order.id,
      'domain', 'production',
      'from', 'preparing',
      'to', 'preparing',
      'changed', false
    );
  else
    raise exception 'production cannot be started from state %', v_order.production_status;
  end if;

  return v_result;
end;
$$;

revoke all on function public.order_start_production_internal(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.order_start_production_internal(uuid,uuid,text) to service_role;
