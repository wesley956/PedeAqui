create or replace function public.growth_prepare_campaign_internal(
  p_campaign_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_campaign public.campaigns%rowtype;
  v_count integer := 0;
begin
  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'campaign not found';
  end if;
  if v_campaign.status in ('completed','canceled') then
    raise exception 'campaign is closed';
  end if;

  if v_campaign.segment_id is null then
    insert into public.campaign_recipients(
      organization_id, store_id, campaign_id, customer_id,
      customer_name_snapshot, phone_snapshot, email_snapshot, metadata
    )
    select
      v_campaign.organization_id, v_campaign.store_id, v_campaign.id,
      c.id, c.name, c.phone, c.email,
      jsonb_build_object('snapshot_source','all_store_customers')
    from public.customers c
    where c.organization_id = v_campaign.organization_id
      and c.deleted_at is null
      and exists(
        select 1
        from public.orders o
        where o.organization_id = v_campaign.organization_id
          and o.store_id = v_campaign.store_id
          and o.customer_id = c.id
          and o.order_status = 'completed'
      )
    on conflict do nothing;
  else
    insert into public.campaign_recipients(
      organization_id, store_id, campaign_id, customer_id,
      customer_name_snapshot, phone_snapshot, email_snapshot, metadata
    )
    select
      v_campaign.organization_id, v_campaign.store_id, v_campaign.id,
      s.customer_id, s.name, s.phone, s.email,
      jsonb_build_object(
        'snapshot_source','segment',
        'segment_id',v_campaign.segment_id,
        'orders_count',s.orders_count,
        'total_spent_cents',s.total_spent_cents
      )
    from public.growth_segment_customers_internal(v_campaign.segment_id) s
    where s.orders_count > 0
    on conflict do nothing;
  end if;

  get diagnostics v_count = row_count;

  update public.campaigns
  set status = 'running',
      started_at = coalesce(started_at, now()),
      updated_at = now(),
      updated_by = coalesce(p_actor_user_id, updated_by)
  where id = v_campaign.id;

  insert into public.audit_logs(
    organization_id, store_id, actor_user_id, action,
    entity_type, entity_id, after_data
  )
  values(
    v_campaign.organization_id, v_campaign.store_id, p_actor_user_id,
    'growth.campaign_prepared', 'campaign', v_campaign.id,
    jsonb_build_object('new_recipients', v_count)
  );

  return jsonb_build_object(
    'campaign_id', v_campaign.id,
    'new_recipients', v_count,
    'total_recipients', (
      select count(*) from public.campaign_recipients
      where campaign_id = v_campaign.id
    )
  );
end;
$function$;
