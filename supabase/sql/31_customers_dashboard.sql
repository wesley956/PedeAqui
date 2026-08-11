-- PedeAqui — bloco [111]–[115]
-- Clientes + Dashboard: métricas consistentes após conclusão e agregados operacionais por unidade/timezone.

create index if not exists orders_store_completed_idx
  on public.orders (organization_id, store_id, completed_at desc)
  where order_status = 'completed';

-- Os campos agregados de customers são cache derivado de pedidos concluídos.
-- O trigger roda na mesma transação da State Machine e só aplica a conclusão uma vez.
create or replace function private.apply_completed_order_customer_metrics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.order_status = 'completed'
     and old.order_status is distinct from 'completed'
     and new.customer_id is not null then
    update public.customers
    set orders_count = orders_count + 1,
        total_spent_cents = total_spent_cents + new.total_cents,
        average_ticket_cents = round((total_spent_cents + new.total_cents)::numeric / (orders_count + 1))::integer,
        last_order_at = greatest(coalesce(last_order_at, new.completed_at), new.completed_at),
        updated_at = now()
    where id = new.customer_id
      and organization_id = new.organization_id
      and deleted_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_completed_order_customer_metrics() from public, anon, authenticated;

drop trigger if exists orders_customer_metrics_after_completion on public.orders;
create trigger orders_customer_metrics_after_completion
after update of order_status on public.orders
for each row
when (new.order_status = 'completed' and old.order_status is distinct from 'completed')
execute function private.apply_completed_order_customer_metrics();

-- Backfill determinístico para alinhar clientes existentes ao histórico de pedidos concluídos.
with metrics as (
  select c.id,
         count(o.id)::integer as orders_count,
         coalesce(sum(o.total_cents), 0)::bigint as total_spent_cents,
         case when count(o.id) = 0 then 0
              else round(coalesce(sum(o.total_cents),0)::numeric / count(o.id))::integer end as average_ticket_cents,
         max(o.completed_at) as last_order_at
  from public.customers c
  left join public.orders o
    on o.organization_id = c.organization_id
   and o.customer_id = c.id
   and o.order_status = 'completed'
  group by c.id
)
update public.customers c
set orders_count = m.orders_count,
    total_spent_cents = m.total_spent_cents,
    average_ticket_cents = m.average_ticket_cents,
    last_order_at = m.last_order_at,
    updated_at = now()
from metrics m
where m.id = c.id;

-- Snapshot agregado do Dashboard. Apenas o backend service_role pode executar.
-- O chamador já foi autorizado para dashboard.view na unidade ativa.
create or replace function public.dashboard_snapshot_internal(
  p_store_id uuid,
  p_now timestamptz
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_timezone text;
  v_now timestamptz := coalesce(p_now, now());
  v_today date;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
  v_yesterday_start timestamptz;
  v_sales_count integer := 0;
  v_sales_cents bigint := 0;
  v_customer_count integer := 0;
  v_open_orders integer := 0;
  v_previous_sales_count integer := 0;
  v_previous_sales_cents bigint := 0;
  v_hourly jsonb := '[]'::jsonb;
  v_top_products jsonb := '[]'::jsonb;
begin
  select organization_id, timezone
    into v_organization_id, v_timezone
  from public.stores
  where id = p_store_id
    and status = 'active';

  if v_organization_id is null then
    raise exception 'store unavailable';
  end if;

  v_today := (v_now at time zone v_timezone)::date;
  v_today_start := v_today::timestamp at time zone v_timezone;
  v_tomorrow_start := (v_today + 1)::timestamp at time zone v_timezone;
  v_yesterday_start := (v_today - 1)::timestamp at time zone v_timezone;

  select count(*)::integer,
         coalesce(sum(total_cents),0)::bigint,
         count(distinct customer_id)::integer
    into v_sales_count, v_sales_cents, v_customer_count
  from public.orders
  where organization_id = v_organization_id
    and store_id = p_store_id
    and order_status = 'completed'
    and completed_at >= v_today_start
    and completed_at < v_tomorrow_start;

  select count(*)::integer
    into v_open_orders
  from public.orders
  where organization_id = v_organization_id
    and store_id = p_store_id
    and order_status in ('pending_confirmation','confirmed');

  select count(*)::integer,
         coalesce(sum(total_cents),0)::bigint
    into v_previous_sales_count, v_previous_sales_cents
  from public.orders
  where organization_id = v_organization_id
    and store_id = p_store_id
    and order_status = 'completed'
    and completed_at >= v_yesterday_start
    and completed_at < v_today_start;

  select coalesce(jsonb_agg(jsonb_build_object(
      'hour', x.hour,
      'orders', x.orders,
      'sales_cents', x.sales_cents
    ) order by x.hour), '[]'::jsonb)
    into v_hourly
  from (
    select h.hour,
           count(o.id)::integer as orders,
           coalesce(sum(o.total_cents),0)::bigint as sales_cents
    from generate_series(0,23) as h(hour)
    left join public.orders o
      on o.organization_id = v_organization_id
     and o.store_id = p_store_id
     and o.order_status = 'completed'
     and o.completed_at >= v_today_start
     and o.completed_at < v_tomorrow_start
     and extract(hour from o.completed_at at time zone v_timezone)::integer = h.hour
    group by h.hour
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_key', x.product_key,
      'name', x.product_name,
      'quantity', x.quantity,
      'sales_cents', x.sales_cents
    ) order by x.quantity desc, x.sales_cents desc, x.product_name), '[]'::jsonb)
    into v_top_products
  from (
    select coalesce(oi.product_id::text, 'snapshot:' || lower(oi.product_name_snapshot)) as product_key,
           (array_agg(oi.product_name_snapshot order by o.completed_at desc, oi.id))[1] as product_name,
           sum(oi.quantity)::bigint as quantity,
           sum(oi.line_total_cents)::bigint as sales_cents
    from public.order_items oi
    join public.orders o
      on o.organization_id = oi.organization_id
     and o.store_id = oi.store_id
     and o.id = oi.order_id
    where o.organization_id = v_organization_id
      and o.store_id = p_store_id
      and o.order_status = 'completed'
      and o.completed_at >= v_today_start
      and o.completed_at < v_tomorrow_start
    group by coalesce(oi.product_id::text, 'snapshot:' || lower(oi.product_name_snapshot))
    order by sum(oi.quantity) desc, sum(oi.line_total_cents) desc
    limit 8
  ) x;

  return jsonb_build_object(
    'store_id', p_store_id,
    'organization_id', v_organization_id,
    'timezone', v_timezone,
    'local_date', v_today,
    'generated_at', v_now,
    'sales_count', v_sales_count,
    'sales_cents', v_sales_cents,
    'average_ticket_cents', case when v_sales_count = 0 then 0 else round(v_sales_cents::numeric / v_sales_count)::bigint end,
    'customer_count', v_customer_count,
    'open_orders', v_open_orders,
    'previous_sales_count', v_previous_sales_count,
    'previous_sales_cents', v_previous_sales_cents,
    'hourly', v_hourly,
    'top_products', v_top_products
  );
end;
$$;

revoke all on function public.dashboard_snapshot_internal(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.dashboard_snapshot_internal(uuid,timestamptz) to service_role;
