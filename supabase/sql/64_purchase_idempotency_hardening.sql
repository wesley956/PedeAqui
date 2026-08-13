-- PedeAqui — Milestone 20 hardening
-- Fingerprint de payload, item duplicado explícito e correção positiva valorizando estoque como compra.

alter table public.purchase_receipts add column request_fingerprint text;
update public.purchase_receipts
set request_fingerprint=encode(extensions.digest(('legacy:'||id::text)::text,'sha256'),'hex')
where request_fingerprint is null;
alter table public.purchase_receipts alter column request_fingerprint set not null;
alter table public.purchase_receipts add constraint purchase_receipts_fingerprint_check
  check (request_fingerprint ~ '^[0-9a-f]{64}$');
alter table public.purchase_receipt_items add constraint purchase_receipt_items_receipt_order_item_unique
  unique (receipt_id,purchase_order_item_id);

create or replace function public.purchase_create_internal(
  p_store_id uuid,p_supplier_id uuid,p_items jsonb,p_expected_at timestamptz,p_notes text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_store public.stores%rowtype; v_supplier_store public.supplier_stores%rowtype; v_idem public.idempotency_keys%rowtype; v_inserted integer:=0;
  v_item jsonb; v_catalog public.supplier_inventory_items%rowtype; v_inventory public.inventory_items%rowtype;
  v_quantity numeric(18,6); v_cost bigint; v_line bigint; v_subtotal bigint:=0; v_display bigint; v_order public.purchase_orders%rowtype; v_response jsonb;
  v_count integer; v_distinct integer; v_fingerprint text;
begin
  if p_actor_user_id is null then raise exception 'purchase actor is required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid purchase idempotency key'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array' or jsonb_array_length(p_items)=0 then raise exception 'purchase order items required'; end if;
  if jsonb_array_length(p_items)>200 then raise exception 'too many purchase items'; end if;
  select count(*)::integer,count(distinct value->>'inventory_item_id')::integer into v_count,v_distinct from jsonb_array_elements(p_items);
  if v_count<>v_distinct then raise exception 'duplicate purchase inventory item'; end if;

  select * into v_store from public.stores where id=p_store_id and status='active';
  if v_store.id is null then raise exception 'store unavailable'; end if;
  select * into v_supplier_store from public.supplier_stores where organization_id=v_store.organization_id and store_id=v_store.id and supplier_id=p_supplier_id and active=true;
  if v_supplier_store.supplier_id is null then raise exception 'supplier is not active in store'; end if;

  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'store_id',p_store_id,'supplier_id',p_supplier_id,'items',p_items,'expected_at',p_expected_at,
    'notes',nullif(trim(coalesce(p_notes,'')),'')
  )::text,'sha256'),'hex');

  insert into public.idempotency_keys(organization_id,store_id,scope,idempotency_key,request_fingerprint,status,expires_at)
  values(v_store.organization_id,v_store.id,'purchase.create',trim(p_idempotency_key),v_fingerprint,'processing',now()+interval '24 hours')
  on conflict (organization_id,scope,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_idem from public.idempotency_keys
  where organization_id=v_store.organization_id and scope='purchase.create' and idempotency_key=trim(p_idempotency_key) for update;
  if v_idem.id is null then raise exception 'purchase idempotency unavailable'; end if;
  if v_inserted=0 and v_idem.request_fingerprint is distinct from v_fingerprint then raise exception 'purchase idempotency key reused with different payload'; end if;
  if v_inserted=0 and v_idem.status='completed' and v_idem.response_body is not null then return v_idem.response_body; end if;
  if v_inserted=0 and v_idem.status='processing' and v_idem.expires_at>now() then raise exception 'purchase creation is already processing'; end if;
  update public.idempotency_keys set request_fingerprint=v_fingerprint,status='processing',response_body=null,response_code=null,
    expires_at=now()+interval '24 hours',updated_at=now() where id=v_idem.id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'invalid purchase item'; end if;
    v_quantity:=round((v_item->>'quantity')::numeric,6);
    if v_quantity<=0 then raise exception 'invalid purchase quantity'; end if;
    select * into v_catalog from public.supplier_inventory_items
    where organization_id=v_store.organization_id and store_id=v_store.id and supplier_id=p_supplier_id
      and inventory_item_id=(v_item->>'inventory_item_id')::uuid and active=true;
    if v_catalog.inventory_item_id is null then raise exception 'supplier item unavailable'; end if;
    select * into v_inventory from public.inventory_items
    where id=v_catalog.inventory_item_id and organization_id=v_store.organization_id and active=true and deleted_at is null;
    if v_inventory.id is null then raise exception 'inventory item unavailable'; end if;
    v_cost:=coalesce(nullif(v_item->>'unit_cost_cents','')::bigint,v_catalog.last_unit_cost_cents);
    if v_cost<0 then raise exception 'invalid purchase unit cost'; end if;
    v_line:=round(v_quantity*v_cost)::bigint;
    if v_line<0 then raise exception 'invalid purchase line total'; end if;
    v_subtotal:=v_subtotal+v_line;
  end loop;
  if v_subtotal<v_supplier_store.minimum_order_cents then raise exception 'purchase below supplier minimum order'; end if;

  insert into public.purchase_sequences(organization_id,store_id,next_number) values(v_store.organization_id,v_store.id,1)
  on conflict (organization_id,store_id) do nothing;
  select next_number into v_display from public.purchase_sequences where organization_id=v_store.organization_id and store_id=v_store.id for update;
  update public.purchase_sequences set next_number=next_number+1 where organization_id=v_store.organization_id and store_id=v_store.id;

  insert into public.purchase_orders(organization_id,store_id,supplier_id,display_number,expected_at,notes,subtotal_cents,created_by,updated_by)
  values(v_store.organization_id,v_store.id,p_supplier_id,v_display,p_expected_at,nullif(trim(coalesce(p_notes,'')),''),v_subtotal,p_actor_user_id,p_actor_user_id)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity:=round((v_item->>'quantity')::numeric,6);
    select * into v_catalog from public.supplier_inventory_items
    where organization_id=v_store.organization_id and store_id=v_store.id and supplier_id=p_supplier_id
      and inventory_item_id=(v_item->>'inventory_item_id')::uuid and active=true;
    select * into v_inventory from public.inventory_items where id=v_catalog.inventory_item_id;
    v_cost:=coalesce(nullif(v_item->>'unit_cost_cents','')::bigint,v_catalog.last_unit_cost_cents);
    v_line:=round(v_quantity*v_cost)::bigint;
    insert into public.purchase_order_items(
      organization_id,store_id,purchase_order_id,inventory_item_id,inventory_name_snapshot,base_unit_snapshot,
      purchase_unit_label_snapshot,base_units_per_purchase_unit_snapshot,ordered_purchase_quantity,unit_cost_cents,line_total_cents
    ) values(
      v_store.organization_id,v_store.id,v_order.id,v_inventory.id,v_inventory.name,v_inventory.base_unit,
      v_catalog.purchase_unit_label,v_catalog.base_units_per_purchase_unit,v_quantity,v_cost,v_line
    );
  end loop;
  insert into public.purchase_order_history(organization_id,store_id,purchase_order_id,from_status,to_status,actor_user_id)
  values(v_store.organization_id,v_store.id,v_order.id,null,'draft',p_actor_user_id);
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_store.organization_id,v_store.id,p_actor_user_id,'purchase.created','purchase_order',v_order.id,
    jsonb_build_object('display_number',v_display,'supplier_id',p_supplier_id,'subtotal_cents',v_subtotal));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_store.organization_id,v_store.id,'purchase.created','purchase_order',v_order.id,
    jsonb_build_object('display_number',v_display,'supplier_id',p_supplier_id,'subtotal_cents',v_subtotal),'pending',0,now(),p_actor_user_id);
  v_response:=jsonb_build_object('purchase_order_id',v_order.id,'display_number',v_display,'status','draft','subtotal_cents',v_subtotal);
  update public.idempotency_keys set status='completed',response_code=200,response_body=v_response,expires_at=now()+interval '24 hours',updated_at=now()
  where id=v_idem.id;
  return v_response;
