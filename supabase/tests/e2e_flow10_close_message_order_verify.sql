-- PedeAqui FLOW-10 / D02 — verify a concurrent replay converges to one aggregate.
\set ON_ERROR_STOP on

select set_config('flow10.fixture_slug', :'fixture_slug', false);

do $$
declare
  v_slug text := current_setting('flow10.fixture_slug');
  v_organization_id uuid;
  v_store_id uuid;
  v_cart_id uuid;
  v_order_id uuid;
  v_count integer;
begin
  select organization_id,id into v_organization_id,v_store_id
    from public.stores where slug=v_slug;
  if v_store_id is null then raise exception 'close-message fixture not found'; end if;

  select id into v_cart_id
    from public.carts
   where organization_id=v_organization_id and store_id=v_store_id;

  select count(*) into v_count
    from public.orders
   where source_cart_id=v_cart_id;
  if v_count <> 1 then raise exception 'expected one canonical order, got %',v_count; end if;
  select id into v_order_id
    from public.orders
   where source_cart_id=v_cart_id;
  if (select channel from public.orders where id=v_order_id) <> 'whatsapp' then
    raise exception 'canonical order did not preserve WhatsApp channel';
  end if;

  select count(*) into v_count
    from public.order_state_history where order_id=v_order_id;
  if v_count <> 4 then raise exception 'expected four initial state transitions, got %',v_count; end if;

  select count(*) into v_count
    from public.domain_events
   where event_type='order.created' and entity_type='order' and entity_id=v_order_id;
  if v_count <> 1 then raise exception 'expected one order.created event, got %',v_count; end if;

  select count(*) into v_count
    from public.messages
   where store_id=v_store_id
     and direction='inbound'
     and external_message_id in (v_slug || ':confirmation-a',v_slug || ':confirmation-b');
  if v_count <> 2 then raise exception 'expected two distinct inbound confirmations, got %',v_count; end if;

  select count(*) into v_count
    from public.domain_events e
    join public.messages m on m.id=e.entity_id
   where e.event_type='conversation.message_received'
     and m.store_id=v_store_id
     and m.external_message_id in (v_slug || ':confirmation-a',v_slug || ':confirmation-b');
  if v_count <> 2 then raise exception 'expected two inbound domain events, got %',v_count; end if;

  if (select status from public.carts where id=v_cart_id) <> 'converted' then
    raise exception 'source cart was not converted';
  end if;
end $$;

select 'FLOW10_CLOSE_MESSAGE_ORDER_RESULT=passed';
