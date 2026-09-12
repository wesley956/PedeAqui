-- PedeAqui — #1020 Grupos de clientes e elegibilidade promocional por unidade.

create or replace function private.segment_rule_matches(
  p_rules jsonb,
  p_orders_count bigint,
  p_total_spent_cents bigint,
  p_average_ticket_cents bigint,
  p_last_order_at timestamptz,
  p_cashback_balance bigint,
  p_loyalty_balance bigint
) returns boolean
language plpgsql stable security invoker set search_path = ''
as $$
declare v_days numeric;
begin
  if coalesce((p_rules->>'orders_count_min')::bigint,0) > p_orders_count then return false; end if;
  if p_rules ? 'orders_count_max' and (p_rules->>'orders_count_max')::bigint < p_orders_count then return false; end if;
  if coalesce((p_rules->>'total_spent_cents_min')::bigint,0) > p_total_spent_cents then return false; end if;
  if coalesce((p_rules->>'average_ticket_cents_min')::bigint,0) > p_average_ticket_cents then return false; end if;
  if coalesce((p_rules->>'has_cashback_balance')::boolean,false) and p_cashback_balance <= 0 then return false; end if;
  if coalesce((p_rules->>'has_loyalty_balance')::boolean,false) and p_loyalty_balance <= 0 then return false; end if;
  if p_rules ? 'inactive_days_min' then
    if p_last_order_at is null then return false; end if;
    v_days := extract(epoch from (now()-p_last_order_at))/86400;
    if v_days < (p_rules->>'inactive_days_min')::numeric then return false; end if;
  end if;
  if p_rules ? 'last_order_days_max' then
    if p_last_order_at is null then return false; end if;
    v_days := extract(epoch from (now()-p_last_order_at))/86400;
    if v_days > (p_rules->>'last_order_days_max')::numeric then return false; end if;
  end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid segment rules';
end;
$$;
revoke all on function private.segment_rule_matches(jsonb,bigint,bigint,bigint,timestamptz,bigint,bigint) from public,anon,authenticated;
grant execute on function private.segment_rule_matches(jsonb,bigint,bigint,bigint,timestamptz,bigint,bigint) to service_role;

create or replace function public.growth_store_customers_internal(p_store_id uuid)
returns table(customer_id uuid,name text,phone_normalized text,orders_count bigint,last_order_at timestamptz,preference_status text,contact_valid boolean,eligible_whatsapp boolean)
language sql stable security invoker set search_path = ''
as $$
  with target_store as (
    select s.id,s.organization_id from public.stores s where s.id=p_store_id
  ), metrics as (
    select c.id,c.name,c.phone_normalized,count(o.id)::bigint orders_count,max(o.created_at) last_order_at
    from target_store s
    join public.orders o on o.organization_id=s.organization_id and o.store_id=s.id and o.order_status='completed' and o.customer_id is not null
    join public.customers c on c.organization_id=s.organization_id and c.id=o.customer_id and c.deleted_at is null
    group by c.id,c.name,c.phone_normalized
  )
  select m.id,m.name,m.phone_normalized,m.orders_count,m.last_order_at,
    coalesce(p.status,'not_consented') preference_status,
    coalesce(m.phone_normalized ~ '^[0-9]{8,20}$',false) contact_valid,
    coalesce(p.status='consented' and m.phone_normalized ~ '^[0-9]{8,20}$',false) eligible_whatsapp
  from metrics m
  left join public.customer_marketing_preferences p on p.store_id=p_store_id and p.customer_id=m.id and p.channel='whatsapp'
  order by m.name,m.id;
$$;
revoke all on function public.growth_store_customers_internal(uuid) from public,anon,authenticated;
grant execute on function public.growth_store_customers_internal(uuid) to service_role;

