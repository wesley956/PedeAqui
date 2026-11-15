-- Correções de banco que a homologação local aplica e a produção ainda NÃO tem.
-- Cada item está descrito em docs/ux2/PENDENCIAS-BANCO.md. Aplicar na produção exige aprovação específica.

-- P-01: enviar rodada no Salão (e pedido por QR da mesa) falha com "permission denied for function dining_price_items".
grant execute on function private.dining_price_items(uuid, jsonb) to service_role;

-- P-04: a rodada de mesa falha com "null value in column method of relation payments". O gatilho que cria o
-- pagamento inicial do pedido perdeu, na importação omnichannel, a condição que pulava pedidos de mesa.
create or replace function private.seed_order_payment_intent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_suffix text;
begin
  -- Rodada de mesa (garçom ou QR) nasce sem forma de pagamento: é paga depois, na conta. Sem esta condição o
  -- gatilho tenta criar um pagamento com forma nula e a rodada inteira falha.
  if new.channel in ('pdv','ifood','99food','waiter','table_qr') or new.total_cents <= 0 or new.payment_method_snapshot is null then
    return new;
  end if;

  v_source := case when new.channel = 'digital_menu' then 'checkout' else 'system' end;
  v_suffix := case when new.channel = 'digital_menu' then 'checkout' else new.channel end;

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
    'order:' || new.id::text || ':' || v_suffix || ':payment:1',
    v_source,
    jsonb_build_object('seeded_from_order', true, 'channel', new.channel)
  )
  on conflict (organization_id, idempotency_key) do nothing;
  return new;
end;
$$;
