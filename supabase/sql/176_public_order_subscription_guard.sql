create or replace function private.organization_operational_access_allowed(
  p_organization_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_grace_end timestamptz;
  v_paid boolean;
begin
  select * into v_sub
  from public.organization_subscriptions
  where organization_id=p_organization_id
  order by created_at desc
  limit 1;

  -- Legacy organizations without a subscription keep their existing operation
  -- until they are explicitly migrated into the commercial subscription model.
  if v_sub.id is null then return true; end if;

  if v_sub.access_suspended_at is not null then return false; end if;
  if v_sub.status in ('cancelled','expired') then return false; end if;

  v_paid := v_sub.payment_status in ('paid','waived');

  if v_sub.status='trialing' then
    if v_paid or v_sub.trial_ends_at is null or v_sub.trial_ends_at>p_at then return true; end if;
    v_grace_end := coalesce(
      v_sub.grace_ends_at,
      v_sub.trial_ends_at + make_interval(days => coalesce(v_sub.grace_period_days,3)::int)
    );
    return v_grace_end>p_at;
  end if;

  if v_sub.status='active' then
    if v_paid or v_sub.next_due_at is null or v_sub.next_due_at>p_at then return true; end if;
    v_grace_end := coalesce(
      v_sub.grace_ends_at,
      v_sub.next_due_at + make_interval(days => coalesce(v_sub.grace_period_days,3)::int)
    );
    return v_grace_end>p_at;
  end if;

  if v_sub.status='past_due' then
    if v_paid then return true; end if;
    v_grace_end := coalesce(
      v_sub.grace_ends_at,
      coalesce(v_sub.next_due_at,v_sub.trial_ends_at) + make_interval(days => coalesce(v_sub.grace_period_days,3)::int)
    );
    return v_grace_end is not null and v_grace_end>p_at;
  end if;

  return false;
end;
$function$;

create or replace function private.enforce_digital_order_subscription_access()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.channel='digital_menu'
     and not private.organization_operational_access_allowed(new.organization_id,now()) then
    raise exception 'subscription_operational_access_required';
  end if;
  return new;
end;
$function$;

drop trigger if exists orders_require_operational_subscription on public.orders;
create trigger orders_require_operational_subscription
before insert on public.orders
for each row
execute function private.enforce_digital_order_subscription_access();
