-- PedeAqui — bloco [102]–[110]
-- PDV autenticado: criação transacional, preço autoritativo, pagamentos, produção e impressão.

-- Pedidos internos não nascem de carts/checkout públicos. O canal digital continua obrigado
-- a manter as três provas de origem.
alter table public.orders alter column source_cart_id drop not null;
alter table public.orders alter column checkout_session_id drop not null;
alter table public.orders alter column public_access_token_hash drop not null;

alter table public.orders drop constraint if exists orders_digital_source_consistency;
alter table public.orders add constraint orders_digital_source_consistency check (
  channel <> 'digital_menu'
  or (source_cart_id is not null and checkout_session_id is not null and public_access_token_hash is not null)
);

-- O seed automático continua para checkout/outros canais simples, mas o PDV cria as linhas
-- explicitamente para suportar pagamento dividido na mesma venda.
create or replace function private.seed_order_payment_intent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_suffix text;
begin
  if new.channel = 'pdv' then
    return new;
  end if;

  v_source := case when new.channel = 'digital_menu' then 'checkout' else 'system' end;
  v_suffix := case when new.channel = 'digital_menu' then 'checkout' else new.channel end;

  insert into public.payments (
    organization_id, store_id, order_id, method, status, amount_cents,
    cash_tendered_cents, idempotency_key, source, metadata
  ) values (
    new.organization_id,
    new.store_id,
    new.id,
    new.payment_method_snapshot,
    'pending',
    new.total_cents,
    case when new.payment_method_snapshot = 'cash' then new.cash_change_for_cents else null end,
    'order:' || new.id::text || ':' || v_suffix || ':payment:1',
    v_source,
    jsonb_build_object('seeded_from_order', true, 'channel', new.channel)
  )
  on conflict (organization_id, idempotency_key) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_order_payment_intent() from public, anon, authenticated;

