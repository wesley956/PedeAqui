-- PedeAqui — bloco [146]–[151]
-- Segmentação dinâmica, campanhas, snapshots de público e automações idempotentes.

create table if not exists public.customer_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_segments_store_same_org_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint customer_segments_org_store_id_unique unique (organization_id,store_id,id)
);
create index if not exists customer_segments_store_active_idx on public.customer_segments(organization_id,store_id,active,name);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  segment_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 140),
  objective text check (objective is null or char_length(objective) <= 240),
  channel text not null default 'internal' check (channel in ('internal','whatsapp','email')),
  content text not null default '' check (char_length(content) <= 4000),
  template_data jsonb not null default '{}'::jsonb check (jsonb_typeof(template_data) = 'object'),
  status text not null default 'draft' check (status in ('draft','scheduled','running','completed','canceled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_store_same_org_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint campaigns_segment_same_store_fk foreign key (organization_id,store_id,segment_id)
    references public.customer_segments(organization_id,store_id,id) on delete set null (segment_id),
  constraint campaigns_org_store_id_unique unique (organization_id,store_id,id),
  constraint campaigns_status_times check (
    (status <> 'scheduled' or scheduled_at is not null)
    and (status <> 'running' or started_at is not null)
    and (status <> 'completed' or completed_at is not null)
    and (status <> 'canceled' or canceled_at is not null)
  )
);
create index if not exists campaigns_store_status_idx on public.campaigns(organization_id,store_id,status,scheduled_at);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  campaign_id uuid not null,
  customer_id uuid not null,
  customer_name_snapshot text not null,
  phone_snapshot text,
  email_snapshot text,
  status text not null default 'pending' check (status in ('pending','processed','skipped','failed')),
  reason text check (reason is null or char_length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campaign_recipients_campaign_same_store_fk foreign key (organization_id,store_id,campaign_id)
    references public.campaigns(organization_id,store_id,id) on delete cascade,
  constraint campaign_recipients_customer_same_org_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on delete cascade,
  constraint campaign_recipients_campaign_customer_unique unique (campaign_id,customer_id),
  constraint campaign_recipients_processed_time check (status <> 'processed' or processed_at is not null)
);
create index if not exists campaign_recipients_queue_idx on public.campaign_recipients(organization_id,store_id,campaign_id,status,created_at);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 140),
  trigger_type text not null check (trigger_type in ('order.completed','customer.inactive','customer.birthday')),
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  action_type text not null check (action_type in ('campaign','bonus_cashback','bonus_points')),
  action_config jsonb not null default '{}'::jsonb check (jsonb_typeof(action_config) = 'object'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_rules_store_same_org_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint automation_rules_org_store_id_unique unique (organization_id,store_id,id)
);
create index if not exists automation_rules_trigger_idx on public.automation_rules(organization_id,store_id,trigger_type,active);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  rule_id uuid not null,
  customer_id uuid,
  order_id uuid,
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 220),
  status text not null default 'processing' check (status in ('processing','completed','skipped','failed')),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint automation_runs_rule_same_store_fk foreign key (organization_id,store_id,rule_id)
    references public.automation_rules(organization_id,store_id,id) on delete cascade,
  constraint automation_runs_customer_same_org_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on delete set null (customer_id),
  constraint automation_runs_order_same_store_fk foreign key (organization_id,store_id,order_id)
    references public.orders(organization_id,store_id,id) on delete set null (order_id),
  constraint automation_runs_org_idem_unique unique (organization_id,idempotency_key),
  constraint automation_runs_completed_time check (status <> 'completed' or completed_at is not null)
);
create index if not exists automation_runs_rule_created_idx on public.automation_runs(organization_id,store_id,rule_id,started_at desc);

alter table public.customer_segments enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;

revoke all on table public.customer_segments,public.campaigns,public.campaign_recipients,public.automation_rules,public.automation_runs from anon,authenticated;
grant select on table public.customer_segments,public.campaigns,public.campaign_recipients,public.automation_rules,public.automation_runs to authenticated;
grant select,insert,update,delete on table public.customer_segments,public.campaigns,public.campaign_recipients,public.automation_rules,public.automation_runs to service_role;

