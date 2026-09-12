-- PedeAqui — #1022 Benefícios canônicos no robô e automações de relacionamento seguras.

create or replace function private.cashback_available_balance(
  p_organization_id uuid,p_store_id uuid,p_customer_id uuid,p_at timestamptz default now()
) returns bigint
language sql stable security invoker set search_path='' as $$
  with account as (
    select a.id,a.balance_cents from public.cashback_accounts a
    where a.organization_id=p_organization_id and a.store_id=p_store_id and a.customer_id=p_customer_id
  ), ledger as (
    select t.id,t.transaction_type,t.amount_cents,t.expires_at,t.created_at,
      coalesce(sum(greatest(t.amount_cents,0)) over(partition by t.account_id order by t.created_at,t.id rows between unbounded preceding and 1 preceding),0)::bigint prior_positive,
      sum(greatest(-t.amount_cents,0)) over(partition by t.account_id)::bigint total_negative
    from public.cashback_transactions t join account a on a.id=t.account_id
    where t.created_at<=p_at
  ), expired_remaining as (
    select coalesce(sum(greatest(0,amount_cents-least(amount_cents,greatest(0,total_negative-prior_positive)))),0)::bigint amount
    from ledger where transaction_type='earn' and amount_cents>0 and expires_at is not null and expires_at<=p_at
  )
  select greatest(0,coalesce(a.balance_cents,0)-least(coalesce(a.balance_cents,0),e.amount))::bigint
  from (select 1) seed left join account a on true left join expired_remaining e on true;
