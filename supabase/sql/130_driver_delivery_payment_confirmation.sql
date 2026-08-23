-- PedeAqui — confirmação atômica de entrega + pagamento pelo entregador
--
-- Objetivo do fluxo simplificado:
-- 1. O entregador confirma a entrega e, por padrão, confirma também que recebeu o pagamento pendente.
-- 2. Se o cliente não pagar ou houver qualquer eventualidade, o entregador marca a exceção e informa uma observação.
-- 3. A entrega continua registrada como entregue, mas o pagamento permanece pendente e o pedido não é concluído.
-- 4. Quando entrega + pagamento estão liquidados, a regra canônica existente conclui o pedido automaticamente.
--
-- A função é service_role-only. O servidor continua responsável por validar que o ator pode operar a entrega
-- e, quando for um entregador restrito, que a entrega está atribuída ao seu cadastro.

create or replace function public.delivery_confirm_with_payment_internal(
  p_delivery_id uuid,
  p_payment_received boolean,
  p_payment_note text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_payment_count integer := 0;
  v_delivery_result jsonb;
  v_payment_confirmed boolean := false;
  v_exception_key text;
begin
  if p_actor_user_id is null then raise exception 'delivery actor is required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 220 then
    raise exception 'invalid delivery idempotency key';
  end if;
  if char_length(coalesce(p_payment_note,'')) > 500 then raise exception 'payment note is too long'; end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;
  if v_delivery.id is null then raise exception 'delivery not found'; end if;
  if v_delivery.driver_id is null then raise exception 'delivery has no driver'; end if;

  select * into v_order
  from public.orders
  where id = v_delivery.order_id
  for update;
  if v_order.id is null then raise exception 'order not found'; end if;

  -- Retry seguro: se a entrega já foi registrada por esta chave, não repete pagamento, histórico ou conclusão.
  if exists(
    select 1 from public.delivery_history h
    where h.organization_id = v_delivery.organization_id
      and h.idempotency_key = trim(p_idempotency_key)
      and h.delivery_id = v_delivery.id
      and h.event_type = 'delivered'
  ) then
    return jsonb_build_object(
      'delivery_id', v_delivery.id,
      'order_id', v_order.id,
      'to', 'delivered',
      'changed', false,
      'payment_confirmed', false,
      'payment_status', v_order.payment_status,
      'order_status', v_order.order_status
    );
  end if;

  if v_order.fulfillment_status <> 'out_for_delivery' then
    if v_order.fulfillment_status = 'delivered' then
      return jsonb_build_object(
        'delivery_id', v_delivery.id,
        'order_id', v_order.id,
        'to', 'delivered',
        'changed', false,
        'payment_confirmed', false,
        'payment_status', v_order.payment_status,
        'order_status', v_order.order_status
      );
    end if;
    raise exception 'delivery must be out for delivery before confirmation';
  end if;

  -- Pagamentos já liquidados não precisam de nova ação do entregador.
  if p_payment_received and v_order.payment_status not in ('paid','partially_refunded','refunded') then
    select count(*)::integer into v_payment_count
    from public.payments p
    where p.order_id = v_order.id
      and p.status in ('pending','authorized');

    if v_payment_count = 0 then raise exception 'no pending payment found for delivery'; end if;
    if v_payment_count > 1 then raise exception 'multiple pending payments require backoffice confirmation'; end if;

    select * into v_payment
    from public.payments p
    where p.order_id = v_order.id
      and p.status in ('pending','authorized')
    order by p.created_at
    limit 1
    for update;

    perform public.payment_confirm_internal(
      v_payment.id,
      null,
      null,
      p_actor_user_id,
      'panel'
    );
    v_payment_confirmed := true;
  elsif not p_payment_received and v_order.payment_status not in ('paid','partially_refunded','refunded') then
    if char_length(trim(coalesce(p_payment_note,''))) < 3 then
      raise exception 'payment exception note is required';
    end if;
  end if;

  -- Com o pagamento já liquidado, a função canônica abaixo também conclui o pedido.
  v_delivery_result := public.delivery_transition_internal(
    v_delivery.id,
    'delivered',
    trim(p_idempotency_key),
    p_actor_user_id
  );

  if not p_payment_received and v_order.payment_status not in ('paid','partially_refunded','refunded') then
    v_exception_key := left(trim(p_idempotency_key), 200) || ':payment-exception';
    insert into public.delivery_history(
      organization_id,store_id,delivery_id,order_id,event_type,
      from_driver_id,to_driver_id,reason,idempotency_key,actor_user_id,metadata
    ) values (
      v_delivery.organization_id,v_delivery.store_id,v_delivery.id,v_delivery.order_id,
      'payment_not_received',v_delivery.driver_id,v_delivery.driver_id,trim(p_payment_note),
      v_exception_key,p_actor_user_id,
      jsonb_build_object('payment_status',v_order.payment_status,'source','driver_delivery_confirmation')
    ) on conflict (organization_id,idempotency_key) do nothing;

    insert into public.audit_logs(
      organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data,request_id
    ) values (
      v_delivery.organization_id,v_delivery.store_id,p_actor_user_id,
      'delivery.payment_not_received','delivery',v_delivery.id,
      jsonb_build_object('order_id',v_order.id,'reason',trim(p_payment_note),'payment_status',v_order.payment_status),
      left(trim(p_idempotency_key),120)
    );
  end if;

  select * into v_order from public.orders where id = v_order.id;
  return coalesce(v_delivery_result,'{}'::jsonb) || jsonb_build_object(
    'order_id',v_order.id,
    'payment_confirmed',v_payment_confirmed,
    'payment_received',p_payment_received,
    'payment_status',v_order.payment_status,
    'order_status',v_order.order_status
  );
end;
$$;

revoke all on function public.delivery_confirm_with_payment_internal(uuid,boolean,text,text,uuid) from public, anon, authenticated;
grant execute on function public.delivery_confirm_with_payment_internal(uuid,boolean,text,text,uuid) to service_role;