create or replace function public.growth_group_summaries_internal(p_store_id uuid)
returns table(group_key text,segment_id uuid,name text,group_kind text,rules jsonb,members bigint,eligible_whatsapp bigint,opted_out bigint,not_consented bigint,invalid_contact bigint)
language sql stable security invoker set search_path = ''
as $$
  with target_store as (
    select s.id,s.organization_id,(now() at time zone s.timezone)::date local_date from public.stores s where s.id=p_store_id
  ), metrics as (
    select c.id,c.birth_date,s.local_date,count(o.id)::bigint orders_count,coalesce(sum(o.total_cents),0)::bigint total_spent_cents,
      coalesce(round(avg(o.total_cents)),0)::bigint average_ticket_cents,max(o.created_at) last_order_at,
      coalesce(ca.balance_cents,0)::bigint cashback_balance,coalesce(la.balance_points,0)::bigint loyalty_balance,
      c.phone_normalized,coalesce(p.status,'not_consented') preference_status
    from target_store s
    join public.orders o on o.organization_id=s.organization_id and o.store_id=s.id and o.order_status='completed' and o.customer_id is not null
    join public.customers c on c.organization_id=s.organization_id and c.id=o.customer_id and c.deleted_at is null
    left join public.cashback_accounts ca on ca.organization_id=s.organization_id and ca.store_id=s.id and ca.customer_id=c.id
    left join public.loyalty_accounts la on la.organization_id=s.organization_id and la.store_id=s.id and la.customer_id=c.id
    left join public.customer_marketing_preferences p on p.organization_id=s.organization_id and p.store_id=s.id and p.customer_id=c.id and p.channel='whatsapp'
    group by c.id,c.birth_date,s.local_date,c.phone_normalized,ca.balance_cents,la.balance_points,p.status
  ), definitions as (
    select * from (values
      ('preset:all',null::uuid,'Todos os clientes','preset','{}'::jsonb),
      ('preset:new',null::uuid,'Clientes novos','preset','{"orders_count_min":1,"orders_count_max":1}'::jsonb),
      ('preset:recurring',null::uuid,'Clientes recorrentes','preset','{"orders_count_min":2}'::jsonb),
      ('preset:five',null::uuid,'5 ou mais pedidos','preset','{"orders_count_min":5}'::jsonb),
      ('preset:vip',null::uuid,'Clientes VIP','preset','{"total_spent_cents_min":30000}'::jsonb),
      ('preset:recent',null::uuid,'Compraram recentemente','preset','{"last_order_days_max":30}'::jsonb),
      ('preset:inactive15',null::uuid,'Inativos há 15 dias','preset','{"inactive_days_min":15}'::jsonb),
      ('preset:inactive30',null::uuid,'Inativos há 30 dias','preset','{"inactive_days_min":30}'::jsonb),
      ('preset:inactive60',null::uuid,'Inativos há 60 dias','preset','{"inactive_days_min":60}'::jsonb),
      ('preset:inactive90',null::uuid,'Inativos há 90 dias','preset','{"inactive_days_min":90}'::jsonb),
      ('preset:cashback',null::uuid,'Com cashback','preset','{"has_cashback_balance":true}'::jsonb),
      ('preset:points',null::uuid,'Com pontos','preset','{"has_loyalty_balance":true}'::jsonb),
      ('preset:birthday',null::uuid,'Aniversariantes de hoje','preset','{"birthday_today":true}'::jsonb)
    ) d(group_key,segment_id,name,group_kind,rules)
    union all
    select 'segment:'||cs.id::text,cs.id,cs.name,'custom',cs.rules
    from public.customer_segments cs join target_store s on cs.organization_id=s.organization_id and cs.store_id=s.id
    where cs.active=true
  ), matched as (
    select d.*,m.id,m.preference_status,
      coalesce(m.phone_normalized ~ '^[0-9]{8,20}$',false) contact_valid
    from definitions d cross join metrics m
    where private.segment_rule_matches(d.rules,m.orders_count,m.total_spent_cents,m.average_ticket_cents,m.last_order_at,m.cashback_balance,m.loyalty_balance)
      and (not (d.rules ? 'birthday_today') or (m.birth_date is not null and extract(month from m.birth_date)=extract(month from m.local_date) and extract(day from m.birth_date)=extract(day from m.local_date)))
  )
  select d.group_key,d.segment_id,d.name,d.group_kind,d.rules,
    count(m.id)::bigint,
    count(m.id) filter(where m.preference_status='consented' and m.contact_valid)::bigint,
    count(m.id) filter(where m.preference_status='opted_out')::bigint,
    count(m.id) filter(where m.preference_status='not_consented')::bigint,
    count(m.id) filter(where not m.contact_valid)::bigint
  from definitions d left join matched m on m.group_key=d.group_key
  group by d.group_key,d.segment_id,d.name,d.group_kind,d.rules
  order by case when d.group_key='preset:all' then 0 when d.group_kind='preset' then 1 else 2 end,d.name;