$$;
revoke all on function private.cashback_available_balance(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.cashback_available_balance(uuid,uuid,uuid,timestamptz) to service_role;

create or replace function public.growth_customer_available_balances_internal(p_store_id uuid,p_customer_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_store public.stores%rowtype; v_points bigint:=0;
begin
  select * into v_store from public.stores where id=p_store_id and status='active';
  if v_store.id is null or not exists(select 1 from public.customers c where c.id=p_customer_id and c.organization_id=v_store.organization_id and c.deleted_at is null) then raise exception 'customer unavailable'; end if;
  select coalesce(balance_points,0) into v_points from public.loyalty_accounts where organization_id=v_store.organization_id and store_id=v_store.id and customer_id=p_customer_id;
  return jsonb_build_object('cashback_balance_cents',private.cashback_available_balance(v_store.organization_id,v_store.id,p_customer_id,now()),'loyalty_balance_points',coalesce(v_points,0));
end $$;
revoke all on function public.growth_customer_available_balances_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.growth_customer_available_balances_internal(uuid,uuid) to service_role;

create or replace function private.resolve_growth_benefits(
  p_organization_id uuid,p_store_id uuid,p_customer_id uuid,p_channel text,p_subtotal_cents bigint,
  p_coupon_id uuid default null,p_coupon_code text default null,p_cashback_requested_cents bigint default 0,p_loyalty_requested_points bigint default 0
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_coupon public.coupons%rowtype; v_settings public.store_growth_settings%rowtype;
  v_cashback public.cashback_accounts%rowtype; v_loyalty public.loyalty_accounts%rowtype;
  v_coupon_discount bigint:=0; v_cashback_discount bigint:=0; v_loyalty_discount bigint:=0;
  v_total_uses bigint:=0; v_customer_uses bigint:=0; v_remaining bigint; v_available_cashback bigint:=0;
begin
  if p_subtotal_cents is null or p_subtotal_cents<0 then raise exception 'invalid growth subtotal'; end if;
  if p_cashback_requested_cents<0 or p_loyalty_requested_points<0 then raise exception 'invalid benefit request'; end if;
  select * into v_settings from public.store_growth_settings where organization_id=p_organization_id and store_id=p_store_id;

  if p_coupon_id is not null or nullif(trim(coalesce(p_coupon_code,'')),'') is not null then
    select * into v_coupon from public.coupons c where c.organization_id=p_organization_id and c.store_id=p_store_id and c.deleted_at is null
      and ((p_coupon_id is not null and c.id=p_coupon_id) or (p_coupon_id is null and lower(c.code)=lower(trim(p_coupon_code)))) for update;
    if v_coupon.id is null then raise exception 'coupon not found'; end if;
    if not v_coupon.active then raise exception 'coupon inactive'; end if;
    if v_coupon.valid_from>now() or (v_coupon.valid_until is not null and v_coupon.valid_until<=now()) then raise exception 'coupon outside validity window'; end if;
    if not (p_channel=any(v_coupon.allowed_channels)) then raise exception 'coupon unavailable for channel'; end if;
    if p_subtotal_cents<v_coupon.minimum_order_cents then raise exception 'coupon minimum order not reached'; end if;
    select count(*)::bigint into v_total_uses from public.coupon_redemptions r where r.organization_id=p_organization_id and r.store_id=p_store_id and r.coupon_id=v_coupon.id and r.status in ('reserved','consumed');
    if v_coupon.usage_limit_total is not null and v_total_uses>=v_coupon.usage_limit_total then raise exception 'coupon usage limit reached'; end if;
    if v_coupon.usage_limit_per_customer is not null then
      if p_customer_id is null then raise exception 'customer identification required for coupon'; end if;
      select count(*)::bigint into v_customer_uses from public.coupon_redemptions r where r.organization_id=p_organization_id and r.customer_id=p_customer_id and r.coupon_id=v_coupon.id and r.status in ('reserved','consumed');
      if v_customer_uses>=v_coupon.usage_limit_per_customer then raise exception 'customer coupon usage limit reached'; end if;
    end if;
    if v_coupon.discount_type='fixed' then v_coupon_discount:=least(v_coupon.fixed_discount_cents,p_subtotal_cents);
    else
      v_coupon_discount:=floor(p_subtotal_cents::numeric*v_coupon.percentage_bps::numeric/10000)::bigint;
      if v_coupon.max_discount_cents is not null then v_coupon_discount:=least(v_coupon_discount,v_coupon.max_discount_cents); end if;
      v_coupon_discount:=least(v_coupon_discount,p_subtotal_cents);
    end if;
  end if;

  v_remaining:=greatest(0,p_subtotal_cents-v_coupon_discount);
  if p_cashback_requested_cents>0 then
    if p_customer_id is null then raise exception 'customer identification required for cashback'; end if;
    if v_settings.store_id is null or not v_settings.cashback_enabled then raise exception 'cashback redemption disabled'; end if;
    select * into v_cashback from public.cashback_accounts where organization_id=p_organization_id and store_id=p_store_id and customer_id=p_customer_id for update;
    v_available_cashback:=private.cashback_available_balance(p_organization_id,p_store_id,p_customer_id,now());
    if v_cashback.id is null or v_available_cashback<p_cashback_requested_cents then raise exception 'insufficient cashback balance'; end if;
    if p_cashback_requested_cents>v_remaining then raise exception 'cashback exceeds merchandise balance'; end if;
    v_cashback_discount:=p_cashback_requested_cents;
  end if;
  v_remaining:=greatest(0,v_remaining-v_cashback_discount);
  if p_loyalty_requested_points>0 then
    if p_customer_id is null then raise exception 'customer identification required for loyalty'; end if;
    if v_settings.store_id is null or not v_settings.loyalty_enabled then raise exception 'loyalty redemption disabled'; end if;
    select * into v_loyalty from public.loyalty_accounts where organization_id=p_organization_id and store_id=p_store_id and customer_id=p_customer_id for update;
    if v_loyalty.id is null or v_loyalty.balance_points<p_loyalty_requested_points then raise exception 'insufficient loyalty balance'; end if;
    v_loyalty_discount:=p_loyalty_requested_points*v_settings.loyalty_redeem_cents_per_point::bigint;
    if v_loyalty_discount>v_remaining then raise exception 'loyalty redemption exceeds merchandise balance'; end if;
  end if;
  return jsonb_build_object('coupon_id',v_coupon.id,'coupon_code',case when v_coupon.id is null then null else v_coupon.code end,
    'coupon_discount_cents',v_coupon_discount,'cashback_discount_cents',v_cashback_discount,'loyalty_redeemed_points',p_loyalty_requested_points,
    'loyalty_discount_cents',v_loyalty_discount,'discount_cents',v_coupon_discount+v_cashback_discount+v_loyalty_discount);
end $$;
revoke all on function private.resolve_growth_benefits(uuid,uuid,uuid,text,bigint,uuid,text,bigint,bigint) from public,anon,authenticated;
grant execute on function private.resolve_growth_benefits(uuid,uuid,uuid,text,bigint,uuid,text,bigint,bigint) to service_role;

create or replace function public.growth_expire_due_cashback_internal(p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_account record; v_due bigint; v_tx jsonb; v_processed integer:=0; v_total bigint:=0;
begin
  if p_limit not between 1 and 500 then raise exception 'invalid cashback expiry limit'; end if;
  for v_account in
    select a.* from public.cashback_accounts a where a.balance_cents>0 and exists(
      select 1 from public.cashback_transactions t where t.account_id=a.id and t.transaction_type='earn' and t.expires_at is not null and t.expires_at<=now()
    ) order by a.updated_at,a.id for update skip locked limit p_limit
  loop
    v_due:=greatest(0,v_account.balance_cents-private.cashback_available_balance(v_account.organization_id,v_account.store_id,v_account.customer_id,now()));
    if v_due<=0 then continue; end if;
    v_tx:=to_jsonb(private.post_cashback_transaction(v_account.organization_id,v_account.store_id,v_account.customer_id,null,'expire',-v_due,
      'cashback:expiry:'||v_account.id::text||':'||current_date::text,null,jsonb_build_object('source','scheduled_expiry','message_class','operational'),null));
    v_processed:=v_processed+1; v_total:=v_total+v_due;
  end loop;
  return jsonb_build_object('accounts_processed',v_processed,'expired_cents',v_total);
end $$;
revoke all on function public.growth_expire_due_cashback_internal(integer) from public,anon,authenticated;
grant execute on function public.growth_expire_due_cashback_internal(integer) to service_role;

create or replace function public.growth_customer_benefits_internal(
  p_store_id uuid,
  p_customer_id uuid,
  p_contact_id uuid,
  p_channel text default 'digital_menu',
  p_subtotal_cents bigint default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_store public.stores%rowtype;
  v_customer public.customers%rowtype;
  v_settings public.store_growth_settings%rowtype;
  v_coupon public.coupons%rowtype;
  v_resolved jsonb;
  v_coupons jsonb := '[]'::jsonb;
  v_cashback bigint := 0;
  v_points bigint := 0;
begin
  if p_channel not in ('digital_menu','pdv','counter','waiter','table_qr','manual') then
    raise exception 'invalid benefit channel';
  end if;
  if p_subtotal_cents is not null and p_subtotal_cents < 0 then raise exception 'invalid subtotal'; end if;

  select * into v_store from public.stores where id=p_store_id and status='active';
  if v_store.id is null then raise exception 'store unavailable'; end if;
  select * into v_customer from public.customers
  where id=p_customer_id and organization_id=v_store.organization_id and deleted_at is null;
  if v_customer.id is null then raise exception 'customer unavailable for store organization'; end if;
  if not exists(
    select 1 from public.contacts ct
    where ct.id=p_contact_id and ct.organization_id=v_store.organization_id
      and ct.store_id=v_store.id and ct.customer_id=v_customer.id
  ) then raise exception 'conversation contact is not linked to customer'; end if;

  if not private.store_module_enabled(v_store.organization_id,v_store.id,'growth') then
    return jsonb_build_object('identified',true,'available',false,'reason','growth_disabled','coupons','[]'::jsonb);
  end if;

  select * into v_settings from public.store_growth_settings
  where organization_id=v_store.organization_id and store_id=v_store.id;
  if coalesce(v_settings.cashback_enabled,false) then
    v_cashback:=private.cashback_available_balance(v_store.organization_id,v_store.id,v_customer.id,now());
  end if;
  if coalesce(v_settings.loyalty_enabled,false) then
    select coalesce(balance_points,0) into v_points from public.loyalty_accounts
    where organization_id=v_store.organization_id and store_id=v_store.id and customer_id=v_customer.id;
  end if;

  for v_coupon in
    select c.* from public.coupons c
    where c.organization_id=v_store.organization_id and c.store_id=v_store.id
      and c.deleted_at is null and c.active
      and c.valid_from<=now() and (c.valid_until is null or c.valid_until>now())
      and p_channel=any(c.allowed_channels)
    order by c.valid_until nulls last,c.created_at,c.id
  loop
    begin
      -- O mesmo resolvedor transacional do checkout decide validade, canal,
      -- limites total/cliente, pedido mínimo e valor do desconto.
      v_resolved:=private.resolve_growth_benefits(
        v_store.organization_id,v_store.id,v_customer.id,p_channel,
        coalesce(p_subtotal_cents,v_coupon.minimum_order_cents),v_coupon.id,null,0,0
      );
      v_coupons:=v_coupons||jsonb_build_array(jsonb_build_object(
        'id',v_coupon.id,'code',v_coupon.code,'name',v_coupon.name,
        'discount_type',v_coupon.discount_type,
        'fixed_discount_cents',v_coupon.fixed_discount_cents,
        'percentage_bps',v_coupon.percentage_bps,
        'max_discount_cents',v_coupon.max_discount_cents,
        'minimum_order_cents',v_coupon.minimum_order_cents,
        'valid_until',v_coupon.valid_until,
        'eligible_for_subtotal',p_subtotal_cents is not null,
        'discount_cents',case when p_subtotal_cents is null then null else (v_resolved->>'coupon_discount_cents')::bigint end
      ));
    exception when others then
      continue;
    end;
  end loop;

  return jsonb_build_object(
    'identified',true,'available',true,'customer_id',v_customer.id,
    'cashback_enabled',coalesce(v_settings.cashback_enabled,false),
    'cashback_balance_cents',coalesce(v_cashback,0),
    'loyalty_enabled',coalesce(v_settings.loyalty_enabled,false),
    'loyalty_balance_points',coalesce(v_points,0),
    'loyalty_redeem_cents_per_point',coalesce(v_settings.loyalty_redeem_cents_per_point,1),
    'coupons',v_coupons,'evaluated_at',now()
  );
end $$;
revoke all on function public.growth_customer_benefits_internal(uuid,uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.growth_customer_benefits_internal(uuid,uuid,uuid,text,bigint) to service_role;

-- Campanhas disparadas por automações são sempre marketing: exigem consentimento,
-- template aprovado, snapshot próprio e passam pela mesma fila/anti-spam da #1021.
create or replace function private.execute_growth_automation(
  p_rule public.automation_rules,
  p_customer public.customers,
  p_order public.orders,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_amount bigint; v_points bigint; v_tx jsonb;
  v_campaign public.campaigns%rowtype; v_occurrence_id uuid; v_inserted integer:=0;
  v_preference text; v_phone text;
begin
  if not private.store_module_enabled(p_rule.organization_id,p_rule.store_id,'growth') then
    return jsonb_build_object('skipped','module_disabled');
  end if;

  if p_rule.action_type='bonus_cashback' then
    v_amount:=coalesce((p_rule.action_config->>'amount_cents')::bigint,0);
    if v_amount<=0 and p_order.id is not null then
      v_amount:=floor(greatest(0,p_order.subtotal_cents-p_order.discount_cents)::numeric*coalesce((p_rule.action_config->>'rate_bps')::integer,0)/10000)::bigint;
    end if;
    if v_amount<=0 then return jsonb_build_object('skipped','zero_bonus'); end if;
    v_tx:=to_jsonb(private.post_cashback_transaction(p_rule.organization_id,p_rule.store_id,p_customer.id,p_order.id,'earn',v_amount,
      p_idempotency_key||':cashback',null,jsonb_build_object('automation_rule_id',p_rule.id,'message_class','operational'),p_actor_user_id));
    return jsonb_build_object('cashback_cents',v_amount,'transaction_id',v_tx->>'id','message_class','operational','notification_enqueued',false);
  elsif p_rule.action_type='bonus_points' then
    v_points:=coalesce((p_rule.action_config->>'points')::bigint,0);
    if v_points<=0 then return jsonb_build_object('skipped','zero_bonus'); end if;
    v_tx:=to_jsonb(private.post_loyalty_transaction(p_rule.organization_id,p_rule.store_id,p_customer.id,p_order.id,'earn',v_points,
      p_idempotency_key||':points',null,jsonb_build_object('automation_rule_id',p_rule.id,'message_class','operational'),p_actor_user_id));
    return jsonb_build_object('points',v_points,'transaction_id',v_tx->>'id','message_class','operational','notification_enqueued',false);
  end if;

  select * into v_campaign from public.campaigns
  where id=nullif(p_rule.action_config->>'campaign_id','')::uuid
    and organization_id=p_rule.organization_id and store_id=p_rule.store_id
  for update;
  if v_campaign.id is null or v_campaign.status in ('completed','partially_failed','canceled') then raise exception 'automation campaign unavailable'; end if;
  if v_campaign.channel<>'whatsapp' or nullif(trim(v_campaign.template_name),'') is null then raise exception 'approved WhatsApp template is required'; end if;

  select status into v_preference from public.customer_marketing_preferences
  where organization_id=p_rule.organization_id and store_id=p_rule.store_id and customer_id=p_customer.id and channel='whatsapp';
  select phone_normalized into v_phone from public.customers
  where organization_id=p_rule.organization_id and id=p_customer.id and deleted_at is null;
  if v_preference is distinct from 'consented' then return jsonb_build_object('skipped','marketing_consent_required','message_class','marketing'); end if;
  if not coalesce(v_phone~'^[0-9]{8,20}$',false) then return jsonb_build_object('skipped','invalid_contact','message_class','marketing'); end if;
  if not exists(select 1 from public.orders o where o.organization_id=p_rule.organization_id and o.store_id=p_rule.store_id and o.customer_id=p_customer.id and o.order_status='completed') then
    return jsonb_build_object('skipped','store_customer_relationship_required','message_class','marketing');
  end if;

  insert into public.campaign_occurrences(
    organization_id,store_id,campaign_id,occurrence_key,scheduled_for,content_version,
    content_snapshot,template_name_snapshot,template_language_snapshot,template_data_snapshot,
    status,member_count,eligible_count,excluded_count,started_at
  ) values(
    p_rule.organization_id,p_rule.store_id,v_campaign.id,'automation:'||md5(p_idempotency_key),now(),v_campaign.content_version,
    v_campaign.content,v_campaign.template_name,v_campaign.template_language,v_campaign.template_data,
    'running',1,1,0,now()
  ) on conflict(campaign_id,occurrence_key) do update set occurrence_key=excluded.occurrence_key
  returning id into v_occurrence_id;

  insert into public.campaign_recipients(
    organization_id,store_id,campaign_id,occurrence_id,customer_id,customer_name_snapshot,
    phone_snapshot,email_snapshot,status,metadata,idempotency_key,next_attempt_at
  ) values(
    p_rule.organization_id,p_rule.store_id,v_campaign.id,v_occurrence_id,p_customer.id,p_customer.name,
    v_phone,p_customer.email,'queued',jsonb_build_object('snapshot_source','automation','automation_rule_id',p_rule.id,'message_class','marketing'),
    p_idempotency_key||':campaign:'||v_campaign.id::text,now()
  ) on conflict(occurrence_id,customer_id) where occurrence_id is not null do nothing;
  get diagnostics v_inserted=row_count;

  if v_campaign.status='draft' then
    update public.campaigns set status='running',started_at=coalesce(started_at,now()),updated_at=now() where id=v_campaign.id;
  end if;
  return jsonb_build_object('campaign_id',v_campaign.id,'customer_id',p_customer.id,'occurrence_id',v_occurrence_id,
    'recipient_enqueued',v_inserted=1,'message_class','marketing');
end $$;
revoke all on function private.execute_growth_automation(public.automation_rules,public.customers,public.orders,text,uuid) from public,anon,authenticated;
grant execute on function private.execute_growth_automation(public.automation_rules,public.customers,public.orders,text,uuid) to service_role;

-- Aniversário roda uma vez por ano. Inatividade roda uma vez por período sem compra,
-- usando o último pedido como identidade do evento (não concede bônus todos os dias).
create or replace function public.growth_run_scheduled_automations_internal(
  p_store_id uuid,p_reference_date date default current_date,p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_store public.stores%rowtype; v_rule public.automation_rules%rowtype; v_customer public.customers%rowtype; v_empty_order public.orders%rowtype;
  v_idem text; v_run_id uuid; v_result jsonb; v_processed integer:=0; v_last_order_id uuid;
begin
  select * into v_store from public.stores where id=p_store_id and status='active';
  if v_store.id is null then raise exception 'store not found'; end if;
  if not private.store_module_enabled(v_store.organization_id,v_store.id,'growth') then
    return jsonb_build_object('store_id',v_store.id,'processed',0,'skipped','module_disabled');
  end if;
  for v_rule in select * from public.automation_rules where organization_id=v_store.organization_id and store_id=v_store.id
    and trigger_type in ('customer.inactive','customer.birthday') and active=true order by id
  loop
    for v_customer in
      select c.* from public.customers c
      where c.organization_id=v_store.organization_id and c.deleted_at is null and (
        (v_rule.trigger_type='customer.birthday' and c.birth_date is not null and extract(month from c.birth_date)=extract(month from p_reference_date) and extract(day from c.birth_date)=extract(day from p_reference_date))
        or
        (v_rule.trigger_type='customer.inactive' and exists(
          select 1 from public.orders previous where previous.organization_id=c.organization_id and previous.store_id=v_store.id and previous.customer_id=c.id and previous.order_status='completed'
        ) and not exists(
          select 1 from public.orders recent where recent.organization_id=c.organization_id and recent.store_id=v_store.id and recent.customer_id=c.id and recent.order_status='completed'
            and recent.created_at>=p_reference_date::timestamptz-make_interval(days=>coalesce((v_rule.conditions->>'inactive_days')::integer,30))
        ))
      )
    loop
      if v_rule.trigger_type='customer.birthday' then
        v_idem:='automation:'||v_rule.id::text||':customer:'||v_customer.id::text||':birthday:'||extract(year from p_reference_date)::integer::text;
      else
        select o.id into v_last_order_id from public.orders o
        where o.organization_id=v_store.organization_id and o.store_id=v_store.id and o.customer_id=v_customer.id and o.order_status='completed'
        order by o.created_at desc,o.id desc limit 1;
        v_idem:='automation:'||v_rule.id::text||':customer:'||v_customer.id::text||':inactive-after:'||v_last_order_id::text;
      end if;
      v_run_id:=null;
      insert into public.automation_runs(organization_id,store_id,rule_id,customer_id,idempotency_key,status)
      values(v_store.organization_id,v_store.id,v_rule.id,v_customer.id,v_idem,'processing')
      on conflict(organization_id,idempotency_key) do nothing returning id into v_run_id;
      if v_run_id is null then continue; end if;
      begin
        v_result:=private.execute_growth_automation(v_rule,v_customer,v_empty_order,v_idem,p_actor_user_id);
        update public.automation_runs set status=case when v_result?'skipped' then 'skipped' else 'completed' end,
          result=v_result,completed_at=now() where id=v_run_id;
        v_processed:=v_processed+1;
      exception when others then
        update public.automation_runs set status='failed',error_message=left(sqlerrm,2000),completed_at=now() where id=v_run_id;
      end;
    end loop;
  end loop;
  return jsonb_build_object('store_id',v_store.id,'reference_date',p_reference_date,'processed',v_processed);
end $$;
revoke all on function public.growth_run_scheduled_automations_internal(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.growth_run_scheduled_automations_internal(uuid,date,uuid) to service_role;

alter table public.store_operational_settings
  add column if not exists relationship_automations_checked_at timestamptz;

create or replace function public.growth_run_due_relationship_automations_internal(p_limit integer default 50)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_store record; v_result jsonb; v_results jsonb:='[]'::jsonb; v_processed integer:=0; v_failed integer:=0;
begin
  if p_limit not between 1 and 100 then raise exception 'invalid automation store limit'; end if;
  for v_store in
    select s.id,coalesce(s.timezone,'America/Sao_Paulo') timezone from public.stores s
    join public.store_operational_settings os on os.organization_id=s.organization_id and os.store_id=s.id
    where s.status='active' and private.store_module_enabled(s.organization_id,s.id,'growth')
      and exists(select 1 from public.automation_rules r where r.organization_id=s.organization_id and r.store_id=s.id and r.active and r.trigger_type in ('customer.inactive','customer.birthday'))
      and pg_try_advisory_xact_lock(hashtextextended('growth-relationships:'||s.id::text,0))
    order by os.relationship_automations_checked_at nulls first,s.id limit p_limit
  loop
    begin
      v_result:=public.growth_run_scheduled_automations_internal(v_store.id,(now() at time zone v_store.timezone)::date,null);
      v_results:=v_results||jsonb_build_array(v_result); v_processed:=v_processed+1;
    exception when others then
      v_results:=v_results||jsonb_build_array(jsonb_build_object('store_id',v_store.id,'error',left(sqlerrm,300)));
      v_failed:=v_failed+1;
    end;
    update public.store_operational_settings set relationship_automations_checked_at=now() where store_id=v_store.id;
  end loop;
  return jsonb_build_object('stores_processed',v_processed,'stores_failed',v_failed,'results',v_results);
end $$;
revoke all on function public.growth_run_due_relationship_automations_internal(integer) from public,anon,authenticated;
grant execute on function public.growth_run_due_relationship_automations_internal(integer) to service_role;

-- Uma campanha usada como modelo por automação permanece reutilizável após cada
-- ocorrência. Campanhas pontuais continuam encerrando normalmente.
create or replace function public.campaign_finish_internal(
  p_recipient_id uuid,p_worker_id text,p_status text,p_provider_message_id text,p_error_code text,p_reason text,p_retry_after_seconds integer
) returns void language plpgsql security invoker set search_path='' as $$
declare v_row public.campaign_recipients%rowtype; v_remaining integer; v_failed boolean;
begin
  if p_status not in ('sent','delivered','read','failed_transient','failed_permanent','skipped_opt_out','skipped_invalid_contact') then raise exception 'invalid campaign recipient result'; end if;
  select * into v_row from public.campaign_recipients where id=p_recipient_id for update;
  if v_row.id is null or v_row.lease_owner is distinct from trim(p_worker_id) then raise exception 'campaign recipient lease mismatch'; end if;
  update public.campaign_recipients set status=p_status,provider_message_id=p_provider_message_id,last_error_code=p_error_code,reason=left(p_reason,500),
    next_attempt_at=case when p_status='failed_transient' and attempts<5 then now()+make_interval(secs=>greatest(coalesce(p_retry_after_seconds,60),30)) else null end,
    processed_at=case when p_status='failed_transient' and attempts<5 then null else now() end,lease_owner=null,lease_expires_at=null where id=v_row.id;
  if p_status='failed_transient' and v_row.attempts>=5 then update public.campaign_recipients set status='failed_permanent',processed_at=now() where id=v_row.id; end if;
  select count(*) into v_remaining from public.campaign_recipients where coalesce(occurrence_id,v_row.campaign_id)=coalesce(v_row.occurrence_id,v_row.campaign_id) and status in ('queued','sending','failed_transient');
  select exists(select 1 from public.campaign_recipients where coalesce(occurrence_id,v_row.campaign_id)=coalesce(v_row.occurrence_id,v_row.campaign_id) and status='failed_permanent') into v_failed;
  if v_remaining=0 then
    if v_row.occurrence_id is not null then update public.campaign_occurrences set status=case when coalesce(v_failed,false) then 'partially_failed' else 'completed' end,completed_at=now() where id=v_row.occurrence_id; end if;
    update public.campaigns c set status=case when exists(select 1 from public.campaign_recipients x where x.campaign_id=c.id and x.status='failed_permanent') then 'partially_failed' else 'completed' end,completed_at=now(),updated_at=now()
    where c.id=v_row.campaign_id and c.status<>'canceled' and c.next_run_at is null
      and not exists(select 1 from public.automation_rules r where r.organization_id=c.organization_id and r.store_id=c.store_id and r.active and r.action_type='campaign' and r.action_config->>'campaign_id'=c.id::text);
  end if;
end $$;
revoke all on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.campaign_finish_internal(uuid,text,text,text,text,text,integer) to service_role;
