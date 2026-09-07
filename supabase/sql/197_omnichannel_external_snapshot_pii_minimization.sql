-- Omnichannel privacy minimization (#936/#937).
-- The canonical PedeAqui order aggregate already stores the customer/address/item
-- snapshots needed for operation. external_orders.last_snapshot is therefore kept
-- only as a compact reconciliation/sync snapshot, avoiding a second copy of PII.

create or replace function private.integration_minimal_external_order_snapshot(p_snapshot jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(coalesce(p_snapshot, 'null'::jsonb)) <> 'object' then '{}'::jsonb
    else jsonb_strip_nulls(jsonb_build_object(
      'provider', p_snapshot->'provider',
      'externalMerchantId', p_snapshot->'externalMerchantId',
      'externalOrderId', p_snapshot->'externalOrderId',
      'externalDisplayId', p_snapshot->'externalDisplayId',
      'orderType', p_snapshot->'orderType',
      'timing', p_snapshot->'timing',
      'createdAt', p_snapshot->'createdAt',
      'scheduledFor', p_snapshot->'scheduledFor',
      'recommendedPreparationAt', p_snapshot->'recommendedPreparationAt',
      'money', case
        when jsonb_typeof(p_snapshot->'money') = 'object' then p_snapshot->'money'
        else '{}'::jsonb
      end,
      'payments', coalesce((
        select jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'method', payment.value->'method',
            'prepaid', payment.value->'prepaid',
            'amountCents', payment.value->'amountCents',
            'providerStatus', payment.value->'providerStatus'
          ))
          order by payment.ordinality
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(p_snapshot->'payments') = 'array' then p_snapshot->'payments'
            else '[]'::jsonb
          end
        ) with ordinality as payment(value, ordinality)
      ), '[]'::jsonb),
      'paymentOwner', p_snapshot->'paymentOwner',
      'logisticsOwner', p_snapshot->'logisticsOwner',
      'pickupCode', p_snapshot->'pickupCode',
      'deliveryCode', p_snapshot->'deliveryCode',
      'itemCount', case
        when jsonb_typeof(p_snapshot->'items') = 'array' then jsonb_array_length(p_snapshot->'items')
        else 0
      end
    ))
  end
$$;

revoke all on function private.integration_minimal_external_order_snapshot(jsonb)
  from public, anon, authenticated;

create or replace function private.integration_external_order_snapshot_minimizer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.last_snapshot := private.integration_minimal_external_order_snapshot(new.last_snapshot);
  return new;
end;
$$;

revoke all on function private.integration_external_order_snapshot_minimizer()
  from public, anon, authenticated;

drop trigger if exists external_orders_minimize_snapshot_pii on public.external_orders;
create trigger external_orders_minimize_snapshot_pii
before insert or update of last_snapshot on public.external_orders
for each row execute function private.integration_external_order_snapshot_minimizer();

-- Defensive backfill for environments that may already contain external rows when
-- this migration is eventually promoted. Current production flags remain OFF.
update public.external_orders
set last_snapshot = private.integration_minimal_external_order_snapshot(last_snapshot)
where last_snapshot is distinct from private.integration_minimal_external_order_snapshot(last_snapshot);

comment on function private.integration_minimal_external_order_snapshot(jsonb) is
  'Builds a provider-neutral reconciliation snapshot without customer, address, item notes/modifier details, or arbitrary provider metadata.';
comment on trigger external_orders_minimize_snapshot_pii on public.external_orders is
  'Minimizes duplicated PII before an external order sync snapshot is persisted.';