end; $$;
revoke all on function public.purchase_create_internal(uuid,uuid,jsonb,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.purchase_create_internal(uuid,uuid,jsonb,timestamptz,text,text,uuid) to service_role;

create or replace function public.purchase_receive_internal(
  p_purchase_order_id uuid,p_items jsonb,p_reference text,p_notes text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_order public.purchase_orders%rowtype; v_existing public.purchase_receipts%rowtype; v_receipt public.purchase_receipts%rowtype;
  v_item jsonb; v_order_item public.purchase_order_items%rowtype; v_quantity numeric(18,6); v_base numeric(18,6); v_cost bigint; v_micros bigint; v_line bigint;
  v_movement public.inventory_movements%rowtype; v_new_received numeric(18,6); v_from text; v_to text; v_all_received boolean;
  v_count integer; v_distinct integer; v_fingerprint text;
begin
  if p_actor_user_id is null then raise exception 'purchase actor is required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid receipt idempotency key'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array' or jsonb_array_length(p_items)=0 then raise exception 'receipt items required'; end if;
  if jsonb_array_length(p_items)>200 then raise exception 'too many receipt items'; end if;
  select count(*)::integer,count(distinct value->>'purchase_order_item_id')::integer into v_count,v_distinct from jsonb_array_elements(p_items);
  if v_count<>v_distinct then raise exception 'duplicate receipt purchase item'; end if;

  select * into v_order from public.purchase_orders where id=p_purchase_order_id for update;
  if v_order.id is null then raise exception 'purchase order not found'; end if;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'purchase_order_id',p_purchase_order_id,'items',p_items,'reference',nullif(trim(coalesce(p_reference,'')),''),
    'notes',nullif(trim(coalesce(p_notes,'')),'')
  )::text,'sha256'),'hex');
  select * into v_existing from public.purchase_receipts
  where organization_id=v_order.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.purchase_order_id<>v_order.id or v_existing.receipt_kind<>'receipt'
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'receipt idempotency key reused with different payload';
    end if;
    return jsonb_build_object('receipt_id',v_existing.id,'purchase_order_id',v_order.id,'status',v_order.status,'retry',true);
  end if;
  if v_order.status not in ('sent','partially_received') then raise exception 'purchase order is not receivable'; end if;

  insert into public.purchase_receipts(organization_id,store_id,purchase_order_id,receipt_kind,idempotency_key,request_fingerprint,reference,notes,created_by)
  values(v_order.organization_id,v_order.store_id,v_order.id,'receipt',trim(p_idempotency_key),v_fingerprint,
    nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),p_actor_user_id)
  returning * into v_receipt;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'invalid receipt item'; end if;
    select * into v_order_item from public.purchase_order_items
    where id=(v_item->>'purchase_order_item_id')::uuid and purchase_order_id=v_order.id for update;
    if v_order_item.id is null then raise exception 'purchase order item not found'; end if;
    v_quantity:=round((v_item->>'quantity')::numeric,6);
    if v_quantity<=0 then raise exception 'invalid received quantity'; end if;
    v_new_received:=round(v_order_item.received_purchase_quantity+v_quantity,6);
    if v_new_received>v_order_item.ordered_purchase_quantity then raise exception 'received quantity exceeds ordered quantity'; end if;
    v_cost:=coalesce(nullif(v_item->>'unit_cost_cents','')::bigint,v_order_item.unit_cost_cents);
    if v_cost<0 then raise exception 'invalid received unit cost'; end if;
    v_base:=round(v_quantity*v_order_item.base_units_per_purchase_unit_snapshot,6);
    if v_base<=0 then raise exception 'invalid converted base quantity'; end if;
    v_micros:=round((v_cost::numeric*1000000::numeric)/v_order_item.base_units_per_purchase_unit_snapshot)::bigint;
    v_line:=round(v_quantity*v_cost)::bigint;
    v_movement:=private.inventory_insert_movement(
      v_order.organization_id,v_order.store_id,v_order_item.inventory_item_id,'purchase',v_base,v_micros,
      'purchase-receipt:'||v_receipt.id::text||':item:'||v_order_item.id::text,'purchase_receipt',v_receipt.id,null,null,
      'Entrada por recebimento de compra',p_actor_user_id,
      jsonb_build_object('purchase_order_id',v_order.id,'purchase_order_item_id',v_order_item.id,'purchase_quantity',v_quantity,
        'purchase_unit',v_order_item.purchase_unit_label_snapshot,'unit_cost_cents',v_cost)
    );
    insert into public.purchase_receipt_items(
      organization_id,store_id,receipt_id,purchase_order_item_id,purchase_quantity_delta,base_quantity_delta,unit_cost_cents,
      unit_cost_micros_per_base_unit,line_total_cents,inventory_movement_id
    ) values(v_order.organization_id,v_order.store_id,v_receipt.id,v_order_item.id,v_quantity,v_base,v_cost,v_micros,v_line,v_movement.id);
    update public.purchase_order_items set received_purchase_quantity=v_new_received where id=v_order_item.id;
    update public.supplier_inventory_items set last_unit_cost_cents=v_cost,updated_by=p_actor_user_id,updated_at=now()
    where organization_id=v_order.organization_id and store_id=v_order.store_id and supplier_id=v_order.supplier_id
      and inventory_item_id=v_order_item.inventory_item_id;
  end loop;

  select bool_and(received_purchase_quantity>=ordered_purchase_quantity) into v_all_received
  from public.purchase_order_items where purchase_order_id=v_order.id;
  v_from:=v_order.status; v_to:=case when coalesce(v_all_received,false) then 'received' else 'partially_received' end;
  update public.purchase_orders set status=v_to,received_at=case when v_to='received' then coalesce(received_at,now()) else null end,
    updated_by=p_actor_user_id,updated_at=now() where id=v_order.id returning * into v_order;
  if v_from is distinct from v_to then
    insert into public.purchase_order_history(organization_id,store_id,purchase_order_id,from_status,to_status,actor_user_id)
    values(v_order.organization_id,v_order.store_id,v_order.id,v_from,v_to,p_actor_user_id);
  end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_order.organization_id,v_order.store_id,p_actor_user_id,'purchase.received','purchase_receipt',v_receipt.id,
    jsonb_build_object('purchase_order_id',v_order.id,'status',v_to,'reference',v_receipt.reference));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_order.organization_id,v_order.store_id,case when v_to='received' then 'purchase.completed' else 'purchase.partially_received' end,
    'purchase_order',v_order.id,jsonb_build_object('receipt_id',v_receipt.id,'display_number',v_order.display_number,
    'subtotal_cents',v_order.subtotal_cents),'pending',0,now(),p_actor_user_id);
  return jsonb_build_object('receipt_id',v_receipt.id,'purchase_order_id',v_order.id,'status',v_to,'retry',false);