create or replace function public.pdv_create_order_internal(
  p_store_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_customer jsonb default null,
  p_idempotency_key text default null,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_idem public.idempotency_keys%rowtype;
  v_idem_inserted integer := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_group public.modifier_groups%rowtype;
  v_modifier_ids jsonb;
  v_requested_modifiers integer;
  v_distinct_modifiers integer;
  v_valid_modifiers integer;
  v_group_selected integer;
  v_modifier_total integer;
  v_modifier_snapshot jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_quantity integer;
  v_note text;
  v_base_price integer;
  v_unit_total integer;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_payment jsonb;
  v_payment_index integer := 0;
  v_payment_method text;
  v_payment_amount bigint;
  v_cash_received bigint;
  v_payment_total bigint := 0;
  v_first_payment_method text;
  v_payment_row public.payments%rowtype;
  v_change_due_total bigint := 0;
  v_customer_id uuid;
  v_customer_name text := 'Consumidor';
  v_customer_phone text := '';
  v_customer_email text;
  v_phone_normalized text;
  v_customer_row public.customers%rowtype;
  v_display_number bigint;
  v_order_id uuid;
  v_order_item_id uuid;
  v_snapshot jsonb;
  v_response jsonb;
begin
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 then
    raise exception 'invalid pdv idempotency key';
  end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'pdv cart is empty';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'too many pdv items'; end if;
  if jsonb_typeof(coalesce(p_payments,'null'::jsonb)) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'pdv payment is required';
  end if;
  if jsonb_array_length(p_payments) > 10 then raise exception 'too many payment lines'; end if;

  select * into v_store from public.stores where id = p_store_id and status = 'active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  insert into public.idempotency_keys (
    organization_id, store_id, scope, idempotency_key, status, expires_at
  ) values (
    v_store.organization_id, v_store.id, 'pdv.sale', trim(p_idempotency_key), 'processing', now() + interval '24 hours'
  ) on conflict (organization_id, scope, idempotency_key) do nothing;
  get diagnostics v_idem_inserted = row_count;

  select * into v_idem
  from public.idempotency_keys
  where organization_id = v_store.organization_id
    and scope = 'pdv.sale'
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if v_idem.id is null then raise exception 'pdv idempotency unavailable'; end if;
  if v_idem_inserted = 0 and v_idem.status = 'completed' and v_idem.response_body is not null then
    return v_idem.response_body;
  end if;
  if v_idem_inserted = 0 and v_idem.status = 'processing' and v_idem.expires_at > now() then
    raise exception 'pdv sale is already processing';
  end if;

  update public.idempotency_keys
  set status = 'processing', response_code = null, response_body = null,
      expires_at = now() + interval '24 hours', updated_at = now()
  where id = v_idem.id;

  -- Cliente é opcional. Quando há ID, snapshots vêm do banco. Quando há telefone novo,
  -- o cadastro só nasce junto com a venda, evitando clientes fantasmas.
  if p_customer is not null and jsonb_typeof(p_customer) = 'object' then
    if nullif(trim(coalesce(p_customer->>'id','')),'') is not null then
      select * into v_customer_row
      from public.customers
      where id = (p_customer->>'id')::uuid
        and organization_id = v_store.organization_id
        and deleted_at is null;
      if v_customer_row.id is null then raise exception 'customer unavailable'; end if;
      v_customer_id := v_customer_row.id;
      v_customer_name := v_customer_row.name;
      v_customer_phone := coalesce(v_customer_row.phone,'');
      v_customer_email := v_customer_row.email;
    else
      if nullif(trim(coalesce(p_customer->>'name','')),'') is not null then
        v_customer_name := trim(p_customer->>'name');
        if char_length(v_customer_name) < 2 or char_length(v_customer_name) > 120 then raise exception 'invalid customer name'; end if;
      end if;
      v_customer_phone := trim(coalesce(p_customer->>'phone',''));
      v_customer_email := nullif(trim(coalesce(p_customer->>'email','')),'');
      if v_customer_email is not null and v_customer_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'invalid customer email';
      end if;
      v_phone_normalized := regexp_replace(v_customer_phone, '[^0-9]', '', 'g');
      if v_phone_normalized <> '' then
        if char_length(v_phone_normalized) < 8 or char_length(v_phone_normalized) > 15 then raise exception 'invalid customer phone'; end if;
        insert into public.customers (
          organization_id, name, phone, phone_normalized, email, created_by, updated_by, created_at, updated_at
        ) values (
          v_store.organization_id, v_customer_name, v_customer_phone, v_phone_normalized,
          v_customer_email, p_actor_user_id, p_actor_user_id, now(), now()
        )
        on conflict (organization_id, phone_normalized)
          where phone_normalized is not null and deleted_at is null
        do update set
          name = excluded.name,
          phone = excluded.phone,
          email = coalesce(excluded.email, public.customers.email),
          updated_by = excluded.updated_by,
          updated_at = now()
        returning * into v_customer_row;
        v_customer_id := v_customer_row.id;
        v_customer_name := v_customer_row.name;
        v_customer_phone := coalesce(v_customer_row.phone,'');
        v_customer_email := v_customer_row.email;
      end if;
    end if;
  end if;

  -- Primeira passagem: validar o catálogo atual e construir snapshots autoritativos.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'invalid pdv item'; end if;
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 999 then raise exception 'invalid item quantity'; end if;
    v_note := nullif(left(trim(coalesce(v_item->>'note','')),500),'');

    select p.* into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.organization_id = v_store.organization_id
      and p.store_id = v_store.id
      and p.active = true
      and p.availability = 'available'
      and p.deleted_at is null
      and (p.category_id is null or exists (
        select 1 from public.categories c
        where c.id = p.category_id and c.organization_id = p.organization_id and c.store_id = p.store_id
          and c.active = true and c.deleted_at is null
      ));
    if v_product.id is null then raise exception 'product unavailable'; end if;

    v_modifier_ids := coalesce(v_item->'modifier_ids','[]'::jsonb);
    if jsonb_typeof(v_modifier_ids) <> 'array' then raise exception 'invalid modifiers'; end if;
    select count(*)::integer, count(distinct value)::integer
      into v_requested_modifiers, v_distinct_modifiers
    from jsonb_array_elements_text(v_modifier_ids);
    if v_requested_modifiers <> v_distinct_modifiers then raise exception 'duplicate modifier'; end if;
    if v_requested_modifiers > 40 then raise exception 'too many modifiers'; end if;

    -- Todos os grupos vinculados ativos precisam respeitar min/max, inclusive grupos obrigatórios sem seleção.
    for v_group in
      select mg.*
      from public.product_modifier_groups pmg
      join public.modifier_groups mg
        on mg.organization_id = pmg.organization_id and mg.store_id = pmg.store_id and mg.id = pmg.modifier_group_id
      where pmg.organization_id = v_store.organization_id and pmg.store_id = v_store.id
        and pmg.product_id = v_product.id and mg.active = true and mg.deleted_at is null
      order by pmg.sort_order, mg.sort_order, mg.id
    loop
      select count(*)::integer into v_group_selected
      from jsonb_array_elements_text(v_modifier_ids) x
      join public.modifiers m on m.id = x.value::uuid
      where m.organization_id = v_store.organization_id and m.store_id = v_store.id
        and m.modifier_group_id = v_group.id and m.active = true and m.deleted_at is null;
      if v_group_selected < v_group.min_selection or v_group_selected > v_group.max_selection then
        raise exception 'modifier group selection invalid: %', v_group.name;
      end if;
    end loop;

    select count(*)::integer,
      coalesce(sum(m.price_cents),0)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'modifier_group_id', mg.id,
        'modifier_id', m.id,
        'group_name', mg.name,
        'modifier_name', m.name,
        'unit_price_cents', m.price_cents
      ) order by mg.sort_order, m.sort_order, m.id), '[]'::jsonb)
    into v_valid_modifiers, v_modifier_total, v_modifier_snapshot
    from jsonb_array_elements_text(v_modifier_ids) x
    join public.modifiers m on m.id = x.value::uuid
      and m.organization_id = v_store.organization_id and m.store_id = v_store.id
      and m.active = true and m.deleted_at is null
    join public.modifier_groups mg on mg.id = m.modifier_group_id
      and mg.organization_id = m.organization_id and mg.store_id = m.store_id
      and mg.active = true and mg.deleted_at is null
    join public.product_modifier_groups pmg on pmg.organization_id = m.organization_id
      and pmg.store_id = m.store_id and pmg.product_id = v_product.id and pmg.modifier_group_id = mg.id;

    if v_valid_modifiers <> v_requested_modifiers then raise exception 'modifier unavailable for product'; end if;

    v_base_price := coalesce(v_product.promotional_price_cents, v_product.price_cents);
    v_unit_total := v_base_price + v_modifier_total;
    v_line_total := v_unit_total::bigint * v_quantity;
    v_subtotal := v_subtotal + v_line_total;

    v_snapshot := jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'product_image_url', v_product.image_url,
      'quantity', v_quantity,
      'note', v_note,
      'unit_base_price_cents', v_base_price,
      'unit_modifiers_price_cents', v_modifier_total,
      'unit_total_price_cents', v_unit_total,
      'line_total_cents', v_line_total,
      'modifiers', v_modifier_snapshot
    );
    v_items_snapshot := v_items_snapshot || jsonb_build_array(v_snapshot);
  end loop;

  if v_subtotal <= 0 then raise exception 'pdv order total must be positive'; end if;

  -- Pagamentos também são validados antes de criar qualquer linha persistente do pedido.
  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    if jsonb_typeof(v_payment) <> 'object' then raise exception 'invalid payment line'; end if;
    v_payment_method := v_payment->>'method';
    if v_payment_method not in ('cash','pix','credit_card','debit_card') then raise exception 'invalid payment method'; end if;
    v_payment_amount := coalesce((v_payment->>'amount_cents')::bigint,0);
    if v_payment_amount <= 0 then raise exception 'invalid payment amount'; end if;
    v_cash_received := nullif(v_payment->>'cash_received_cents','')::bigint;
    if v_payment_method = 'cash' then
      v_cash_received := coalesce(v_cash_received, v_payment_amount);
      if v_cash_received < v_payment_amount then raise exception 'cash received is below payment amount'; end if;
    elsif v_cash_received is not null then
      raise exception 'cash received only applies to cash';
    end if;
    if exists (select 1 from public.store_payment_methods spm where spm.organization_id = v_store.organization_id and spm.store_id = v_store.id)
       and not exists (
         select 1 from public.store_payment_methods spm
         where spm.organization_id = v_store.organization_id and spm.store_id = v_store.id
           and spm.method = v_payment_method and spm.enabled = true
       ) then
      raise exception 'payment method disabled';
    end if;
    v_payment_total := v_payment_total + v_payment_amount;
    if v_first_payment_method is null then v_first_payment_method := v_payment_method; end if;
  end loop;
  if v_payment_total <> v_subtotal then raise exception 'payment total does not match order total'; end if;

  insert into public.order_sequences (organization_id, store_id, last_number, updated_at)
  values (v_store.organization_id, v_store.id, 1, now())
  on conflict (store_id) do update set
    last_number = public.order_sequences.last_number + 1,
    updated_at = now()
  returning last_number into v_display_number;

  insert into public.orders (
    organization_id, store_id, source_cart_id, checkout_session_id, public_access_token_hash,
    display_number, channel, fulfillment_type,
    order_status, payment_status, production_status, fulfillment_status,
    customer_id, customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot,
    subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
    payment_method_snapshot, cash_change_for_cents,
    created_by
  ) values (
    v_store.organization_id, v_store.id, null, null, null,
    v_display_number, 'pdv', 'counter',
    'pending_confirmation', 'pending', 'pending_confirmation', 'pending',
    v_customer_id, v_customer_name, v_customer_phone, v_customer_email,
    v_subtotal, 0, 0, v_subtotal,
    v_first_payment_method, null,
    p_actor_user_id
  ) returning id into v_order_id;

  for v_snapshot in select value from jsonb_array_elements(v_items_snapshot)
  loop
    insert into public.order_items (
      organization_id, store_id, order_id, product_id,
      product_name_snapshot, product_image_url_snapshot, quantity, note,
      unit_base_price_cents, unit_modifiers_price_cents, unit_total_price_cents, line_total_cents
    ) values (
      v_store.organization_id, v_store.id, v_order_id, (v_snapshot->>'product_id')::uuid,
      v_snapshot->>'product_name', nullif(v_snapshot->>'product_image_url',''),
      (v_snapshot->>'quantity')::integer, nullif(v_snapshot->>'note',''),
      (v_snapshot->>'unit_base_price_cents')::integer,
      (v_snapshot->>'unit_modifiers_price_cents')::integer,
      (v_snapshot->>'unit_total_price_cents')::integer,
      (v_snapshot->>'line_total_cents')::bigint
    ) returning id into v_order_item_id;

    insert into public.order_item_modifiers (
      organization_id, store_id, order_item_id, modifier_group_id, modifier_id,
      group_name_snapshot, modifier_name_snapshot, unit_price_cents
    )
    select
      v_store.organization_id, v_store.id, v_order_item_id,
      (m->>'modifier_group_id')::uuid, (m->>'modifier_id')::uuid,
      m->>'group_name', m->>'modifier_name', (m->>'unit_price_cents')::integer
    from jsonb_array_elements(v_snapshot->'modifiers') m;
  end loop;

  insert into public.order_state_history (
    organization_id, store_id, order_id, state_domain, from_state, to_state, source, actor_user_id
  ) values
    (v_store.organization_id, v_store.id, v_order_id, 'order', null, 'pending_confirmation', 'pdv', p_actor_user_id),
    (v_store.organization_id, v_store.id, v_order_id, 'payment', null, 'pending', 'pdv', p_actor_user_id),
    (v_store.organization_id, v_store.id, v_order_id, 'production', null, 'pending_confirmation', 'pdv', p_actor_user_id),
    (v_store.organization_id, v_store.id, v_order_id, 'fulfillment', null, 'pending', 'pdv', p_actor_user_id);

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
  ) values (
    v_store.organization_id, v_store.id, 'order.created', 'order', v_order_id,
    jsonb_build_object('display_number', v_display_number, 'channel', 'pdv', 'fulfillment_type', 'counter', 'total_cents', v_subtotal),
    'pending', 0, now(), p_actor_user_id
  );

  -- O trigger de seed não cria pagamento para canal PDV; cada linha abaixo é explícita e liquidada.
  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_payment_index := v_payment_index + 1;
    v_payment_method := v_payment->>'method';
    v_payment_amount := (v_payment->>'amount_cents')::bigint;
    v_cash_received := nullif(v_payment->>'cash_received_cents','')::bigint;

    select * into v_payment_row from public.payment_create_intent_internal(
      v_order_id,
      v_payment_method,
      v_payment_amount,
      trim(p_idempotency_key) || ':payment:' || v_payment_index::text,
      case when v_payment_method = 'cash' then coalesce(v_cash_received, v_payment_amount) else null end,
      nullif(left(trim(coalesce(v_payment->>'reference','')),200),''),
      p_actor_user_id,
      'pdv'
    );

    select * into v_payment_row from public.payment_confirm_internal(
      v_payment_row.id,
      case when v_payment_method = 'cash' then coalesce(v_cash_received, v_payment_amount) else null end,
      nullif(left(trim(coalesce(v_payment->>'reference','')),200),''),
      p_actor_user_id,
      'pdv'
    );
    v_change_due_total := v_change_due_total + coalesce(v_payment_row.change_due_cents,0);
  end loop;

  -- Confirmação dispara a central de impressão existente; depois a produção entra em preparação.
  perform public.order_transition_internal(v_order_id, 'order', 'confirmed', null, p_actor_user_id, 'pdv');
  perform public.order_start_production_internal(v_order_id, p_actor_user_id, 'pdv');

  insert into public.audit_logs (
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    v_store.organization_id, v_store.id, p_actor_user_id, 'pdv.sale_created', 'order', v_order_id,
    jsonb_build_object('display_number', v_display_number, 'total_cents', v_subtotal, 'payment_lines', jsonb_array_length(p_payments))
  );

  v_response := jsonb_build_object(
    'order_id', v_order_id,
    'display_number', v_display_number,
    'total_cents', v_subtotal,
    'change_due_cents', v_change_due_total,
    'created', true
  );

  update public.idempotency_keys set
    status = 'completed', response_code = 200, response_body = v_response,
    updated_at = now(), expires_at = now() + interval '24 hours'
  where id = v_idem.id;

  return v_response;
end;
$$;

revoke all on function public.pdv_create_order_internal(uuid,jsonb,jsonb,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.pdv_create_order_internal(uuid,jsonb,jsonb,jsonb,text,uuid) to service_role;
