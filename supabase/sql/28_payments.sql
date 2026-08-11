-- PedeAqui — bloco [096]–[101]
-- Ledger de pagamentos manuais e base para pagamento dividido.

insert into public.permissions (key, description) values
  ('payments.view', 'Visualizar pagamentos e conciliação de pedidos'),
  ('payments.manage', 'Criar e confirmar pagamentos manuais')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('payments.view','payments.manage')
where r.key in ('owner','manager')
on conflict do nothing;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid not null,
  method text not null check (method in ('cash','pix','credit_card','debit_card')),
  status text not null default 'pending' check (status in ('pending','authorized','paid','failed','canceled','refunded')),
  amount_cents bigint not null check (amount_cents > 0),
  cash_tendered_cents bigint check (cash_tendered_cents is null or cash_tendered_cents > 0),
  change_due_cents bigint check (change_due_cents is null or change_due_cents >= 0),
  reference text check (reference is null or char_length(reference) <= 200),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 240),
  source text not null default 'panel' check (source in ('checkout','panel','pdv','integration','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint payments_order_same_store_fk foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade,
  constraint payments_org_store_id_unique unique (organization_id, store_id, id),
  constraint payments_org_idempotency_unique unique (organization_id, idempotency_key),
  constraint payments_cash_fields check (
    (method = 'cash') or (cash_tendered_cents is null and change_due_cents is null)
  ),
  constraint payments_change_math check (
    change_due_cents is null or (cash_tendered_cents is not null and change_due_cents = cash_tendered_cents - amount_cents)
  ),
  constraint payments_timestamps check (
    (status <> 'paid' or paid_at is not null)
    and (status <> 'failed' or failed_at is not null)
    and (status <> 'canceled' or canceled_at is not null)
    and (status <> 'refunded' or refunded_at is not null)
  )
);

create index if not exists payments_order_idx on public.payments (organization_id, store_id, order_id, created_at);
create index if not exists payments_open_idx on public.payments (organization_id, store_id, order_id, status)
  where status in ('pending','authorized');
create index if not exists payments_paid_idx on public.payments (organization_id, store_id, paid_at desc)
  where status = 'paid';

alter table public.payments enable row level security;
revoke all on table public.payments from anon, authenticated;
grant select on table public.payments to authenticated;
grant select, insert, update, delete on table public.payments to service_role;

create policy payments_view on public.payments for select to authenticated
using (private.has_permission(organization_id, store_id, 'payments.view'));

create or replace function private.seed_order_payment_intent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.payments (
    organization_id, store_id, order_id, method, status, amount_cents,
    cash_tendered_cents, idempotency_key, source, metadata
  ) values (
    new.organization_id,
    new.store_id,
    new.id,
    new.payment_method_snapshot,
    'pending',
    new.total_cents,
    case when new.payment_method_snapshot = 'cash' then new.cash_change_for_cents else null end,
    'order:' || new.id::text || ':checkout:payment:1',
    'checkout',
    jsonb_build_object('seeded_from_order', true)
  )
  on conflict (organization_id, idempotency_key) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_order_payment_intent() from public, anon, authenticated;

drop trigger if exists orders_seed_payment_intent on public.orders;
create trigger orders_seed_payment_intent
after insert on public.orders
for each row execute function private.seed_order_payment_intent();

create or replace function public.payment_create_intent_internal(
  p_order_id uuid,
  p_method text,
  p_amount_cents bigint,
  p_idempotency_key text,
  p_cash_tendered_cents bigint default null,
  p_reference text default null,
  p_actor_user_id uuid default null,
  p_source text default 'panel'
) returns public.payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.payments%rowtype;
  v_payment public.payments%rowtype;
  v_reserved bigint;
begin
  if p_method not in ('cash','pix','credit_card','debit_card') then raise exception 'invalid payment method'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'invalid payment amount'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'invalid idempotency key'; end if;
  if p_source not in ('checkout','panel','pdv','integration','system') then raise exception 'invalid payment source'; end if;
  if p_method <> 'cash' and p_cash_tendered_cents is not null then raise exception 'cash tendered only applies to cash'; end if;
  if p_cash_tendered_cents is not null and p_cash_tendered_cents < p_amount_cents then raise exception 'cash tendered must cover payment amount'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.order_status in ('canceled','rejected') then raise exception 'cannot add payment to canceled order'; end if;

  select * into v_existing
  from public.payments
  where organization_id = v_order.organization_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then return v_existing; end if;

  select coalesce(sum(amount_cents),0)::bigint into v_reserved
  from public.payments
  where order_id = v_order.id and status in ('pending','authorized','paid');

  if v_reserved + p_amount_cents > v_order.total_cents then
    raise exception 'payment intents exceed order total';
  end if;

  insert into public.payments (
    organization_id, store_id, order_id, method, status, amount_cents,
    cash_tendered_cents, reference, idempotency_key, source, created_by
  ) values (
    v_order.organization_id, v_order.store_id, v_order.id, p_method, 'pending', p_amount_cents,
    p_cash_tendered_cents, nullif(trim(coalesce(p_reference,'')),''), trim(p_idempotency_key), p_source, p_actor_user_id
  ) returning * into v_payment;

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at
  ) values (
    v_order.organization_id, v_order.store_id, 'payment.created', 'payment', v_payment.id,
    jsonb_build_object('order_id', v_order.id, 'method', v_payment.method, 'amount_cents', v_payment.amount_cents),
    'pending', 0, now()
  );
  return v_payment;
