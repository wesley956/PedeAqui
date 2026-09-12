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
revoke all on function private.execute_growth_automation(public.automation_rules,public.customers,public.orders,text,uuid)
  from public,anon,authenticated;

create or replace function public.campaign_claim_internal(p_worker_id text,p_limit integer)
returns setof public.campaign_recipients language plpgsql security invoker set search_path='' as $$
begin
  if char_length(trim(coalesce(p_worker_id,''))) not between 8 and 180 then raise exception 'invalid worker id'; end if;
  if p_limit not between 1 and 100 then raise exception 'invalid claim limit'; end if;
  return query with ranked as (
    select cr.id,cr.store_id,
      row_number() over(partition by cr.store_id order by cr.next_attempt_at nulls first,cr.created_at) as store_position,
      greatest(s.campaign_rate_per_minute-(select count(*) from public.campaign_recipients sent where sent.store_id=cr.store_id and sent.status in ('sent','delivered','read') and sent.processed_at>=now()-interval '1 minute'),0) as available_slots
    from public.campaign_recipients cr
    join public.store_operational_settings s on s.store_id=cr.store_id and s.growth_campaigns_enabled
    where cr.status in ('queued','failed_transient') and coalesce(cr.next_attempt_at,now())<=now()
      and (cr.lease_expires_at is null or cr.lease_expires_at<now())
      and private.store_module_enabled(cr.organization_id,cr.store_id,'growth')
  ), candidates as (
    select cr.id from public.campaign_recipients cr join ranked r on r.id=cr.id
    where r.store_position<=r.available_slots
    order by cr.next_attempt_at nulls first,cr.created_at for update of cr skip locked limit p_limit
  ) update public.campaign_recipients cr set status='sending',attempts=attempts+1,lease_owner=trim(p_worker_id),lease_expires_at=now()+interval '2 minutes'
    from candidates x where cr.id=x.id returning cr.*;
end $$;
revoke all on function public.campaign_claim_internal(text,integer) from public,anon,authenticated;
grant execute on function public.campaign_claim_internal(text,integer) to service_role;
