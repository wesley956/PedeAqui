begin;

alter table public.store_operational_settings
  add column if not exists orders_custom_workflow jsonb not null default '{"delivery":["new","preparing","ready","delivering","finished"],"pickup":["new","preparing","ready","awaiting_pickup","finished"]}'::jsonb;

alter table public.store_operational_settings
  drop constraint if exists store_operational_settings_orders_workflow_mode_check;

alter table public.store_operational_settings
  add constraint store_operational_settings_orders_workflow_mode_check
  check (orders_workflow_mode in ('standard', 'simplified', 'custom'));

alter table public.store_operational_settings
  drop constraint if exists store_operational_settings_orders_custom_workflow_check;

alter table public.store_operational_settings
  add constraint store_operational_settings_orders_custom_workflow_check
  check (
    jsonb_typeof(orders_custom_workflow) = 'object'
    and jsonb_typeof(orders_custom_workflow -> 'delivery') = 'array'
    and jsonb_typeof(orders_custom_workflow -> 'pickup') = 'array'
  );

comment on column public.store_operational_settings.orders_custom_workflow is
  'Checkpoints visuais do gestor de pedidos. Não substitui nem enfraquece as máquinas de estado de pedido, produção, pagamento ou fulfillment.';

commit;