create policy customer_segments_view on public.customer_segments for select to authenticated
using (private.has_permission(organization_id,store_id,'growth.view'));
create policy campaigns_view on public.campaigns for select to authenticated
using (private.has_permission(organization_id,store_id,'growth.view'));
create policy campaign_recipients_view on public.campaign_recipients for select to authenticated
using (private.has_permission(organization_id,store_id,'growth.view'));
create policy automation_rules_view on public.automation_rules for select to authenticated
using (private.has_permission(organization_id,store_id,'growth.view'));
create policy automation_runs_view on public.automation_runs for select to authenticated
using (private.has_permission(organization_id,store_id,'growth.view'));

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
  if coalesce((p_rules->>'total_spent_cents_min')::bigint,0) > p_total_spent_cents then return false; end if;
  if coalesce((p_rules->>'average_ticket_cents_min')::bigint,0) > p_average_ticket_cents then return false; end if;
  if coalesce((p_rules->>'has_cashback_balance')::boolean,false) and p_cashback_balance <= 0 then return false; end if;
  if coalesce((p_rules->>'has_loyalty_balance')::boolean,false) and p_loyalty_balance <= 0 then return false; end if;
  if p_rules ? 'inactive_days_min' then
    if p_last_order_at is null then return true; end if;
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

create or replace function public.growth_segment_customers_internal(p_segment_id uuid)
returns table(customer_id uuid,name text,phone text,email text,orders_count bigint,total_spent_cents bigint,average_ticket_cents bigint,last_order_at timestamptz,cashback_balance_cents bigint,loyalty_balance_points bigint)
language plpgsql stable security invoker set search_path = ''
as $$
declare v_segment public.customer_segments%rowtype;
begin
  select * into v_segment from public.customer_segments where id=p_segment_id and active=true;
  if v_segment.id is null then raise exception 'segment unavailable'; end if;
  return query
  with metrics as (
    select c.id,c.name,c.phone,c.email,
      count(o.id) filter(where o.order_status='completed')::bigint as orders_count,
      coalesce(sum(o.total_cents) filter(where o.order_status='completed'),0)::bigint as total_spent_cents,
      coalesce(round(avg(o.total_cents) filter(where o.order_status='completed')),0)::bigint as average_ticket_cents,
      max(o.created_at) filter(where o.order_status='completed') as last_order_at,
      coalesce(ca.balance_cents,0)::bigint as cashback_balance,
      coalesce(la.balance_points,0)::bigint as loyalty_balance
    from public.customers c
    left join public.orders o on o.organization_id=c.organization_id and o.store_id=v_segment.store_id and o.customer_id=c.id
    left join public.cashback_accounts ca on ca.organization_id=c.organization_id and ca.store_id=v_segment.store_id and ca.customer_id=c.id
    left join public.loyalty_accounts la on la.organization_id=c.organization_id and la.store_id=v_segment.store_id and la.customer_id=c.id
    where c.organization_id=v_segment.organization_id and c.deleted_at is null
    group by c.id,c.name,c.phone,c.email,ca.balance_cents,la.balance_points
  )
  select m.id,m.name,m.phone,m.email,m.orders_count,m.total_spent_cents,m.average_ticket_cents,m.last_order_at,m.cashback_balance,m.loyalty_balance
  from metrics m
  where private.segment_rule_matches(v_segment.rules,m.orders_count,m.total_spent_cents,m.average_ticket_cents,m.last_order_at,m.cashback_balance,m.loyalty_balance)
  order by m.total_spent_cents desc,m.name,m.id;
end;
$$;
revoke all on function public.growth_segment_customers_internal(uuid) from public,anon,authenticated;
grant execute on function public.growth_segment_customers_internal(uuid) to service_role;

