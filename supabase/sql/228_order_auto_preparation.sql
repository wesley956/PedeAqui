-- Auto-preparation is opt-in per store and only applies to orders created after activation.
-- Keep the existing private trigger/privileges and canonical transitions (print, history, events).
create or replace function private.apply_store_order_automations()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_settings public.store_operational_settings%rowtype;
  v_order public.orders%rowtype;
  v_auto_prepare boolean;
  v_from timestamptz;
  v_wait_payment boolean;
begin
  select * into v_settings from public.store_operational_settings
    where store_id=new.store_id and organization_id=new.organization_id;
  if v_settings.store_id is null then return new; end if;
  -- A deferred trigger may hold an old NEW snapshot. Lock and reread the current state.
  select * into v_order from public.orders where id=new.id for update;
  if v_order.id is null then return new; end if;
  v_auto_prepare := v_settings.orders_auto_accept
    and coalesce(v_settings.orders_custom_workflow->>'receptionMode','')='auto_prepare';
  if v_auto_prepare then
    begin
      v_from := (v_settings.orders_custom_workflow->>'autoPrepareFrom')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      v_from := null;
    end;
    -- Scheduled and imported orders keep their dedicated operational workflows.
    if v_from is not null and v_order.created_at >= v_from
      and v_order.scheduled_for is null
      and v_order.channel in ('digital_menu','whatsapp','manual','counter','waiter','table_qr')
      and v_order.fulfillment_type in ('delivery','pickup')
      and not exists(select 1 from public.external_orders where order_id=v_order.id)
      and private.store_module_enabled(v_order.organization_id,v_order.store_id,'orders') then
      v_wait_payment := v_order.total_cents>0 and v_order.channel='digital_menu'
        and v_order.payment_method_snapshot='pix' and v_order.payment_status<>'paid'
        and (exists(select 1 from public.order_payment_provider_configs c
          where c.store_id=v_order.store_id and c.organization_id=v_order.organization_id and c.enabled and c.revoked_at is null)
          or exists(select 1 from public.order_payment_provider_charges where order_id=v_order.id));
      if not v_wait_payment then
        if v_order.order_status='pending_confirmation' then
          perform public.order_transition_internal(v_order.id,'order','confirmed','Aceite automático com início do preparo',null,'automation');
          select * into v_order from public.orders where id=new.id;
        end if;
        if v_order.order_status='confirmed' and v_order.production_status in ('pending_confirmation','queued') then
          perform public.order_start_production_internal(v_order.id,null,'automation');
        end if;
      end if;
    end if;
  elsif v_settings.orders_auto_accept and v_order.order_status='pending_confirmation'
    and private.store_module_enabled(v_order.organization_id,v_order.store_id,'orders') then
    perform public.order_transition_internal(v_order.id,'order','confirmed','Aceite automático pela configuração da unidade',null,'automation');
  end if;
  -- Preserve automatic routing to Entregas and use the current row after transitions.
  select * into v_order from public.orders where id=new.id;
  if v_settings.deliveries_auto_create_when_ready and v_order.fulfillment_type='delivery'
    and v_order.order_status='confirmed' and v_order.production_status in ('ready','not_required')
    and v_order.fulfillment_status='pending' and private.store_module_enabled(v_order.organization_id,v_order.store_id,'deliveries') then
    perform public.order_transition_internal(v_order.id,'fulfillment','awaiting_assignment','Projeção automática para Entregas',null,'automation');
    perform private.delivery_ensure(v_order.id,null);
  end if;
  return new;
end $$;
revoke all on function private.apply_store_order_automations() from public,anon,authenticated;
drop trigger if exists orders_apply_store_automations on public.orders;
create constraint trigger orders_apply_store_automations
  after insert or update of order_status,production_status,fulfillment_status,payment_status on public.orders
  deferrable initially deferred for each row execute function private.apply_store_order_automations();
