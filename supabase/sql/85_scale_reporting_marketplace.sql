-- PedeAqui — Milestone 23 [250]–[252]
-- Agregações multiunidade sobre fontes existentes; nenhuma segunda verdade operacional.

create or replace function public.central_purchase_needs_internal(p_organization_id uuid,p_group_id uuid default null)
returns table(
  store_id uuid,store_name text,inventory_item_id uuid,item_name text,base_unit text,
  current_quantity numeric,minimum_quantity numeric,shortage_quantity numeric,
  preferred_supplier_id uuid,preferred_supplier_name text,purchase_unit_label text,base_units_per_purchase_unit numeric,last_unit_cost_cents bigint
)
language sql stable security invoker set search_path='' as $$
  select s.id,s.name,i.id,i.name,i.base_unit,
    coalesce(b.quantity,0),cfg.minimum_quantity,
    greatest(cfg.minimum_quantity-coalesce(b.quantity,0),0),
    pref.supplier_id,pref.supplier_name,pref.purchase_unit_label,pref.base_units_per_purchase_unit,pref.last_unit_cost_cents
  from public.inventory_item_stores cfg
  join public.stores s on s.organization_id=cfg.organization_id and s.id=cfg.store_id
  join public.inventory_items i on i.organization_id=cfg.organization_id and i.id=cfg.inventory_item_id and i.active=true and i.deleted_at is null
  left join public.inventory_balances b on b.organization_id=cfg.organization_id and b.store_id=cfg.store_id and b.inventory_item_id=cfg.inventory_item_id
  left join lateral (
    select sii.supplier_id,sup.name as supplier_name,sii.purchase_unit_label,sii.base_units_per_purchase_unit,sii.last_unit_cost_cents
    from public.supplier_inventory_items sii
    join public.suppliers sup on sup.organization_id=sii.organization_id and sup.id=sii.supplier_id and sup.active=true and sup.deleted_at is null
    where sii.organization_id=cfg.organization_id and sii.store_id=cfg.store_id and sii.inventory_item_id=cfg.inventory_item_id and sii.active=true
    order by sii.is_preferred desc,sii.updated_at desc,sii.supplier_id
    limit 1
  ) pref on true
  where cfg.organization_id=p_organization_id and cfg.active=true
    and cfg.minimum_quantity>coalesce(b.quantity,0)
    and (p_group_id is null or exists(
      select 1 from public.franchise_group_stores gs where gs.organization_id=p_organization_id and gs.group_id=p_group_id and gs.store_id=cfg.store_id
    ))
  order by i.name,s.name;
$$;
revoke all on function public.central_purchase_needs_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.central_purchase_needs_internal(uuid,uuid) to service_role;

create or replace function public.multiunit_bi_internal(p_organization_id uuid,p_group_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if p_to<p_from then raise exception 'invalid reporting period'; end if;
  select jsonb_build_object(
    'from',p_from,'to',p_to,
    'stores',coalesce(jsonb_agg(jsonb_build_object(
      'store_id',x.store_id,'store_name',x.store_name,'completed_orders',x.completed_orders,'sales_cents',x.sales_cents,
      'average_ticket_cents',case when x.completed_orders>0 then x.sales_cents/x.completed_orders else 0 end,
      'finance',x.finance
    ) order by x.store_name),'[]'::jsonb),
    'totals',jsonb_build_object(
      'completed_orders',coalesce(sum(x.completed_orders),0),
      'sales_cents',coalesce(sum(x.sales_cents),0)
    )
  ) into v_result
  from (
    select s.id as store_id,s.name as store_name,
      count(o.id) filter(where o.order_status='completed' and o.completed_at>=p_from::timestamptz and o.completed_at<(p_to+1)::timestamptz)::bigint as completed_orders,
      coalesce(sum(o.total_cents) filter(where o.order_status='completed' and o.completed_at>=p_from::timestamptz and o.completed_at<(p_to+1)::timestamptz),0)::bigint as sales_cents,
      public.financial_report_internal(s.id,p_from,p_to) as finance
    from public.stores s
    left join public.orders o on o.organization_id=s.organization_id and o.store_id=s.id and o.completed_at>=p_from::timestamptz and o.completed_at<(p_to+1)::timestamptz
    where s.organization_id=p_organization_id and s.status='active'
      and (p_group_id is null or exists(select 1 from public.franchise_group_stores gs where gs.organization_id=p_organization_id and gs.group_id=p_group_id and gs.store_id=s.id))
    group by s.id,s.name
  ) x;
  return coalesce(v_result,jsonb_build_object('from',p_from,'to',p_to,'stores','[]'::jsonb,'totals',jsonb_build_object('completed_orders',0,'sales_cents',0)));
end;
$$;
revoke all on function public.multiunit_bi_internal(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.multiunit_bi_internal(uuid,uuid,date,date) to service_role;

create or replace function public.integration_marketplace_internal(p_organization_id uuid,p_store_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'adapter_key',c.adapter_key,'kind',c.kind,'display_name',c.display_name,'description',c.description,
    'capabilities',c.capabilities,'docs_url',c.docs_url,'installed',coalesce(inst.installed,false),'integration_id',inst.integration_id,'active',coalesce(inst.active,false)
  ) order by c.position,c.display_name),'[]'::jsonb)
  from public.integration_catalog c
  left join lateral (
    select true as installed,i.id as integration_id,i.active
    from public.integrations i
    where i.organization_id=p_organization_id and i.store_id is not distinct from p_store_id and i.provider_key=c.adapter_key
    order by i.updated_at desc limit 1
  ) inst on true
  where c.active=true;
$$;
revoke all on function public.integration_marketplace_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.integration_marketplace_internal(uuid,uuid) to service_role;