create or replace function public.growth_prepare_campaign_internal(p_campaign_id uuid,p_actor_user_id uuid default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_campaign public.campaigns%rowtype; v_count integer:=0;
begin
  select * into v_campaign from public.campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.status in ('completed','canceled') then raise exception 'campaign is closed'; end if;

  if v_campaign.segment_id is null then
    insert into public.campaign_recipients(organization_id,store_id,campaign_id,customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,metadata)
    select c.organization_id,v_campaign.store_id,v_campaign.id,c.id,c.name,c.phone,c.email,jsonb_build_object('snapshot_source','all_customers')
    from public.customers c where c.organization_id=v_campaign.organization_id and c.deleted_at is null
    on conflict(campaign_id,customer_id) do nothing;
  else
    insert into public.campaign_recipients(organization_id,store_id,campaign_id,customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,metadata)
    select v_campaign.organization_id,v_campaign.store_id,v_campaign.id,s.customer_id,s.name,s.phone,s.email,
      jsonb_build_object('snapshot_source','segment','segment_id',v_campaign.segment_id,'orders_count',s.orders_count,'total_spent_cents',s.total_spent_cents)
    from public.growth_segment_customers_internal(v_campaign.segment_id) s
    on conflict(campaign_id,customer_id) do nothing;
  end if;
  get diagnostics v_count=row_count;

  update public.campaigns set status='running',started_at=coalesce(started_at,now()),updated_at=now(),updated_by=coalesce(p_actor_user_id,updated_by)
  where id=v_campaign.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_campaign.organization_id,v_campaign.store_id,p_actor_user_id,'growth.campaign_prepared','campaign',v_campaign.id,jsonb_build_object('new_recipients',v_count));
  return jsonb_build_object('campaign_id',v_campaign.id,'new_recipients',v_count,'total_recipients',(select count(*) from public.campaign_recipients where campaign_id=v_campaign.id));
end;
$$;
revoke all on function public.growth_prepare_campaign_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.growth_prepare_campaign_internal(uuid,uuid) to service_role;

