create or replace function public.dining_create_round_internal(
  p_tab_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_actor_user_id uuid default null,
  p_channel text default 'waiter'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tab public.tabs%rowtype;
  v_table public.tables%rowtype;
  v_idem public.idempotency_keys%rowtype;
  v_inserted integer := 0;
  v_priced jsonb;
  v_snapshot jsonb;
  v_modifier jsonb;
  v_order_id uuid;
  v_order_item_id uuid;
  v_display_number bigint;
  v_round integer;
  v_response jsonb;
begin
  if p_channel not in ('waiter','table_qr') then raise exception 'invalid dining channel'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 180 then raise exception 'invalid dining idempotency key'; end if;
  select * into v_tab from public.tabs where id = p_tab_id for update;
  if v_tab.id is null or v_tab.status <> 'open' then raise exception 'tab is not open'; end if;
  select * into v_table from public.tables where id = v_tab.table_id for update;
  if v_table.id is null or v_table.status <> 'occupied' then raise exception 'table is not occupied'; end if;
  if p_channel = 'table_qr' and not v_table.qr_enabled then raise exception 'table QR is disabled'; end if;

  insert into public.idempotency_keys (organization_id, store_id, scope, idempotency_key, status, expires_at)
  values (v_tab.organization_id, v_tab.store_id, 'dining.round', trim(p_idempotency_key), 'processing', now() + interval '24 hours')
  on conflict (organization_id, scope, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_idem from public.idempotency_keys where organization_id = v_tab.organization_id and scope = 'dining.round' and idempotency_key = trim(p_idempotency_key) for update;
  if v_idem.id is null then raise exception 'dining idempotency unavailable'; end if;
  if v_inserted = 0 and v_idem.status = 'completed' and v_idem.response_body is not null then return v_idem.response_body; end if;
  if v_inserted = 0 and v_idem.status = 'processing' and v_idem.expires_at > now() then raise exception 'dining round is already processing'; end if;
  update public.idempotency_keys set status='processing',response_code=null,response_body=null,expires_at=now()+interval '24 hours',updated_at=now() where id=v_idem.id;

  v_priced := private.dining_price_items(v_tab.store_id, p_items);
  select coalesce(max(tab_round_number),0)+1 into v_round from public.orders where tab_id=v_tab.id;
  insert into public.order_sequences (organization_id,store_id,last_number,updated_at) values(v_tab.organization_id,v_tab.store_id,1,now()) on conflict(store_id) do update set last_number=public.order_sequences.last_number+1,updated_at=now() returning last_number into v_display_number;
  insert into public.orders (
    organization_id,store_id,source_cart_id,checkout_session_id,public_access_token_hash,display_number,channel,fulfillment_type,
    order_status,payment_status,production_status,fulfillment_status,customer_id,customer_name_snapshot,customer_phone_snapshot,customer_email_snapshot,
    subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method_snapshot,cash_change_for_cents,tab_id,tab_round_number,created_by
  ) values (
    v_tab.organization_id,v_tab.store_id,null,null,null,v_display_number,p_channel,'table','pending_confirmation','pending','pending_confirmation','pending',
    v_tab.customer_id,coalesce(nullif(trim(v_tab.label),''),'Mesa '||v_table.code),'',null,(v_priced->>'subtotal_cents')::bigint,0,0,(v_priced->>'subtotal_cents')::bigint,null,null,v_tab.id,v_round,p_actor_user_id
  ) returning id into v_order_id;

  for v_snapshot in select value from jsonb_array_elements(v_priced->'items') loop
    insert into public.order_items (organization_id,store_id,order_id,product_id,product_name_snapshot,product_image_url_snapshot,quantity,note,unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents)
    values (v_tab.organization_id,v_tab.store_id,v_order_id,(v_snapshot->>'product_id')::uuid,v_snapshot->>'name',nullif(v_snapshot->>'image_url',''),(v_snapshot->>'quantity')::integer,nullif(v_snapshot->>'note',''),(v_snapshot->>'unit_base_price_cents')::integer,(v_snapshot->>'unit_modifiers_price_cents')::integer,(v_snapshot->>'unit_total_price_cents')::integer,(v_snapshot->>'line_total_cents')::bigint)
    returning id into v_order_item_id;
    for v_modifier in select value from jsonb_array_elements(v_snapshot->'modifiers') loop
      insert into public.order_item_modifiers (organization_id,store_id,order_item_id,modifier_group_id,modifier_id,group_name_snapshot,modifier_name_snapshot,unit_price_cents)
      values (v_tab.organization_id,v_tab.store_id,v_order_item_id,(v_modifier->>'modifier_group_id')::uuid,(v_modifier->>'modifier_id')::uuid,v_modifier->>'group_name',v_modifier->>'modifier_name',(v_modifier->>'unit_price_cents')::integer);
    end loop;
  end loop;
  insert into public.order_state_history (organization_id,store_id,order_id,state_domain,from_state,to_state,source,actor_user_id) values
    (v_tab.organization_id,v_tab.store_id,v_order_id,'order',null,'pending_confirmation','panel',p_actor_user_id),
    (v_tab.organization_id,v_tab.store_id,v_order_id,'payment',null,'pending','panel',p_actor_user_id),
    (v_tab.organization_id,v_tab.store_id,v_order_id,'production',null,'pending_confirmation','panel',p_actor_user_id),
    (v_tab.organization_id,v_tab.store_id,v_order_id,'fulfillment',null,'pending','panel',p_actor_user_id);
  perform public.order_transition_internal(v_order_id,'order','confirmed',null,p_actor_user_id,'panel');
  perform public.order_start_production_internal(v_order_id,p_actor_user_id,'panel');
  update public.tabs set version=version+1,updated_at=now() where id=v_tab.id;
  v_response:=jsonb_build_object('order_id',v_order_id,'display_number',v_display_number,'round_number',v_round,'tab_id',v_tab.id,'total_cents',(v_priced->>'subtotal_cents')::bigint,'created',true);
  update public.idempotency_keys set status='completed',response_code=200,response_body=v_response,updated_at=now() where id=v_idem.id;
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,created_by) values(v_tab.organization_id,v_tab.store_id,'dining.round_created','order',v_order_id,jsonb_build_object('tab_id',v_tab.id,'table_id',v_table.id,'round_number',v_round,'channel',p_channel),p_actor_user_id);
  return v_response;
exception when others then
  if v_idem.id is not null then update public.idempotency_keys set status='failed',response_code=500,response_body=jsonb_build_object('error',sqlerrm),updated_at=now() where id=v_idem.id; end if;
  raise;
end; $$;
revoke all on function public.dining_create_round_internal(uuid,jsonb,text,uuid,text) from public,anon,authenticated; grant execute on function public.dining_create_round_internal(uuid,jsonb,text,uuid,text) to service_role;

create or replace function public.dining_pay_tab_internal(
  p_tab_id uuid,p_amount_cents bigint,p_method text,p_idempotency_key text,p_cash_tendered_cents bigint default null,p_reference text default null,p_tab_member_id uuid default null,p_actor_user_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_tab public.tabs%rowtype; v_idem public.idempotency_keys%rowtype; v_inserted integer:=0; v_order public.orders%rowtype;
  v_order_paid bigint; v_order_due bigint; v_tab_due bigint; v_member_total bigint; v_member_paid bigint; v_member_due bigint; v_member_order_total bigint; v_member_order_paid bigint;
  v_left bigint; v_alloc bigint; v_received bigint; v_change bigint:=0; v_payment public.payments%rowtype; v_payments jsonb:='[]'::jsonb; v_response jsonb;
begin
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'invalid tab payment amount'; end if;
  if p_method not in ('cash','pix','credit_card','debit_card') then raise exception 'invalid payment method'; end if;
  if char_length(trim(coalesce(p_idempotency_key,'')))<8 or char_length(trim(p_idempotency_key))>180 then raise exception 'invalid payment idempotency key'; end if;
  if p_method<>'cash' and p_cash_tendered_cents is not null then raise exception 'cash tendered only applies to cash'; end if;
  if p_method='cash' and p_cash_tendered_cents is not null and p_cash_tendered_cents<p_amount_cents then raise exception 'cash tendered below payment'; end if;
  select * into v_tab from public.tabs where id=p_tab_id for update; if v_tab.id is null or v_tab.status not in ('open','settling') then raise exception 'tab unavailable'; end if;
  if not exists(select 1 from public.store_payment_methods spm where spm.organization_id=v_tab.organization_id and spm.store_id=v_tab.store_id and spm.method=p_method and spm.enabled) then raise exception 'payment method disabled'; end if;
  if p_tab_member_id is not null and not exists(select 1 from public.tab_members m where m.id=p_tab_member_id and m.tab_id=v_tab.id) then raise exception 'tab member unavailable'; end if;
  insert into public.idempotency_keys(organization_id,store_id,scope,idempotency_key,status,expires_at) values(v_tab.organization_id,v_tab.store_id,'dining.payment',trim(p_idempotency_key),'processing',now()+interval '24 hours') on conflict(organization_id,scope,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count; select * into v_idem from public.idempotency_keys where organization_id=v_tab.organization_id and scope='dining.payment' and idempotency_key=trim(p_idempotency_key) for update;
  if v_idem.id is null then raise exception 'payment idempotency unavailable'; end if;
  if v_inserted=0 and v_idem.status='completed' and v_idem.response_body is not null then return v_idem.response_body; end if;
  if v_inserted=0 and v_idem.status='processing' and v_idem.expires_at>now() then raise exception 'tab payment already processing'; end if;
  select coalesce(sum(o.total_cents-coalesce((select sum(p.amount_cents) from public.payments p where p.order_id=o.id and p.status='paid'),0)),0)::bigint into v_tab_due from public.orders o where o.tab_id=v_tab.id and o.order_status not in ('canceled','rejected');
  if p_tab_member_id is not null then
    select coalesce(sum(a.quantity::bigint*oi.unit_total_price_cents),0)::bigint into v_member_total from public.tab_item_allocations a join public.order_items oi on oi.id=a.order_item_id join public.orders o on o.id=oi.order_id where a.tab_id=v_tab.id and a.tab_member_id=p_tab_member_id and o.order_status not in ('canceled','rejected');
    select coalesce(sum(p.amount_cents),0)::bigint into v_member_paid from public.payments p join public.orders o on o.id=p.order_id where o.tab_id=v_tab.id and p.status='paid' and p.metadata->>'tab_member_id'=p_tab_member_id::text;
    v_member_due:=greatest(0,v_member_total-v_member_paid); if v_member_total=0 then raise exception 'tab member has no allocated items'; end if; if p_amount_cents>v_member_due then raise exception 'payment exceeds tab member balance'; end if;
  elsif p_amount_cents>v_tab_due then raise exception 'payment exceeds tab balance'; end if;
  v_left:=p_amount_cents; if p_method='cash' then v_change:=coalesce(p_cash_tendered_cents,p_amount_cents)-p_amount_cents; end if;
  for v_order in select o.* from public.orders o where o.tab_id=v_tab.id and o.order_status not in ('canceled','rejected') order by o.created_at,o.id for update loop
    exit when v_left=0; select coalesce(sum(p.amount_cents),0)::bigint into v_order_paid from public.payments p where p.order_id=v_order.id and p.status='paid'; v_order_due:=greatest(0,v_order.total_cents-v_order_paid); if v_order_due=0 then continue; end if;
    if p_tab_member_id is not null then
      select coalesce(sum(a.quantity::bigint*oi.unit_total_price_cents),0)::bigint into v_member_order_total from public.tab_item_allocations a join public.order_items oi on oi.id=a.order_item_id where oi.order_id=v_order.id and a.tab_id=v_tab.id and a.tab_member_id=p_tab_member_id; if v_member_order_total=0 then continue; end if;
      select coalesce(sum(p.amount_cents),0)::bigint into v_member_order_paid from public.payments p where p.order_id=v_order.id and p.status='paid' and p.metadata->>'tab_member_id'=p_tab_member_id::text;
      v_order_due:=least(v_order_due,greatest(0,v_member_order_total-v_member_order_paid)); if v_order_due=0 then continue; end if;
    end if;
    v_alloc:=least(v_left,v_order_due);
    v_payment:=public.payment_create_intent_internal(v_order.id,p_method,v_alloc,trim(p_idempotency_key)||':'||v_order.id::text,case when p_method='cash' then v_alloc else null end,p_reference,p_actor_user_id,'panel');
    v_received:=case when p_method<>'cash' then null when v_left=v_alloc then v_alloc+v_change else v_alloc end;
    v_payment:=public.payment_confirm_internal(v_payment.id,v_received,p_reference,p_actor_user_id,'panel');
    update public.payments set metadata=metadata||jsonb_strip_nulls(jsonb_build_object('tab_id',v_tab.id,'tab_member_id',p_tab_member_id,'dining_payment_key',trim(p_idempotency_key))),updated_at=now() where id=v_payment.id returning * into v_payment;
    v_payments:=v_payments||jsonb_build_array(jsonb_build_object('payment_id',v_payment.id,'order_id',v_order.id,'amount_cents',v_payment.amount_cents,'method',v_payment.method,'change_due_cents',v_payment.change_due_cents)); v_left:=v_left-v_alloc;
  end loop;
  if v_left<>0 then raise exception 'could not allocate full tab payment'; end if;
  if v_tab.status='open' then update public.tabs set status='settling',settling_at=now(),version=version+1,updated_at=now() where id=v_tab.id; else update public.tabs set version=version+1,updated_at=now() where id=v_tab.id; end if;
  v_response:=jsonb_build_object('tab_id',v_tab.id,'tab_member_id',p_tab_member_id,'amount_cents',p_amount_cents,'change_due_cents',v_change,'remaining_cents',v_tab_due-p_amount_cents,'payments',v_payments);
  update public.idempotency_keys set status='completed',response_code=200,response_body=v_response,updated_at=now() where id=v_idem.id;
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,created_by) values(v_tab.organization_id,v_tab.store_id,'dining.payment_recorded','tab',v_tab.id,jsonb_build_object('amount_cents',p_amount_cents,'method',p_method,'remaining_cents',v_tab_due-p_amount_cents,'tab_member_id',p_tab_member_id),p_actor_user_id);
  return v_response;
exception when others then if v_idem.id is not null then update public.idempotency_keys set status='failed',response_code=500,response_body=jsonb_build_object('error',sqlerrm),updated_at=now() where id=v_idem.id; end if; raise;
end; $$;
revoke all on function public.dining_pay_tab_internal(uuid,bigint,text,text,bigint,text,uuid,uuid) from public,anon,authenticated; grant execute on function public.dining_pay_tab_internal(uuid,bigint,text,text,bigint,text,uuid,uuid) to service_role;

create or replace function private.get_public_table(p_public_code text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('store',jsonb_build_object('slug',s.slug,'name',s.name,'logo_url',s.logo_url),'table',jsonb_build_object('code',t.code,'name',t.name,'capacity',t.capacity),'tab',case when tb.id is null then null else jsonb_build_object('display_number',tb.display_number,'guest_count',tb.guest_count) end)
  from public.tables t join public.stores s on s.organization_id=t.organization_id and s.id=t.store_id and s.status='active'
  left join lateral(select x.* from public.tabs x where x.table_id=t.id and x.status='open' order by x.opened_at desc limit 1) tb on true
  where t.public_code=p_public_code and t.qr_enabled=true and t.status='occupied' limit 1;
$$;
revoke all on function private.get_public_table(text) from public; grant usage on schema private to anon,authenticated; grant execute on function private.get_public_table(text) to anon,authenticated;
create or replace function public.get_public_table(p_public_code text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_public_table(p_public_code); $$;
revoke all on function public.get_public_table(text) from public; grant execute on function public.get_public_table(text) to anon,authenticated,service_role;