$$;
revoke all on function public.growth_group_summaries_internal(uuid) from public,anon,authenticated;
grant execute on function public.growth_group_summaries_internal(uuid) to service_role;

create or replace function public.customer_marketing_preference_internal(
  p_store_id uuid,p_customer_id uuid,p_channel text,p_status text,p_source text,p_actor_user_id uuid
) returns public.customer_marketing_preferences language plpgsql security invoker set search_path='' as $$
declare v_store public.stores%rowtype; v_result public.customer_marketing_preferences%rowtype; v_current public.customer_marketing_preferences%rowtype;
begin
  select * into v_store from public.stores where id=p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;
  if not exists(select 1 from public.customers c where c.id=p_customer_id and c.organization_id=v_store.organization_id and c.deleted_at is null) then raise exception 'customer not found'; end if;
  if p_channel not in ('whatsapp','email') or p_status not in ('not_consented','consented','opted_out') or p_source not in ('unknown','checkout','manual','import','customer_request','provider_webhook') then raise exception 'invalid marketing preference'; end if;
  select * into v_current from public.customer_marketing_preferences where store_id=v_store.id and customer_id=p_customer_id and channel=p_channel for update;
  if v_current.status='opted_out' and p_status<>'opted_out' and p_source not in ('customer_request','provider_webhook') then
    raise exception 'opt-out requires explicit customer opt-in to be reversed';
  end if;
  insert into public.customer_marketing_preferences(organization_id,store_id,customer_id,channel,status,source,consented_at,opted_out_at,updated_by)
  values(v_store.organization_id,v_store.id,p_customer_id,p_channel,p_status,p_source,
    case when p_status='consented' then now() else null end,case when p_status='opted_out' then now() else null end,p_actor_user_id)
  on conflict(store_id,customer_id,channel) do update set status=excluded.status,source=excluded.source,
    consented_at=case when excluded.status='consented' then now() else public.customer_marketing_preferences.consented_at end,
    opted_out_at=case when excluded.status='opted_out' then coalesce(public.customer_marketing_preferences.opted_out_at,now()) else null end,
    updated_by=excluded.updated_by,updated_at=now()
  returning * into v_result;
  return v_result;
