-- Auditoria mobile: dados FICTÍCIOS para a loja de teste no banco local descartável.
-- Cada bloco é independente: se um falhar, os outros continuam (o aviso aparece no log).
select set_config('seed.org', :'org', false), set_config('seed.store', :'store', false), set_config('seed.user', :'usr', false);

-- Todos os módulos ligados, para todas as páginas aparecerem.
do $$
declare k text;
begin
  foreach k in array array['dashboard','orders','conversations','dining','catalog','pdv','cash','finance','fiscal','production','deliveries','driver','inventory','suppliers','purchases','customers','growth','scale','team','settings','gas_containers'] loop
    begin
      insert into public.store_modules (organization_id, store_id, module_key, enabled, configuration_source)
      values (current_setting('seed.org')::uuid, current_setting('seed.store')::uuid, k, true, 'manual')
      on conflict (store_id, module_key) do update set enabled = true;
    exception when others then raise warning 'SEED module % skipped: %', k, sqlerrm;
    end;
  end loop;
end $$;

-- Cardápio
do $$
declare
  o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid; u uuid := current_setting('seed.user')::uuid;
  c_combo uuid; c_past uuid; c_salg uuid; c_beb uuid; c_doce uuid;
  p uuid; g uuid; i int := 0;
  flavor text; flavors text[] := array['Coxinha','Kibe','Bolinha de queijo','Presunto e queijo','Salsicha','Calabresa com queijo','Risole de carne'];
  pastel text; pasteis text[] := array['Carne','Queijo','Pizza','Frango cremoso','Carne com queijo','Calabresa com queijo'];
  rec record;
begin
  insert into public.categories (organization_id, store_id, name, description, sort_order, active) values (o,s,'Combos',null,0,true) returning id into c_combo;
  insert into public.categories (organization_id, store_id, name, description, sort_order, active) values (o,s,'Pastéis','Mini pastéis fritos na hora.',10,true) returning id into c_past;
  insert into public.categories (organization_id, store_id, name, description, sort_order, active) values (o,s,'Salgados','Salgados fritos. Escolha um ou mais sabores.',20,true) returning id into c_salg;
  insert into public.categories (organization_id, store_id, name, description, sort_order, active) values (o,s,'Bebidas',null,30,true) returning id into c_beb;
  insert into public.categories (organization_id, store_id, name, description, sort_order, active) values (o,s,'Doces',null,40,true) returning id into c_doce;

  -- Salgados: cada tamanho tem sua própria cópia do grupo de sabores (como acontece nas lojas reais).
  for rec in select * from (values ('Copo com 12 salgados',1499,12),('Caixa com 30 salgados',2200,30),('Caixa com 50 salgados',3490,50),('Caixa com 100 salgados',6490,100),('Combo Casal (2 latas)',3490,30),('Combo Família (Coca 2L)',4990,50)) v(name,price,qty) loop
    i := i + 10;
    insert into public.products (organization_id, store_id, category_id, name, description, price_cents, active, availability, sort_order)
    values (o,s, case when rec.name like 'Combo%' then c_combo else c_salg end, rec.name, rec.qty || ' unidades. Escolha os sabores — a quantidade é dividida entre eles.', rec.price, true, 'available', i) returning id into p;
    insert into public.modifier_groups (organization_id, store_id, name, description, required, min_selection, max_selection, sort_order, active)
    values (o,s,'Escolha os sabores · ' || rec.qty || ' unidades','A quantidade total é dividida entre os sabores escolhidos.',true,1,6,0,true) returning id into g;
    begin update public.modifier_groups set selection_mode='equal_split_options', distribution_total=rec.qty where id=g; exception when others then raise warning 'SEED split skipped: %', sqlerrm; end;
    foreach flavor in array flavors loop
      insert into public.modifiers (organization_id, store_id, modifier_group_id, name, price_cents, sort_order, active)
      values (o,s,g,flavor,0,array_position(flavors,flavor)*10, flavor <> 'Risole de carne');
    end loop;
    insert into public.product_modifier_groups (organization_id, store_id, product_id, modifier_group_id, sort_order) values (o,s,p,g,10);
  end loop;

  for rec in select * from (values ('Caixa com 25 pastéis',3500,25),('Caixa com 50 pastéis',6500,50),('Caixa com 100 pastéis',12500,100)) v(name,price,qty) loop
    i := i + 10;
    insert into public.products (organization_id, store_id, category_id, name, description, price_cents, active, availability, sort_order)
    values (o,s,c_past,rec.name,rec.qty || ' mini pastéis. Escolha um ou mais sabores.',rec.price,true,'available',i) returning id into p;
    insert into public.modifier_groups (organization_id, store_id, name, description, required, min_selection, max_selection, sort_order, active)
    values (o,s,'Sabores dos pastéis — caixa ' || rec.qty,null,true,1,6,0,true) returning id into g;
    foreach pastel in array pasteis loop
      insert into public.modifiers (organization_id, store_id, modifier_group_id, name, price_cents, sort_order, active) values (o,s,g,pastel,0,array_position(pasteis,pastel)*10,true);
    end loop;
    insert into public.modifiers (organization_id, store_id, modifier_group_id, name, price_cents, sort_order, active) values (o,s,g,'Catupiry extra',300,90,true);
    insert into public.product_modifier_groups (organization_id, store_id, product_id, modifier_group_id, sort_order) values (o,s,p,g,10);
  end loop;

  insert into public.products (organization_id, store_id, category_id, name, description, price_cents, active, availability, sort_order) values
    (o,s,c_beb,'Coca-Cola 2L',null,1500,true,'available',10),
    (o,s,c_beb,'Coca-Cola lata 350 ml',null,600,true,'available',20),
    (o,s,c_beb,'Guaraná 2L',null,900,true,'sold_out',30),
    (o,s,c_beb,'Água sem gás 500 ml',null,350,true,'available',40),
    (o,s,c_doce,'Copo com 12 mini churros','Recheados com doce de leite.',1699,true,'available',10),
    (o,s,c_doce,'Caixa com 30 mini churros','Recheados com doce de leite. Nome propositalmente longo para testar quebra de linha no celular',2500,true,'available',20),
    (o,s,c_doce,'Brigadeiro gourmet',null,450,false,'hidden',30);
