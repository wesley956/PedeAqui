-- PedeAqui — guard global: pedido só pode ficar `paid` quando o ledger cobre exatamente o total.

create or replace function private.enforce_order_paid_ledger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_paid_total bigint;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from new.payment_status then
    select coalesce(sum(p.amount_cents), 0)::bigint
      into v_paid_total
    from public.payments p
    where p.organization_id = new.organization_id
      and p.store_id = new.store_id
      and p.order_id = new.id
      and p.status = 'paid';

    if v_paid_total <> new.total_cents then
      raise exception 'payment ledger must equal order total before marking order paid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_order_paid_ledger() from public, anon, authenticated;

drop trigger if exists orders_payment_paid_ledger_guard on public.orders;
create trigger orders_payment_paid_ledger_guard
before update of payment_status on public.orders
for each row execute function private.enforce_order_paid_ledger();
