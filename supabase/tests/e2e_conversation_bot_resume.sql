-- PedeAqui FLOW-08 — retomada Robô ↔ Humano ↔ Robô sobre contexto canônico.
-- Exercita sessão ativa, carrinho real e correlação exata via orders.source_cart_id.
begin;

insert into auth.users (id,email)
values ('f8888888-8888-4888-8888-888888888888','quality-flow08@example.invalid');

insert into public.organizations (id,name,created_by)
values ('f8000000-0000-4000-8000-000000000001','Quality Flow08 Org','f8888888-8888-4888-8888-888888888888');

insert into public.stores (id,organization_id,name,slug,status)
values ('f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000001','Flow08 Store','quality-flow08','active');

insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
values ('f8000000-0000-4000-8000-000000000021','f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','Produto Flow08',1000,true,'available');

insert into public.contacts (
  id,organization_id,store_id,channel,external_id,phone_normalized,name
) values (
  'f8000000-0000-4000-8000-000000000031','f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000011','whatsapp','5519999991111','5519999991111','Cliente Flow08'
);

insert into public.conversations (
  id,organization_id,store_id,contact_id,channel,status
) values (
  'f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000031','whatsapp','waiting_agent'
);

do $$
declare
  v_raw_token text := 'flow08-cart-token';
  v_token_hash text;
  v_cart_id uuid := 'f8000000-0000-4000-8000-000000000051';
  v_result jsonb;
  v_created jsonb;
  v_order_id uuid;
  v_step text;
  v_context jsonb;
  v_status text;
begin
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token,'UTF8'),'sha256'),'hex');

  insert into public.carts (
    id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,
    delivery_fee_cents,total_cents,expires_at,created_at,updated_at
  ) values (
    v_cart_id,'f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011',
    v_token_hash,'active',1000,0,0,1000,clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp()
  );

  insert into public.automation_sessions (
    organization_id,store_id,conversation_id,state,step,context,expires_at
  ) values (
    'f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000041','active','order_payment',
    jsonb_build_object('channel','whatsapp_order','version',1,'cartToken',v_raw_token,'paymentLabel','Dinheiro'),
    clock_timestamp()+interval '12 hours'
  );

  -- Sessão e carrinho ainda válidos: volta ao bot sem perder step/contexto.
  v_result := public.conversation_resume_bot_internal(
    'f8000000-0000-4000-8000-000000000001',
    'f8000000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000041',
    'f8888888-8888-4888-8888-888888888888'
  );

  if v_result->>'mode' <> 'preserved' or v_result->>'reason' <> 'preserve_order_step' then
    raise exception 'expected preserved order session, got %',v_result;
  end if;
  select status into v_status from public.conversations where id='f8000000-0000-4000-8000-000000000041';
  if v_status <> 'bot' then raise exception 'conversation should be bot after preserved resume'; end if;
  select step,context into v_step,v_context from public.automation_sessions where conversation_id='f8000000-0000-4000-8000-000000000041';
  if v_step <> 'order_payment' or v_context->>'cartToken' <> v_raw_token then
    raise exception 'order session was not preserved exactly';
  end if;

  -- Prepara checkout real para o mesmo carrinho e converte em pedido.
  insert into public.cart_items (
    id,organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,
    unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents,validation_status
  ) values (
    gen_random_uuid(),'f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011',
    v_cart_id,'f8000000-0000-4000-8000-000000000021','Produto Flow08',1,1000,0,1000,1000,'valid'
  );

  insert into public.checkout_sessions (
    id,organization_id,store_id,cart_id,customer_name,customer_phone,customer_phone_normalized,
    fulfillment_type,delivery_quote_status,delivery_fee_cents,payment_method,reviewed_at,created_at,updated_at
  ) values (
    gen_random_uuid(),'f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011',
    v_cart_id,'Cliente Flow08','(19) 99999-1111','19999991111','pickup','not_required',0,'cash',
    clock_timestamp()+interval '1 second',clock_timestamp(),clock_timestamp()
  );

  -- Simula a automação pausada novamente enquanto o humano atua.
  perform public.conversation_transition_internal(
    'f8000000-0000-4000-8000-000000000041','waiting_agent',null,
    'quality flow08 handoff',null,'system'
  );
  update public.automation_sessions
     set step='order_confirmation',updated_at=clock_timestamp()
   where conversation_id='f8000000-0000-4000-8000-000000000041';

  v_created := public.create_order_from_checkout_internal(
    'f8000000-0000-4000-8000-000000000011',
    v_token_hash,
    repeat('a',64)
  );
  v_order_id := (v_created->>'order_id')::uuid;

  -- O mesmo carrinho já virou pedido: nunca pode retomar order_confirmation.
  v_result := public.conversation_resume_bot_internal(
    'f8000000-0000-4000-8000-000000000001',
    'f8000000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000041',
    'f8888888-8888-4888-8888-888888888888'
  );

  if v_result->>'mode' <> 'recovered' or v_result->>'reason' <> 'cart_already_converted' then
    raise exception 'converted cart should recover to safe menu, got %',v_result;
  end if;
  if (v_result->>'order_id')::uuid <> v_order_id then
    raise exception 'resume returned wrong correlated order: expected %, got %',v_order_id,v_result->>'order_id';
  end if;

  select step,context into v_step,v_context from public.automation_sessions where conversation_id='f8000000-0000-4000-8000-000000000041';
  if v_step <> 'menu' then raise exception 'converted cart must resume at menu, got %',v_step; end if;
  if (v_context#>>'{active_order,order_id}')::uuid <> v_order_id then
    raise exception 'safe menu did not preserve exact active_order reference';
  end if;

  -- Segunda chamada é idempotente porque a conversa já está em bot.
  v_result := public.conversation_resume_bot_internal(
    'f8000000-0000-4000-8000-000000000001',
    'f8000000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000041',
    'f8888888-8888-4888-8888-888888888888'
  );
  if v_result->>'mode' <> 'preserved' then
    raise exception 'duplicate resume should be idempotent, got %',v_result;
  end if;
end $$;

rollback;