exception when others then raise warning 'SEED catalog failed: %', sqlerrm;
end $$;

-- Horários, entrega, pagamento, salão, caixa
do $$ declare o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid; d int;
begin
  for d in 0..6 loop insert into public.store_hours (organization_id, store_id, weekday, opens_at, closes_at, closes_next_day, active) values (o,s,d,'00:00','23:59',false,true); end loop;
exception when others then raise warning 'SEED hours failed: %', sqlerrm; end $$;

do $$ declare o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid; n text; fee int := 400;
begin
  foreach n in array array['Centro','Vila Nova','Jardim América','Parque das Flores','São José','Santa Luzia','Jardim Primavera','Vila Industrial','Bela Vista','Cidade Alta','Residencial dos Ipês Amarelos e Roxos','Morada do Sol'] loop
    insert into public.delivery_neighborhoods (organization_id, store_id, neighborhood_name, neighborhood_key, city, state, fee_cents, active)
    values (o,s,n,lower(regexp_replace(n,'\s+','-','g')),'Campinas','SP',fee,true); fee := fee + 50;
  end loop;
exception when others then raise warning 'SEED neighborhoods failed: %', sqlerrm; end $$;

do $$ declare o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid; m text; k int := 0;
begin
  foreach m in array array['cash','pix','credit_card','debit_card'] loop
    k := k + 1;
    insert into public.store_payment_methods (organization_id, store_id, method, enabled, sort_order) values (o,s,m,true,k) on conflict (store_id, method) do update set enabled = true;
  end loop;
exception when others then raise warning 'SEED payments failed: %', sqlerrm; end $$;