end $$;
revoke all on function public.customer_marketing_preference_internal(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.customer_marketing_preference_internal(uuid,uuid,text,text,text,uuid) to service_role;

create or replace function public.growth_prepare_campaign_internal(p_campaign_id uuid,p_actor_user_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_campaign public.campaigns%rowtype; v_count integer:=0;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.status in ('completed','canceled') then raise exception 'campaign is closed'; end if;
  if v_campaign.segment_id is null then
    insert into public.campaign_recipients(organization_id,store_id,campaign_id,customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,metadata)
    select v_campaign.organization_id,v_campaign.store_id,v_campaign.id,c.id,c.name,c.phone,c.email,jsonb_build_object('snapshot_source','all_store_customers')
    from public.customers c where c.organization_id=v_campaign.organization_id and c.deleted_at is null
      and exists(select 1 from public.orders o where o.organization_id=v_campaign.organization_id and o.store_id=v_campaign.store_id and o.customer_id=c.id and o.order_status='completed')
    on conflict(campaign_id,customer_id) do nothing;
  else
    insert into public.campaign_recipients(organization_id,store_id,campaign_id,customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,metadata)
    select v_campaign.organization_id,v_campaign.store_id,v_campaign.id,s.customer_id,s.name,s.phone,s.email,
      jsonb_build_object('snapshot_source','segment','segment_id',v_campaign.segment_id,'orders_count',s.orders_count,'total_spent_cents',s.total_spent_cents)
    from public.growth_segment_customers_internal(v_campaign.segment_id) s where s.orders_count>0
    on conflict(campaign_id,customer_id) do nothing;
  end if;
  get diagnostics v_count=row_count;
  update public.campaigns set status='running',started_at=coalesce(started_at,now()),updated_at=now(),updated_by=coalesce(p_actor_user_id,updated_by) where id=v_campaign.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_campaign.organization_id,v_campaign.store_id,p_actor_user_id,'growth.campaign_prepared','campaign',v_campaign.id,jsonb_build_object('new_recipients',v_count));
  return jsonb_build_object('campaign_id',v_campaign.id,'new_recipients',v_count,'total_recipients',(select count(*) from public.campaign_recipients where campaign_id=v_campaign.id));
end;
$$;
revoke all on function public.growth_prepare_campaign_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.growth_prepare_campaign_internal(uuid,uuid) to service_role;

create or replace function public.campaign_enqueue_internal(p_campaign_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_campaign public.campaigns%rowtype; v_settings public.store_operational_settings%rowtype; v_eligible integer:=0; v_excluded integer:=0;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'campaign is not queueable'; end if;
  if v_campaign.channel<>'whatsapp' or nullif(trim(v_campaign.template_name),'') is null then raise exception 'approved WhatsApp template is required'; end if;
  select * into v_settings from public.store_operational_settings where store_id=v_campaign.store_id;
  if not coalesce(v_settings.growth_campaigns_enabled,false) or not private.store_module_enabled(v_campaign.organization_id,v_campaign.store_id,'growth') then raise exception 'campaigns are disabled'; end if;
  perform public.growth_prepare_campaign_internal(v_campaign.id,p_actor_user_id);
  update public.campaign_recipients cr set
    status=case
      when not exists(select 1 from public.orders o where o.organization_id=v_campaign.organization_id and o.store_id=v_campaign.store_id and o.customer_id=c.id and o.order_status='completed') then 'skipped_invalid_contact'
      when p.status='opted_out' then 'skipped_opt_out'
      when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then 'queued'
      else 'skipped_invalid_contact' end,
    reason=case
      when not exists(select 1 from public.orders o where o.organization_id=v_campaign.organization_id and o.store_id=v_campaign.store_id and o.customer_id=c.id and o.order_status='completed') then 'Cliente fora do grupo de compradores da unidade'
      when p.status='opted_out' then 'Cliente solicitou opt-out'
      when p.status is distinct from 'consented' then 'Consentimento promocional ausente'
      when not coalesce(c.phone_normalized ~ '^[0-9]{8,20}$',false) then 'Telefone inválido ou ausente'
      else null end,
    phone_snapshot=case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then c.phone_normalized else null end,
    idempotency_key='campaign:'||v_campaign.id::text||':customer:'||cr.customer_id::text||':v'||v_campaign.content_version::text,
    next_attempt_at=case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then now() else null end,
    processed_at=case when p.status='consented' and c.phone_normalized ~ '^[0-9]{8,20}$' then null else now() end
  from public.customers c
  left join public.customer_marketing_preferences p on p.organization_id=v_campaign.organization_id and p.store_id=v_campaign.store_id and p.customer_id=c.id and p.channel='whatsapp'
  where cr.campaign_id=v_campaign.id and c.id=cr.customer_id and c.organization_id=v_campaign.organization_id;
  select count(*) filter(where status='queued'),count(*) filter(where status like 'skipped_%') into v_eligible,v_excluded from public.campaign_recipients where campaign_id=v_campaign.id;
  update public.campaigns set status='running',started_at=coalesce(started_at,now()),queued_at=now(),audience_summary=jsonb_build_object('members',v_eligible+v_excluded,'eligible',v_eligible,'excluded',v_excluded),updated_by=p_actor_user_id,updated_at=now() where id=v_campaign.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_campaign.organization_id,v_campaign.store_id,p_actor_user_id,'growth.campaign_enqueued','campaign',v_campaign.id,jsonb_build_object('eligible',v_eligible,'excluded',v_excluded,'template_name',v_campaign.template_name));
  return jsonb_build_object('campaign_id',v_campaign.id,'eligible',v_eligible,'excluded',v_excluded,'status','running');
end $$;
revoke all on function public.campaign_enqueue_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.campaign_enqueue_internal(uuid,uuid) to service_role;
