begin;

update public.plans
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('public_price', false, 'retired_reason', 'commercial_flow_alignment'),
    updated_at = now()
where key = 'custom';

update public.plans
set metadata = (coalesce(metadata, '{}'::jsonb) - 'founder_capacity') || jsonb_build_object('public_price', false, 'price_locked', true),
    updated_at = now()
where key = 'founders';

insert into public.platform_settings(key, category, description, value, active)
values ('commercial_trial_days', 'commercial', 'Quantidade de dias do período gratuito para novas assinaturas.', '15'::jsonb, true)
on conflict (key) do update
set category = excluded.category,
    description = excluded.description,
    value = excluded.value,
    active = true,
    updated_at = now();

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_founder_slot_check;

alter table public.organization_subscriptions
  alter column founder_slot type integer using founder_slot::integer;

alter table public.organization_subscriptions
  add constraint organization_subscriptions_founder_slot_check check (founder_slot is null or founder_slot >= 1);

create or replace function public.subscription_founder_assign_internal(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
) returns public.organization_subscriptions
language plpgsql
set search_path to ''
as $function$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_slot integer;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  perform pg_advisory_xact_lock(hashtextextended('pedeaqui:founder-slots',0));

  select * into v_sub
  from public.organization_subscriptions
  where organization_id=p_organization_id and status in ('trialing','active','past_due')
  order by created_at desc limit 1 for update;
  if v_sub.id is null then raise exception 'active subscription not found'; end if;
  if v_sub.founder_slot is not null then return v_sub; end if;

  select * into v_plan from public.plans where key='founders' and active=true;
  if v_plan.id is null then raise exception 'founders plan unavailable'; end if;

  select coalesce(max(founder_slot),0) + 1 into v_slot
  from public.organization_subscriptions;

  update public.organization_subscriptions
  set plan_id=v_plan.id,
      plan_version_id=v_plan.current_version_id,
      founder_slot=v_slot,
      agreed_price_cents=v_plan.monthly_price_cents,
      price_currency=coalesce(v_plan.currency,'BRL'),
      price_locked=true,
      price_locked_at=coalesce(price_locked_at,now()),
      price_lock_reason='Cliente Fundador do PedeAqui: preço-base protegido',
      updated_at=now()
  where id=v_sub.id returning * into v_sub;

  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(p_organization_id,p_actor_user_id,'platform.founder.assigned','organization_subscription',v_sub.id,
    jsonb_build_object('founder_slot',v_slot,'agreed_price_cents',v_sub.agreed_price_cents,'price_locked',true),trim(p_reason),trim(p_protocol));
  return v_sub;
end;
$function$;

commit;