end; $$;
revoke all on function public.purchase_receive_internal(uuid,jsonb,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.purchase_receive_internal(uuid,jsonb,text,text,text,uuid) to service_role;

create or replace function public.purchase_receipt_correct_internal(
  p_receipt_id uuid,p_items jsonb,p_reason text,p_idempotency_key text,p_actor_user_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_original public.purchase_receipts%rowtype; v_order public.purchase_orders%rowtype; v_existing public.purchase_receipts%rowtype; v_receipt public.purchase_receipts%rowtype;
  v_item jsonb; v_order_item public.purchase_order_items%rowtype; v_delta numeric(18,6); v_base numeric(18,6); v_cost bigint; v_micros bigint; v_line bigint;
  v_movement public.inventory_movements%rowtype; v_new_received numeric(18,6); v_all_received boolean; v_from text; v_to text; v_move_type text;
  v_count integer; v_distinct integer; v_fingerprint text;
begin
  if p_actor_user_id is null then raise exception 'purchase actor is required'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'receipt correction reason required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid correction idempotency key'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array' or jsonb_array_length(p_items)=0 then raise exception 'correction items required'; end if;
  if jsonb_array_length(p_items)>200 then raise exception 'too many correction items'; end if;
  select count(*)::integer,count(distinct value->>'purchase_order_item_id')::integer into v_count,v_distinct from jsonb_array_elements(p_items);
  if v_count<>v_distinct then raise exception 'duplicate correction purchase item'; end if;

  select * into v_original from public.purchase_receipts where id=p_receipt_id;
  if v_original.id is null or v_original.receipt_kind<>'receipt' then raise exception 'original receipt not found'; end if;
  select * into v_order from public.purchase_orders where id=v_original.purchase_order_id for update;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'original_receipt_id',p_receipt_id,'items',p_items,'reason',trim(p_reason)
  )::text,'sha256'),'hex');
  select * into v_existing from public.purchase_receipts
  where organization_id=v_order.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.corrects_receipt_id<>v_original.id or v_existing.receipt_kind<>'correction'
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'correction idempotency key reused with different payload';
    end if;
    return jsonb_build_object('receipt_id',v_existing.id,'purchase_order_id',v_order.id,'status',v_order.status,'retry',true);
  end if;
  if v_order.status not in ('partially_received','received') then raise exception 'purchase order has no receivable history to correct'; end if;

  insert into public.purchase_receipts(organization_id,store_id,purchase_order_id,receipt_kind,idempotency_key,request_fingerprint,notes,corrects_receipt_id,created_by)
  values(v_order.organization_id,v_order.store_id,v_order.id,'correction',trim(p_idempotency_key),v_fingerprint,trim(p_reason),v_original.id,p_actor_user_id)
  returning * into v_receipt;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_order_item from public.purchase_order_items
    where id=(v_item->>'purchase_order_item_id')::uuid and purchase_order_id=v_order.id for update;
    if v_order_item.id is null then raise exception 'purchase order item not found'; end if;
    v_delta:=round((v_item->>'quantity_delta')::numeric,6);
    if v_delta=0 then raise exception 'correction quantity delta must be non-zero'; end if;
    v_new_received:=round(v_order_item.received_purchase_quantity+v_delta,6);
    if v_new_received<0 or v_new_received>v_order_item.ordered_purchase_quantity then raise exception 'correction would make received quantity invalid'; end if;
    v_cost:=coalesce(nullif(v_item->>'unit_cost_cents','')::bigint,v_order_item.unit_cost_cents);
    if v_cost<0 then raise exception 'invalid correction unit cost'; end if;
    v_base:=round(v_delta*v_order_item.base_units_per_purchase_unit_snapshot,6);
    v_micros:=round((v_cost::numeric*1000000::numeric)/v_order_item.base_units_per_purchase_unit_snapshot)::bigint;
    v_line:=round(abs(v_delta)*v_cost)::bigint;
    v_move_type:=case when v_delta>0 then 'purchase' else 'adjustment' end;
    v_movement:=private.inventory_insert_movement(
      v_order.organization_id,v_order.store_id,v_order_item.inventory_item_id,v_move_type,v_base,v_micros,
      'purchase-correction:'||v_receipt.id::text||':item:'||v_order_item.id::text,'purchase_receipt_correction',v_receipt.id,null,null,
      trim(p_reason),p_actor_user_id,jsonb_build_object('purchase_order_id',v_order.id,'original_receipt_id',v_original.id,
        'purchase_order_item_id',v_order_item.id,'purchase_quantity_delta',v_delta,'unit_cost_cents',v_cost)
    );
    insert into public.purchase_receipt_items(
      organization_id,store_id,receipt_id,purchase_order_item_id,purchase_quantity_delta,base_quantity_delta,unit_cost_cents,
      unit_cost_micros_per_base_unit,line_total_cents,reason,inventory_movement_id
    ) values(v_order.organization_id,v_order.store_id,v_receipt.id,v_order_item.id,v_delta,v_base,v_cost,v_micros,v_line,trim(p_reason),v_movement.id);
    update public.purchase_order_items set received_purchase_quantity=v_new_received where id=v_order_item.id;
    if v_delta>0 then
      update public.supplier_inventory_items set last_unit_cost_cents=v_cost,updated_by=p_actor_user_id,updated_at=now()
      where organization_id=v_order.organization_id and store_id=v_order.store_id and supplier_id=v_order.supplier_id
        and inventory_item_id=v_order_item.inventory_item_id;
    end if;
  end loop;

  select bool_and(received_purchase_quantity>=ordered_purchase_quantity) into v_all_received
  from public.purchase_order_items where purchase_order_id=v_order.id;
  v_from:=v_order.status; v_to:=case when coalesce(v_all_received,false) then 'received' else 'partially_received' end;
  update public.purchase_orders set status=v_to,received_at=case when v_to='received' then coalesce(received_at,now()) else null end,
    updated_by=p_actor_user_id,updated_at=now() where id=v_order.id returning * into v_order;
  if v_from is distinct from v_to then
    insert into public.purchase_order_history(organization_id,store_id,purchase_order_id,from_status,to_status,reason,actor_user_id)
    values(v_order.organization_id,v_order.store_id,v_order.id,v_from,v_to,trim(p_reason),p_actor_user_id);
  end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_order.organization_id,v_order.store_id,p_actor_user_id,'purchase.receipt_corrected','purchase_receipt',v_receipt.id,
    jsonb_build_object('purchase_order_id',v_order.id,'original_receipt_id',v_original.id,'reason',trim(p_reason)));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_order.organization_id,v_order.store_id,'purchase.receipt_corrected','purchase_order',v_order.id,
    jsonb_build_object('correction_receipt_id',v_receipt.id,'original_receipt_id',v_original.id,'status',v_to),'pending',0,now(),p_actor_user_id);
  return jsonb_build_object('receipt_id',v_receipt.id,'purchase_order_id',v_order.id,'status',v_to,'retry',false);
end; $$;
revoke all on function public.purchase_receipt_correct_internal(uuid,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.purchase_receipt_correct_internal(uuid,jsonb,text,text,uuid) to service_role;
