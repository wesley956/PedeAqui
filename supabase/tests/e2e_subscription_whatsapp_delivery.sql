-- Local isolated database only; never contacts Meta and leaves no fixtures.
begin;
insert into auth.users(id,email) values ('11950000-0000-4000-8000-000000000001','billing-test@example.invalid');
insert into public.platform_admins(user_id,role,active) values ('11950000-0000-4000-8000-000000000001','super_admin',true);
insert into public.organizations(id,name,created_by) values
 ('11950000-0000-4000-8000-000000000002','Billing test','11950000-0000-4000-8000-000000000001');
insert into public.plans(id,key,name) values ('11950000-0000-4000-8000-000000000003','billing1195','Billing Test');
insert into public.organization_subscriptions(id,organization_id,plan_id,status,idempotency_key) values
 ('11950000-0000-4000-8000-000000000004','11950000-0000-4000-8000-000000000002','11950000-0000-4000-8000-000000000003','active','billing-test-subscription');
insert into public.subscription_billing_notifications(id,organization_id,subscription_id,channel,kind,scheduled_at,idempotency_key) values
 ('11950000-0000-4000-8000-000000000005','11950000-0000-4000-8000-000000000002','11950000-0000-4000-8000-000000000004','whatsapp','reactivated',now(),'billing-test-notice');
do $$
declare v_token uuid; v_revision timestamptz; v_org uuid := '11950000-0000-4000-8000-000000000002';
 v_notice uuid := '11950000-0000-4000-8000-000000000005'; v_admin uuid := '11950000-0000-4000-8000-000000000001';
begin
  if has_function_privilege('authenticated','public.claim_subscription_whatsapp(uuid,uuid,timestamptz,timestamptz)','execute')
    or has_table_privilege('authenticated','public.subscription_whatsapp_deliveries','select') then raise exception 'browser billing grant'; end if;
  select updated_at into v_revision from public.organization_subscriptions where id='11950000-0000-4000-8000-000000000004';
  if public.claim_subscription_whatsapp(v_notice,v_org,v_revision-interval '1 day',null) is not null then raise exception 'stale contact revision claimed'; end if;
  if public.claim_subscription_whatsapp(v_notice,gen_random_uuid(),v_revision,null) is not null then raise exception 'foreign organization claimed'; end if;
  v_token := public.claim_subscription_whatsapp(v_notice,v_org,v_revision,null);
  if v_token is null then raise exception 'valid notice not claimed'; end if;
  if public.claim_subscription_whatsapp(v_notice,v_org,v_revision,null) is not null then raise exception 'duplicate claim'; end if;
  if public.finish_subscription_whatsapp(v_notice,v_org,gen_random_uuid(),'sent','wrong-message',null) then raise exception 'foreign token finished'; end if;
  if not public.finish_subscription_whatsapp(v_notice,v_org,v_token,'unknown',null,'network_outcome_unknown') then raise exception 'unknown not persisted'; end if;
  if public.reprocess_subscription_whatsapp(v_notice,v_org,v_admin,'Never repeat unknown') then raise exception 'unknown replay allowed'; end if;
  -- Separate fixture for explicit rejection, audit, replay and eventual acceptance.
  insert into public.subscription_billing_notifications(id,organization_id,subscription_id,channel,kind,scheduled_at,idempotency_key)
    select gen_random_uuid(),organization_id,subscription_id,channel,kind,scheduled_at,'billing-test-rejected' from public.subscription_billing_notifications where id=v_notice returning id into v_notice;
  v_token := public.claim_subscription_whatsapp(v_notice,v_org,v_revision,null);
  if not public.finish_subscription_whatsapp(v_notice,v_org,v_token,'rejected',null,'http_400_meta_132000') then raise exception 'rejection not persisted'; end if;
  if not public.reprocess_subscription_whatsapp(v_notice,v_org,v_admin,'Approved template corrected') then raise exception 'rejected replay failed'; end if;
  v_token := public.claim_subscription_whatsapp(v_notice,v_org,v_revision,null);
  if v_token is null then raise exception 'manual replay not claimed'; end if;
  if not public.finish_subscription_whatsapp(v_notice,v_org,v_token,'sent','wamid.synthetic',null) then raise exception 'sent not persisted'; end if;
  if public.reprocess_subscription_whatsapp(v_notice,v_org,v_admin,'Never repeat accepted') then raise exception 'sent replay allowed'; end if;
  if (select count(*) from public.subscription_whatsapp_attempts where notification_id=v_notice)<>2 then raise exception 'attempt history lost'; end if;
  if not exists(select 1 from public.platform_financial_audit where entity_id=v_notice and action='billing.whatsapp_reprocess') then raise exception 'replay audit missing'; end if;
  raise notice 'BILLING_DELIVERY_RESULT=passed';
end $$;
rollback;
