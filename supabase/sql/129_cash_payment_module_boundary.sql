-- PedeAqui — hotfix de fronteira entre Pagamentos e Caixa
-- O método de pagamento "dinheiro" pertence ao pedido e deve funcionar mesmo quando
-- o módulo opcional de gestão de Caixa estiver desativado.
--
-- Regras:
-- 1. Pagamento em dinheiro + módulo Caixa ativo: mantém a integração atual e exige sessão aberta.
-- 2. Pagamento em dinheiro + módulo Caixa inativo/ausente: liquida somente o ledger de pagamentos,
--    sem exigir sessão e sem criar cash_movement.
-- 3. Estorno só gera movimento de Caixa quando a venda original já foi registrada no Caixa.
--    Isso preserva pagamentos históricos confirmados enquanto o módulo estava desligado.

create or replace function private.sync_cash_payment_movement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_original public.cash_movements%rowtype;
  v_actor uuid;
  v_cash_enabled boolean := false;
begin
  if new.method <> 'cash' then return new; end if;

  select coalesce(sm.enabled, false)
    into v_cash_enabled
  from public.store_modules sm
  where sm.store_id = new.store_id
    and sm.module_key = 'cash';

  v_cash_enabled := coalesce(v_cash_enabled, false);

  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      -- Sem módulo Caixa, o pagamento continua sendo uma operação válida do ledger do pedido.
      if not v_cash_enabled then return new; end if;

      v_actor := new.confirmed_by;
      v_session_id := private.cash_open_session_for_actor(new.store_id, v_actor);
      perform private.cash_insert_movement(
        v_session_id, 'sale', 'in', new.amount_cents,
        'payment:' || new.id::text || ':cash:paid',
        'Venda em dinheiro', new.id, new.order_id, null, v_actor,
        jsonb_build_object('source', 'payment', 'payment_source', new.source)
      );
    elsif new.status = 'refunded' then
      raise exception 'cash payment cannot be inserted already refunded';
    end if;
    return new;
  end if;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    -- A gestão física do caixa é opcional. Não transforme sua ausência em bloqueio de pedido.
    if not v_cash_enabled then return new; end if;

    v_actor := new.confirmed_by;
    v_session_id := private.cash_open_session_for_actor(new.store_id, v_actor);
    perform private.cash_insert_movement(
      v_session_id, 'sale', 'in', new.amount_cents,
      'payment:' || new.id::text || ':cash:paid',
      'Venda em dinheiro', new.id, new.order_id, null, v_actor,
      jsonb_build_object('source', 'payment', 'payment_source', new.source)
    );
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    -- Primeiro descubra se esta venda chegou a participar do módulo Caixa.
    -- Se nunca houve movimento de venda, não invente um movimento de estorno agora.
    select * into v_original
    from public.cash_movements
    where payment_id = new.id
      and movement_type = 'sale'
    order by created_at asc
    limit 1;

    if v_original.id is null then return new; end if;

    begin
      v_actor := nullif(new.metadata->>'refunded_by', '')::uuid;
    exception when invalid_text_representation then
      v_actor := null;
    end;

    -- Se a venda foi gerenciada pelo Caixa, preserve a integridade do caixa físico no estorno.
    v_session_id := private.cash_open_session_for_actor(new.store_id, v_actor);
    perform private.cash_insert_movement(
      v_session_id, 'refund', 'out', new.amount_cents,
      'payment:' || new.id::text || ':cash:refunded',
      coalesce(nullif(new.metadata->>'refund_reason', ''), 'Estorno em dinheiro'),
      new.id, new.order_id, v_original.id, v_actor,
      jsonb_build_object('source', 'payment_refund', 'original_cash_session_id', v_original.cash_session_id)
    );
  end if;

  return new;
end;
$$;

revoke all on function private.sync_cash_payment_movement() from public, anon, authenticated;
