-- Issue #888 — pico controlado de 50 pedidos sem tocar dados operacionais.
-- A execução de produção foi validada antes com a conta controlada autorizada.
-- A versão permanente usa identidade descartável e reverte tudo ao final.
begin;

create temporary table fluid_rollout_report (
  metric text primary key,
  value numeric not null
) on commit drop;

do $$
declare
  v_user_id constant uuid := 'f8888888-8888-4888-8888-888888888888';
  v_organization_id constant uuid := 'f8880000-0000-4000-8000-000000000001';
  v_store_id constant uuid := 'f8880000-0000-4000-8000-000000000011';
  v_product_id constant uuid := 'f8880000-0000-4000-8000-000000000021';
  v_role_id constant uuid := 'f8880000-0000-4000-8000-000000000031';
  v_cart_id uuid;
  v_checkout_id uuid;
  v_order_id uuid;
  v_cart_token text;
  v_order_token text;
  v_result jsonb;
  v_started_at timestamptz;
  v_elapsed_ms numeric;
  v_count integer;
  i integer;
begin
  insert into auth.users (id,email)
  values (v_user_id,'quality-fluid-rollout@example.invalid');

  insert into public.organizations (id,name,status,created_by)
  values (v_organization_id,'Issue 888 — fixture descartável','trial',v_user_id);
  insert into public.stores (id,organization_id,name,slug,status,is_primary)
  values (v_store_id,v_organization_id,'Pico 50 pedidos','issue-888-pico','active',true);
  insert into public.roles (id,organization_id,key,name,is_system)
  values (v_role_id,v_organization_id,'owner','Proprietário de teste',true);
  insert into public.organization_members (organization_id,user_id,role_id,status)
  values (v_organization_id,v_user_id,v_role_id,'active');
  insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
  values (v_product_id,v_organization_id,v_store_id,'Item de pico',2490,true,'available');

  v_started_at := clock_timestamp();
  for i in 1..50 loop
    v_cart_id := gen_random_uuid();
    v_checkout_id := gen_random_uuid();
    v_cart_token := repeat(substr(md5('cart-' || i::text),1,32),2);
    v_order_token := repeat(substr(md5('order-' || i::text),1,32),2);

    insert into public.carts (
      id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,
      delivery_fee_cents,total_cents,expires_at
    ) values (
      v_cart_id,v_organization_id,v_store_id,v_cart_token,'active',2490,0,0,2490,
      now()+interval '1 day'
    );
    insert into public.cart_items (
      organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,
      unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,
      line_total_cents,validation_status
    ) values (
      v_organization_id,v_store_id,v_cart_id,v_product_id,'Item de pico',1,
      2490,0,2490,2490,'valid'
    );
    insert into public.checkout_sessions (
      id,organization_id,store_id,cart_id,customer_name,customer_phone,
      customer_phone_normalized,fulfillment_type,delivery_quote_status,
      delivery_fee_cents,payment_method,reviewed_at
    ) values (
      v_checkout_id,v_organization_id,v_store_id,v_cart_id,
      'Cliente Pico ' || lpad(i::text,2,'0'),'(19) 99999-0000','19999990000',
      'pickup','not_required',0,'cash',now()
    );

    v_result := public.create_order_from_checkout_internal(v_store_id,v_cart_token,v_order_token);
    v_order_id := (v_result->>'order_id')::uuid;
    if v_order_id is null or coalesce((v_result->>'created')::boolean,false) is not true then
      raise exception 'pedido % não foi criado corretamente',i;
    end if;
  end loop;
  v_elapsed_ms := extract(epoch from (clock_timestamp()-v_started_at))*1000;

  select count(*) into v_count from public.orders
  where organization_id=v_organization_id and store_id=v_store_id;
  if v_count <> 50 then raise exception 'esperados 50 pedidos, encontrados %',v_count; end if;

  if (select count(distinct display_number) from public.orders where store_id=v_store_id) <> 50 then
    raise exception 'numeração duplicada no pico';
  end if;
  if (select count(distinct source_cart_id) from public.orders where store_id=v_store_id) <> 50 then
    raise exception 'carrinho convertido mais de uma vez';
  end if;
  if (select count(*) from public.orders where store_id=v_store_id and order_status='pending_confirmation') <> 50 then
    raise exception 'algum pedido ativo ficou fora do estado operacional esperado';
  end if;

  insert into fluid_rollout_report(metric,value) values
    ('orders_created',50),
    ('unique_display_numbers',50),
    ('unique_source_carts',50),
    ('active_orders_visible',50),
    ('elapsed_ms',round(v_elapsed_ms,2)),
    ('average_ms_per_order',round(v_elapsed_ms/50,2));
end $$;

select metric,value from fluid_rollout_report order by metric;
rollback;