end;
$$;
revoke all on function public.payment_create_intent_internal(uuid,text,bigint,text,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.payment_create_intent_internal(uuid,text,bigint,text,bigint,text,uuid,text) to service_role;

create or replace function public.payment_confirm_internal(
  p_payment_id uuid,
  p_cash_received_cents bigint default null,
  p_reference text default null,
  p_actor_user_id uuid default null,
  p_source text default 'panel'
) returns public.payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_received bigint;
  v_paid_total bigint;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then raise exception 'payment not found'; end if;
  if v_payment.status = 'paid' then return v_payment; end if;
  if v_payment.status not in ('pending','authorized') then raise exception 'payment cannot be confirmed from current status'; end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.order_status in ('canceled','rejected') then raise exception 'cannot confirm payment for canceled order'; end if;

  if v_payment.method = 'cash' then
    v_received := coalesce(p_cash_received_cents, v_payment.cash_tendered_cents, v_payment.amount_cents);
    if v_received < v_payment.amount_cents then raise exception 'cash received is below payment amount'; end if;
  elsif p_cash_received_cents is not null then
    raise exception 'cash received only applies to cash';
  end if;

  update public.payments set
    status = 'paid',
    cash_tendered_cents = case when method = 'cash' then v_received else null end,
    change_due_cents = case when method = 'cash' then v_received - amount_cents else null end,
    reference = coalesce(nullif(trim(coalesce(p_reference,'')),''), reference),
    confirmed_by = p_actor_user_id,
    paid_at = now(),
    failed_at = null,
    updated_at = now()
  where id = v_payment.id
  returning * into v_payment;

  select coalesce(sum(amount_cents),0)::bigint into v_paid_total
  from public.payments where order_id = v_order.id and status = 'paid';
  if v_paid_total > v_order.total_cents then raise exception 'paid total exceeds order total'; end if;

  if v_paid_total = v_order.total_cents and v_order.payment_status <> 'paid' then
    perform public.order_transition_internal(
      v_order.id, 'payment', 'paid', null, p_actor_user_id, p_source
    );
  end if;

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at
  ) values (
    v_order.organization_id, v_order.store_id, 'payment.paid', 'payment', v_payment.id,
    jsonb_build_object('order_id', v_order.id, 'method', v_payment.method, 'amount_cents', v_payment.amount_cents, 'paid_total_cents', v_paid_total),
    'pending', 0, now()
  );
  return v_payment;
end;
$$;
revoke all on function public.payment_confirm_internal(uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.payment_confirm_internal(uuid,bigint,text,uuid,text) to service_role;

create or replace function public.payment_fail_internal(
  p_payment_id uuid,
  p_reason text,
  p_actor_user_id uuid default null,
  p_source text default 'panel'
) returns public.payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
begin
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'failure reason is required'; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then raise exception 'payment not found'; end if;
  if v_payment.status = 'failed' then return v_payment; end if;
  if v_payment.status not in ('pending','authorized') then raise exception 'payment cannot fail from current status'; end if;

  update public.payments set
    status = 'failed', failed_at = now(), updated_at = now(),
    metadata = metadata || jsonb_build_object('failure_reason', trim(p_reason), 'failed_by', p_actor_user_id)
  where id = v_payment.id returning * into v_payment;

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at
  ) values (
    v_payment.organization_id, v_payment.store_id, 'payment.failed', 'payment', v_payment.id,
    jsonb_build_object('order_id', v_payment.order_id, 'reason', trim(p_reason)), 'pending', 0, now()
  );
  return v_payment;
end;
$$;
revoke all on function public.payment_fail_internal(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.payment_fail_internal(uuid,text,uuid,text) to service_role;
