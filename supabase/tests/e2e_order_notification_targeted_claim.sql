-- PedeAqui FLOW-02 — claim determinístico por order_id sob backlog, concorrência e retry.
-- Usa pedidos reais criados pelo checkout para exercitar domain_events + trigger da fila.
begin;

insert into auth.users (id,email)
values ('f7777777-7777-4777-8777-777777777777','quality-targeted-notification@example.invalid');

insert into public.organizations (id,name,created_by)
values ('f3000000-0000-4000-8000-000000000001','Quality Targeted Notification Org','f7777777-7777-4777-8777-777777777777');

insert into public.stores (id,organization_id,name,slug,status)
values ('f3000000-0000-4000-8000-000000000011','f3000000-0000-4000-8000-000000000001','Targeted Notification Store','quality-targeted-notification','active');

insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
values ('f3000000-0000-4000-8000-000000000021','f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000011','Produto Teste',1000,true,'available');

do $$
declare
  v_index integer;
  v_cart_id uuid;
  v_token text;
  v_access_token text;
  v_result jsonb;
  v_order_id uuid;
  v_target_order_id uuid;
  v_count integer;
  v_target_notification_id uuid;
  v_attempts integer;
  v_job record;
begin
  -- 26 pedidos anteriores + 1 pedido alvo. Cada checkout emite order.created e o
  -- trigger autoritativo cria order_received na fila.
  for v_index in 1..27 loop
    v_cart_id := gen_random_uuid();
    v_token := md5('flow02-cart-' || v_index::text) || md5('flow02-cart-b-' || v_index::text);
    v_access_token := md5('flow02-access-' || v_index::text) || md5('flow02-access-b-' || v_index::text);

    insert into public.carts (
      id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,
      delivery_fee_cents,total_cents,expires_at,created_at,updated_at
    ) values (
      v_cart_id,'f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000011',
      v_token,'active',1000,0,0,1000,clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp()
    );

    insert into public.cart_items (
      id,organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,
      unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents,validation_status
    ) values (
      gen_random_uuid(),'f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000011',
      v_cart_id,'f3000000-0000-4000-8000-000000000021','Produto Teste',1,1000,0,1000,1000,'valid'
    );

    insert into public.checkout_sessions (
      id,organization_id,store_id,cart_id,customer_name,customer_phone,customer_phone_normalized,
      fulfillment_type,delivery_quote_status,delivery_fee_cents,payment_method,reviewed_at,created_at,updated_at
    ) values (
      gen_random_uuid(),'f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000011',
      v_cart_id,'Cliente ' || v_index::text,'(19) 99999-1111','19999991111','pickup','not_required',0,'cash',
      clock_timestamp(),clock_timestamp(),clock_timestamp()
    );

    v_result := public.create_order_from_checkout_internal(
      'f3000000-0000-4000-8000-000000000011',v_token,v_access_token
    );
    v_order_id := (v_result->>'order_id')::uuid;
    if v_index = 27 then
      v_target_order_id := v_order_id;
    end if;
  end loop;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id='f3000000-0000-4000-8000-000000000001'
     and notification_type='order_received';
  if v_count <> 27 then
    raise exception 'expected 27 order_received jobs from authoritative events, got %',v_count;
  end if;

  -- Garante backlog antigo acima do limite 25 e deixa o pedido alvo como o mais novo.
  update public.order_whatsapp_notifications
     set available_at=clock_timestamp()-interval '1 hour',
         created_at=clock_timestamp()-interval '1 hour'
   where organization_id='f3000000-0000-4000-8000-000000000001'
     and order_id<>v_target_order_id;
  update public.order_whatsapp_notifications
     set available_at=now()-interval '1 second',
         created_at=clock_timestamp()
   where organization_id='f3000000-0000-4000-8000-000000000001'
     and order_id=v_target_order_id;

  -- O worker genérico lotado em 25 não deve alcançar o pedido mais novo.
  select count(*) into v_count
    from public.order_notification_claim_internal('flow02-generic-worker',25);
  if v_count <> 25 then
    raise exception 'generic worker expected to claim 25 backlog jobs, got %',v_count;
  end if;
  if (select status from public.order_whatsapp_notifications where order_id=v_target_order_id and notification_type='order_received') <> 'pending' then
    raise exception 'target order should still be pending after generic backlog claim';
  end if;

  -- O claim direcionado encontra imediatamente o job do pedido alvo, apesar do backlog.
  select id into v_target_notification_id
    from public.order_notification_claim_for_order_internal(v_target_order_id,'flow02-target-worker-a',25)
   limit 1;
  if v_target_notification_id is null then
    raise exception 'targeted worker did not claim target order';
  end if;
  if (select locked_by from public.order_whatsapp_notifications where id=v_target_notification_id) <> 'flow02-target-worker-a' then
    raise exception 'targeted lease owner mismatch';
  end if;

  -- Um segundo worker não pode roubar o mesmo lease ainda válido.
  select count(*) into v_count
    from public.order_notification_claim_for_order_internal(v_target_order_id,'flow02-target-worker-b',25);
  if v_count <> 0 then
    raise exception 'second worker should not claim an active lease, got % rows',v_count;
  end if;

  -- Falha transitória agenda retry futuro; não pode ser reclamada antes de available_at.
  perform public.order_notification_finish_internal(
    v_target_notification_id,'flow02-target-worker-a','failed',null,'transient_test','retry test',300
  );
  select count(*) into v_count
    from public.order_notification_claim_for_order_internal(v_target_order_id,'flow02-target-worker-b',25);
  if v_count <> 0 then
    raise exception 'retry was claimed before available_at';
  end if;

  -- Ao vencer o retry, o mesmo job volta a ser recuperável e attempts incrementa.
  update public.order_whatsapp_notifications
     set available_at=clock_timestamp()-interval '1 second'
   where id=v_target_notification_id;
  select count(*) into v_count
    from public.order_notification_claim_for_order_internal(v_target_order_id,'flow02-target-worker-b',25);
  if v_count <> 1 then
    raise exception 'retry should reclaim exactly one target job, got %',v_count;
  end if;
  select attempts into v_attempts from public.order_whatsapp_notifications where id=v_target_notification_id;
  if v_attempts <> 2 then
    raise exception 'expected attempts=2 after retry claim, got %',v_attempts;
  end if;

  -- A chave única por pedido + tipo continua impedindo trabalho duplicado.
  insert into public.order_whatsapp_notifications (
    organization_id,store_id,order_id,domain_event_id,notification_type
  )
  select organization_id,store_id,order_id,domain_event_id,notification_type
    from public.order_whatsapp_notifications
   where id=v_target_notification_id
  on conflict (organization_id,order_id,notification_type) do nothing;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where order_id=v_target_order_id and notification_type='order_received';
  if v_count <> 1 then
    raise exception 'idempotency violated: expected one target notification, got %',v_count;
  end if;

  -- Finaliza o alvo após o retry e drena os 25 claims iniciais.
  perform public.order_notification_finish_internal(
    v_target_notification_id,'flow02-target-worker-b','sent',gen_random_uuid(),null,null,null
  );
  for v_job in
    select id
      from public.order_whatsapp_notifications
     where organization_id='f3000000-0000-4000-8000-000000000001'
       and locked_by='flow02-generic-worker'
  loop
    perform public.order_notification_finish_internal(
      v_job.id,'flow02-generic-worker','sent',gen_random_uuid(),null,null,null
    );
  end loop;

  -- O 27º job, que ficou fora do primeiro lote de 25, também deve ser reclamado
  -- e finalizado sem perda nem criação de uma segunda linha.
  for v_job in
    select id from public.order_notification_claim_internal('flow02-drain-worker',25)
  loop
    perform public.order_notification_finish_internal(
      v_job.id,'flow02-drain-worker','sent',gen_random_uuid(),null,null,null
    );
  end loop;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id='f3000000-0000-4000-8000-000000000001'
     and status='sent';
  if v_count <> 27 then
    raise exception 'backlog drain expected 27 sent jobs, got %',v_count;
  end if;
  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id='f3000000-0000-4000-8000-000000000001';
  if v_count <> 27 then
    raise exception 'backlog drain changed job cardinality, got % rows',v_count;
  end if;
end $$;

rollback;
