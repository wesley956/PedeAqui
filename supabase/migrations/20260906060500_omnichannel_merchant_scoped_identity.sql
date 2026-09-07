-- Omnichannel multitenant identity hardening (#936/#937).
-- Provider event/order identifiers may be merchant-scoped rather than account-global.
-- Keep structural dedupe inside the canonical tenant/store/merchant boundary.

alter table public.integration_events
  drop constraint if exists integration_events_integration_account_id_external_event_id_key;

create unique index if not exists integration_events_account_store_event_uidx
  on public.integration_events(integration_account_id, store_id, external_event_id);

alter table public.external_orders
  drop constraint if exists external_orders_integration_account_id_external_order_id_key;

create unique index if not exists external_orders_merchant_order_uidx
  on public.external_orders(integration_merchant_id, external_order_id)
  where integration_merchant_id is not null;

-- Defensive fallback for legacy/unlinked rows. Canonical imports always resolve a merchant.
create unique index if not exists external_orders_unlinked_store_order_uidx
  on public.external_orders(integration_account_id, store_id, external_order_id)
  where integration_merchant_id is null;

-- The canonical import RPC was introduced earlier in this same unpromoted OMNI chain.
-- Patch only the two identity-scope expressions in its stored PL/pgSQL body, then
-- recreate the function with the same security contract. Assertions make drift fail loud.
do $migration$
declare
  v_body text;
  v_patched text;
  v_lock_old constant text := 'pg_catalog.hashtextextended(p_integration_account_id::text || '':'' || v_external_order_id, 0)';
  v_lock_new constant text := 'pg_catalog.hashtextextended(v_merchant.id::text || '':'' || v_external_order_id, 0)';
  v_lookup_old constant text := 'where integration_account_id = p_integration_account_id' || chr(10) ||
                                '    and external_order_id = v_external_order_id';
  v_lookup_new constant text := 'where integration_merchant_id = v_merchant.id' || chr(10) ||
                                '    and external_order_id = v_external_order_id';
begin
  select p.prosrc into v_body
  from pg_catalog.pg_proc p
  where p.oid = 'public.integration_import_external_order(uuid,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;

  if v_body is null then
    raise exception 'integration_import_external_order body not found';
  end if;
  if position(v_lock_old in v_body) = 0 then
    raise exception 'merchant-scope migration could not locate advisory-lock identity expression';
  end if;
  if position(v_lookup_old in v_body) = 0 then
    raise exception 'merchant-scope migration could not locate external-order lookup expression';
  end if;

  v_patched := replace(v_body, v_lock_old, v_lock_new);
  v_patched := replace(v_patched, v_lookup_old, v_lookup_new);

  execute format(
    'create or replace function public.integration_import_external_order('
    || 'p_organization_id uuid, p_store_id uuid, p_integration_account_id uuid, '
    || 'p_external_event_id text, p_order jsonb, p_external_status text default null, '
    || 'p_external_revision text default null, p_correlation_id text default null) '
    || 'returns jsonb language plpgsql security invoker set search_path = '''' as %L',
    v_patched
  );
end;
$migration$;

revoke all on function public.integration_import_external_order(uuid,uuid,uuid,text,jsonb,text,text,text)
  from public, anon, authenticated;
grant execute on function public.integration_import_external_order(uuid,uuid,uuid,text,jsonb,text,text,text)
  to service_role;

comment on index integration_events_account_store_event_uidx is
  'Durable inbox dedupe is scoped to integration account + canonical store, allowing provider event ids reused by different merchants.';
comment on index external_orders_merchant_order_uidx is
  'External sales-order identity is merchant-scoped so equal provider order ids in different merchants never collide.';
comment on function public.integration_import_external_order(uuid,uuid,uuid,text,jsonb,text,text,text) is
  'Atomically materializes one normalized external sales-channel order; replay identity is integration merchant + external order id.';
