-- PedeAqui — hotfix de compatibilidade do ledger financeiro.
-- Chamadores internos usam literais 1/-1, que o PostgreSQL resolve como integer.
-- Mantemos a implementação canônica smallint e adicionamos um overload seguro.

create or replace function private.finance_insert_transaction(
  p_organization_id uuid,
  p_store_id uuid,
  p_obligation_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_transaction_type text,
  p_direction text,
  p_effect_sign integer,
  p_amount_cents bigint,
  p_competence_date date,
  p_source_type text,
  p_source_id uuid,
  p_transfer_group_id uuid,
  p_idempotency_key text,
  p_description text,
  p_metadata jsonb,
  p_actor_user_id uuid,
  p_occurred_at timestamptz default now()
) returns public.financial_transactions
language sql
security invoker
set search_path = ''
as $$
  select private.finance_insert_transaction(
    p_organization_id,
    p_store_id,
    p_obligation_id,
    p_account_id,
    p_category_id,
    p_transaction_type,
    p_direction,
    p_effect_sign::smallint,
    p_amount_cents,
    p_competence_date,
    p_source_type,
    p_source_id,
    p_transfer_group_id,
    p_idempotency_key,
    p_description,
    p_metadata,
    p_actor_user_id,
    p_occurred_at
  );
$$;

revoke all on function private.finance_insert_transaction(uuid,uuid,uuid,uuid,uuid,text,text,integer,bigint,date,text,uuid,uuid,text,text,jsonb,uuid,timestamptz) from public, anon, authenticated;
grant execute on function private.finance_insert_transaction(uuid,uuid,uuid,uuid,uuid,text,text,integer,bigint,date,text,uuid,uuid,text,text,jsonb,uuid,timestamptz) to service_role;