do $$ declare o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid;
begin
  update public.store_menu_settings set accepting_orders = true, active = true, allow_pickup = true, allow_delivery = true where store_id = s;
  if not found then
    insert into public.store_menu_settings (organization_id, store_id, active, accepting_orders, allow_pickup, allow_delivery, show_search, show_categories) values (o,s,true,true,true,true,true,true);
  end if;
exception when others then raise warning 'SEED menu settings failed: %', sqlerrm; end $$;

do $$ declare o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid; t int;
begin
  for t in 1..8 loop insert into public.tables (organization_id, store_id, code, name, capacity, status, area, sort_order) values (o,s,'M' || t,'Mesa ' || t,4, case when t in (2,5) then 'occupied' else 'available' end, case when t <= 5 then 'Salão' else 'Varanda' end, t); end loop;
exception when others then raise warning 'SEED tables failed: %', sqlerrm; end $$;

do $$ declare o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid;
begin
  insert into public.cash_registers (organization_id, store_id, code, name, active) values (o,s,'CAIXA1','Caixa principal',true);
exception when others then raise warning 'SEED cash register failed: %', sqlerrm; end $$;

-- Pedidos pelo mesmo caminho do checkout real (carrinho → checkout → pedido).
do $$
declare
  o uuid := current_setting('seed.org')::uuid; s uuid := current_setting('seed.store')::uuid; u uuid := current_setting('seed.user')::uuid;
  prod record; cart uuid; res jsonb; ord uuid; n int;
  names text[] := array['Ana Souza','Bruno Lima','Carla Mendes','Diego Rocha','Elaine Prado','Fábio Nunes','Gabriela Torres','Henrique Alves','Isabela Costa','João Pedro Martins'];
begin
  for n in 1..10 loop
    begin
      select id, name, price_cents into prod from public.products where store_id = s and availability = 'available'
        and not exists (select 1 from public.product_modifier_groups l where l.product_id = products.id) order by name offset (n % 4) limit 1;
      insert into public.carts (organization_id, store_id, token_hash, status, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, expires_at)
      values (o,s,md5('cart' || n) || md5('c' || n),'active',prod.price_cents*2,0,0,prod.price_cents*2,now()+interval '1 day') returning id into cart;
      insert into public.cart_items (organization_id, store_id, cart_id, product_id, product_name_snapshot, quantity, unit_base_price_cents, unit_modifiers_price_cents, unit_total_price_cents, line_total_cents, validation_status)
      values (o,s,cart,prod.id,prod.name,2,prod.price_cents,0,prod.price_cents,prod.price_cents*2,'valid');
      insert into public.checkout_sessions (organization_id, store_id, cart_id, customer_name, customer_phone, customer_phone_normalized, fulfillment_type, delivery_quote_status, delivery_fee_cents, payment_method, reviewed_at)
      values (o,s,cart,names[n],'(19) 99999-' || lpad(n::text,4,'0'),'1999999' || lpad(n::text,4,'0'),'pickup','not_required',0, case when n % 2 = 0 then 'pix' else 'cash' end, now());
      res := public.create_order_from_checkout_internal(s, md5('cart' || n) || md5('c' || n), md5('idem' || n) || md5('i' || n));
      ord := (res->>'order_id')::uuid;
      if n >= 4 then perform public.order_transition_internal(ord,'order','confirmed',null,u,'panel'); end if;
      if n >= 6 then perform public.order_start_production_internal(ord,u,'panel'); end if;
    exception when others then raise warning 'SEED order % failed: %', n, sqlerrm;
    end;
  end loop;
end $$;

select 'SEED_SUMMARY products=' || (select count(*) from public.products where store_id = current_setting('seed.store')::uuid)
  || ' groups=' || (select count(*) from public.modifier_groups where store_id = current_setting('seed.store')::uuid)
  || ' orders=' || (select count(*) from public.orders where store_id = current_setting('seed.store')::uuid)
  || ' modules=' || (select count(*) from public.store_modules where store_id = current_setting('seed.store')::uuid and enabled);