create or replace function private.execute_growth_automation(
  p_rule public.automation_rules,
  p_customer public.customers,
  p_order public.orders,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_amount bigint; v_points bigint; v_campaign_id uuid; v_tx jsonb;
begin
  if p_rule.action_type='bonus_cashback' then
    v_amount:=coalesce((p_rule.action_config->>'amount_cents')::bigint,0);
    if v_amount<=0 and p_order.id is not null then
      v_amount:=floor(greatest(0,p_order.subtotal_cents-p_order.discount_cents)::numeric*coalesce((p_rule.action_config->>'rate_bps')::integer,0)/10000)::bigint;
    end if;
    if v_amount<=0 then return jsonb_build_object('skipped','zero_bonus'); end if;
    v_tx:=to_jsonb(private.post_cashback_transaction(p_rule.organization_id,p_rule.store_id,p_customer.id,p_order.id,'earn',v_amount,
      p_idempotency_key||':cashback',null,jsonb_build_object('automation_rule_id',p_rule.id),p_actor_user_id));
    return jsonb_build_object('cashback_cents',v_amount,'transaction_id',v_tx->>'id');
  elsif p_rule.action_type='bonus_points' then
    v_points:=coalesce((p_rule.action_config->>'points')::bigint,0);
    if v_points<=0 then return jsonb_build_object('skipped','zero_bonus'); end if;
    v_tx:=to_jsonb(private.post_loyalty_transaction(p_rule.organization_id,p_rule.store_id,p_customer.id,p_order.id,'earn',v_points,
      p_idempotency_key||':points',null,jsonb_build_object('automation_rule_id',p_rule.id),p_actor_user_id));
    return jsonb_build_object('points',v_points,'transaction_id',v_tx->>'id');
  else
    v_campaign_id:=nullif(p_rule.action_config->>'campaign_id','')::uuid;
    if v_campaign_id is null then raise exception 'campaign automation requires campaign_id'; end if;
    if not exists(select 1 from public.campaigns where id=v_campaign_id and organization_id=p_rule.organization_id and store_id=p_rule.store_id and status not in ('completed','canceled')) then
      raise exception 'automation campaign unavailable';
    end if;
    insert into public.campaign_recipients(organization_id,store_id,campaign_id,customer_id,customer_name_snapshot,phone_snapshot,email_snapshot,metadata)
    values(p_rule.organization_id,p_rule.store_id,v_campaign_id,p_customer.id,p_customer.name,p_customer.phone,p_customer.email,
      jsonb_build_object('snapshot_source','automation','automation_rule_id',p_rule.id))
    on conflict(campaign_id,customer_id) do nothing;
    return jsonb_build_object('campaign_id',v_campaign_id,'customer_id',p_customer.id);
  end if;
end;
$$;
revoke all on function private.execute_growth_automation(public.automation_rules,public.customers,public.orders,text,uuid) from public,anon,authenticated;

create or replace function private.process_order_completed_automations()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare v_rule public.automation_rules%rowtype; v_customer public.customers%rowtype; v_idem text; v_run_id uuid; v_result jsonb;
begin
  if new.order_status<>'completed' or old.order_status is not distinct from new.order_status or new.customer_id is null then return new; end if;
  select * into v_customer from public.customers where id=new.customer_id and organization_id=new.organization_id;
  if v_customer.id is null then return new; end if;
  for v_rule in select * from public.automation_rules where organization_id=new.organization_id and store_id=new.store_id and trigger_type='order.completed' and active=true order by id
  loop
    if v_rule.conditions ? 'minimum_total_cents' and new.total_cents < (v_rule.conditions->>'minimum_total_cents')::bigint then continue; end if;
    if v_rule.conditions ? 'channel' and new.channel <> v_rule.conditions->>'channel' then continue; end if;
    v_idem:='automation:'||v_rule.id::text||':order:'||new.id::text;
    insert into public.automation_runs(organization_id,store_id,rule_id,customer_id,order_id,idempotency_key,status)
    values(new.organization_id,new.store_id,v_rule.id,new.customer_id,new.id,v_idem,'processing')
    on conflict(organization_id,idempotency_key) do nothing returning id into v_run_id;
    if v_run_id is null then continue; end if;
    begin
      v_result:=private.execute_growth_automation(v_rule,v_customer,new,v_idem,new.created_by);
      update public.automation_runs set status='completed',result=v_result,completed_at=now() where id=v_run_id;
    exception when others then
      update public.automation_runs set status='failed',error_message=left(sqlerrm,2000) where id=v_run_id;
    end;
  end loop;
  return new;
end;
$$;
revoke all on function private.process_order_completed_automations() from public,anon,authenticated;
drop trigger if exists orders_growth_automations_after_completion on public.orders;
create trigger orders_growth_automations_after_completion
after update of order_status on public.orders
for each row when (new.order_status='completed' and old.order_status is distinct from 'completed')
execute function private.process_order_completed_automations();

create or replace function public.growth_run_scheduled_automations_internal(p_store_id uuid,p_reference_date date default current_date,p_actor_user_id uuid default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_store public.stores%rowtype; v_rule public.automation_rules%rowtype; v_customer public.customers%rowtype; v_empty_order public.orders%rowtype;
  v_idem text; v_run_id uuid; v_result jsonb; v_processed integer:=0;
begin
  select * into v_store from public.stores where id=p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;
  for v_rule in select * from public.automation_rules where organization_id=v_store.organization_id and store_id=v_store.id
    and trigger_type in ('customer.inactive','customer.birthday') and active=true order by id
  loop
    for v_customer in
      select c.* from public.customers c
      where c.organization_id=v_store.organization_id and c.deleted_at is null and (
        (v_rule.trigger_type='customer.birthday' and c.birth_date is not null and extract(month from c.birth_date)=extract(month from p_reference_date) and extract(day from c.birth_date)=extract(day from p_reference_date))
        or
        (v_rule.trigger_type='customer.inactive' and not exists(
          select 1 from public.orders o where o.organization_id=c.organization_id and o.store_id=v_store.id and o.customer_id=c.id and o.order_status='completed'
            and o.created_at >= p_reference_date::timestamptz - make_interval(days=>coalesce((v_rule.conditions->>'inactive_days')::integer,30))
        ))
      )
    loop
      v_idem:='automation:'||v_rule.id::text||':customer:'||v_customer.id::text||':date:'||p_reference_date::text;
      v_run_id:=null;
      insert into public.automation_runs(organization_id,store_id,rule_id,customer_id,idempotency_key,status)
      values(v_store.organization_id,v_store.id,v_rule.id,v_customer.id,v_idem,'processing')
      on conflict(organization_id,idempotency_key) do nothing returning id into v_run_id;
      if v_run_id is null then continue; end if;
      begin
        v_result:=private.execute_growth_automation(v_rule,v_customer,v_empty_order,v_idem,p_actor_user_id);
        update public.automation_runs set status='completed',result=v_result,completed_at=now() where id=v_run_id;
        v_processed:=v_processed+1;
      exception when others then
        update public.automation_runs set status='failed',error_message=left(sqlerrm,2000) where id=v_run_id;
      end;
    end loop;
  end loop;
  return jsonb_build_object('store_id',v_store.id,'reference_date',p_reference_date,'processed',v_processed);
end;
$$;
revoke all on function public.growth_run_scheduled_automations_internal(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.growth_run_scheduled_automations_internal(uuid,date,uuid) to service_role;
