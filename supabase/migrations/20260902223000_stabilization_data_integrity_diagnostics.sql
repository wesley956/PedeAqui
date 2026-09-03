-- ESTABILIZAÇÃO #824
-- Diagnóstico read-only de invariantes críticos. Retorna somente chave/severidade/contagem,
-- sem PII e sem qualquer rotina de reparo automático.

create or replace function public.run_data_integrity_diagnostics_internal()
returns table(check_key text, severity text, issue_count bigint)
language sql
security definer
set search_path = ''
as $function$
  select 'order_items_orphan_order'::text, 'critical'::text, count(*)::bigint
  from public.order_items oi
  left join public.orders o on o.id = oi.order_id
  where o.id is null

  union all
  select 'order_items_scope_mismatch', 'critical', count(*)::bigint
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.organization_id is distinct from o.organization_id
     or oi.store_id is distinct from o.store_id

  union all
  select 'deliveries_orphan_order', 'critical', count(*)::bigint
  from public.deliveries d
  left join public.orders o on o.id = d.order_id
  where o.id is null

  union all
  select 'deliveries_scope_mismatch', 'critical', count(*)::bigint
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.organization_id is distinct from o.organization_id
     or d.store_id is distinct from o.store_id

  union all
  select 'deliveries_driver_scope_mismatch', 'critical', count(*)::bigint
  from public.deliveries d
  join public.drivers dr on dr.id = d.driver_id
  where d.driver_id is not null
    and (d.organization_id is distinct from dr.organization_id
      or d.store_id is distinct from dr.store_id)

  union all
  select 'products_category_scope_mismatch', 'critical', count(*)::bigint
  from public.products p
  join public.categories c on c.id = p.category_id
  where p.category_id is not null
    and (p.organization_id is distinct from c.organization_id
      or p.store_id is distinct from c.store_id)

  union all
  select 'modifiers_group_scope_mismatch', 'critical', count(*)::bigint
  from public.modifiers m
  join public.modifier_groups g on g.id = m.modifier_group_id
  where m.organization_id is distinct from g.organization_id
     or m.store_id is distinct from g.store_id

  union all
  select 'product_modifier_groups_scope_mismatch', 'critical', count(*)::bigint
  from public.product_modifier_groups pmg
  join public.products p on p.id = pmg.product_id
  join public.modifier_groups g on g.id = pmg.modifier_group_id
  where pmg.organization_id is distinct from p.organization_id
     or pmg.store_id is distinct from p.store_id
     or pmg.organization_id is distinct from g.organization_id
     or pmg.store_id is distinct from g.store_id

  union all
  select 'order_item_modifiers_scope_mismatch', 'critical', count(*)::bigint
  from public.order_item_modifiers oim
  join public.order_items oi on oi.id = oim.order_item_id
  where oim.organization_id is distinct from oi.organization_id
     or oim.store_id is distinct from oi.store_id

  union all
  select 'customer_addresses_scope_mismatch', 'critical', count(*)::bigint
  from public.customer_addresses a
  join public.customers c on c.id = a.customer_id
  where a.organization_id is distinct from c.organization_id

  union all
  select 'print_jobs_order_scope_mismatch', 'critical', count(*)::bigint
  from public.print_jobs j
  join public.orders o on o.id = j.order_id
  where j.order_id is not null
    and (j.organization_id is distinct from o.organization_id
      or j.store_id is distinct from o.store_id)

  union all
  select 'print_jobs_printer_scope_mismatch', 'critical', count(*)::bigint
  from public.print_jobs j
  join public.printers p on p.id = j.printer_id
  where j.printer_id is not null
    and (j.organization_id is distinct from p.organization_id
      or j.store_id is distinct from p.store_id)

  union all
  select 'print_jobs_agent_scope_mismatch', 'critical', count(*)::bigint
  from public.print_jobs j
  join public.print_agents a on a.id = j.claimed_by_agent_id
  where j.claimed_by_agent_id is not null
    and (j.organization_id is distinct from a.organization_id
      or j.store_id is distinct from a.store_id)

  union all
  select 'station_printers_scope_mismatch', 'critical', count(*)::bigint
  from public.station_printers sp
  join public.production_stations s on s.id = sp.station_id
  join public.printers p on p.id = sp.printer_id
  where sp.organization_id is distinct from s.organization_id
     or sp.store_id is distinct from s.store_id
     or sp.organization_id is distinct from p.organization_id
     or sp.store_id is distinct from p.store_id

  union all
  select 'product_production_stations_scope_mismatch', 'critical', count(*)::bigint
  from public.product_production_stations pps
  join public.products p on p.id = pps.product_id
  join public.production_stations s on s.id = pps.station_id
  where pps.organization_id is distinct from p.organization_id
     or pps.store_id is distinct from p.store_id
     or pps.organization_id is distinct from s.organization_id
     or pps.store_id is distinct from s.store_id

  union all
  select 'final_fulfillment_open_order', 'warning', count(*)::bigint
  from public.orders o
  where o.fulfillment_status::text in ('delivered', 'picked_up_by_customer', 'served')
    and o.order_status::text not in ('completed', 'canceled')

  union all
  select 'delivered_delivery_open_order', 'warning', count(*)::bigint
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.delivered_at is not null
    and o.order_status::text not in ('completed', 'canceled');
$function$;

comment on function public.run_data_integrity_diagnostics_internal() is
  'Read-only integrity counters for CI/staging/controlled production diagnostics. Returns no row-level data or PII.';

revoke all on function public.run_data_integrity_diagnostics_internal() from public, anon, authenticated;
grant execute on function public.run_data_integrity_diagnostics_internal() to service_role;
