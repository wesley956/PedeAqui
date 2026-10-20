-- InfinitePay: checkout hospedado por unidade; Pix e crédito conciliados no ledger.
-- Configuração começa desativada. Nenhuma conta/credencial existente é alterada.
-- Aceita InfinitePay nas tabelas existentes, preservando RLS e índices únicos.
do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array['order_payment_provider_configs','order_payment_provider_charges','order_payment_provider_events'] loop
    for v_constraint in
      select c.conname
      from pg_constraint c
      where c.conrelid = ('public.' || v_table)::regclass
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%provider%mercado_pago%'
        and pg_get_constraintdef(c.oid) not ilike '%infinitepay%'
    loop
      execute format('alter table public.%I drop constraint %I', v_table, v_constraint);
    end loop;
    execute format('alter table public.%I drop constraint if exists %I', v_table, v_table || '_provider_known_check');
    execute format(
      'alter table public.%I add constraint %I check (provider in (''mercado_pago'',''pagbank'',''infinitepay''))',
      v_table, v_table || '_provider_known_check'
    );
  end loop;
end $$;

alter table public.order_payment_provider_charges
  add column if not exists checkout_creation_started_at timestamptz;

create or replace function public.order_payment_provider_reserve_charge_internal(
  p_payment_id uuid,
  p_provider text
) returns public.order_payment_provider_charges
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_config public.order_payment_provider_configs%rowtype;
  v_existing public.order_payment_provider_charges%rowtype;
  v_charge public.order_payment_provider_charges%rowtype;
  v_attempt integer;
  v_charge_id uuid;
begin
  if p_provider not in ('mercado_pago','pagbank','infinitepay') then raise exception 'unsupported order payment provider'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then raise exception 'payment not found'; end if;
  if v_payment.method <> 'pix' then raise exception 'online provider charge requires pix payment'; end if;
  if v_payment.status not in ('pending','authorized') then raise exception 'payment is not chargeable'; end if;

  select * into v_config
  from public.order_payment_provider_configs
  where store_id = v_payment.store_id and provider = p_provider;
  if v_config.id is null or not v_config.enabled or v_config.access_token_secret_id is null or v_config.webhook_secret_id is null then
    raise exception 'online pix provider is not configured';
  end if;

  select * into v_existing
  from public.order_payment_provider_charges
  -- Uma cobrança ativa por pagamento, de qualquer provedor: o QR Code já entregue continua valendo.
  where payment_id = v_payment.id and status in ('creating','pending')
  order by attempt desc
  limit 1;
  if v_existing.id is not null then return v_existing; end if;

  select coalesce(max(attempt),0) + 1 into v_attempt
  from public.order_payment_provider_charges
  where payment_id = v_payment.id;

  v_charge_id := gen_random_uuid();
  insert into public.order_payment_provider_charges (
    id, organization_id, store_id, order_id, payment_id, provider, attempt,
    status, amount_cents, currency, idempotency_key, external_reference
  ) values (
    v_charge_id,
    v_payment.organization_id,
    v_payment.store_id,
    v_payment.order_id,
    v_payment.id,
    p_provider,
    v_attempt,
    'creating',
    v_payment.amount_cents,
    'BRL',
    v_charge_id::text,
    'pa_payment_' || replace(v_payment.id::text, '-', '') || '_' || v_attempt::text
  ) returning * into v_charge;

  return v_charge;
end;
$$;
revoke all on function public.order_payment_provider_reserve_charge_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.order_payment_provider_reserve_charge_internal(uuid,text) to service_role;

create or replace function public.order_payment_provider_set_enabled_internal(
  p_store_id uuid,
  p_provider text,
  p_enabled boolean
) returns public.order_payment_provider_configs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_config public.order_payment_provider_configs%rowtype;
begin
  if p_provider not in ('mercado_pago','pagbank','infinitepay') then raise exception 'unsupported order payment provider'; end if;
  perform 1 from public.stores where id = p_store_id for update;
  select * into v_config
  from public.order_payment_provider_configs
  where store_id = p_store_id and provider = p_provider
  for update;
  if v_config.id is null or v_config.access_token_secret_id is null or v_config.webhook_secret_id is null then
    raise exception 'online pix provider is not configured';
  end if;
  if p_enabled and v_config.revoked_at is not null then raise exception 'provider connection is revoked'; end if;

  if p_enabled then
    update public.order_payment_provider_configs set enabled = false, updated_at = now()
    where store_id = p_store_id and provider <> p_provider and enabled;
  end if;

  update public.order_payment_provider_configs set enabled = p_enabled, updated_at = now()
  where id = v_config.id
  returning * into v_config;
  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_set_enabled_internal(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.order_payment_provider_set_enabled_internal(uuid,text,boolean) to service_role;


create or replace function public.order_payment_provider_infinitepay_configure_internal(
  p_store_id uuid, p_handle text, p_api_key text, p_webhook_secret text
) returns public.order_payment_provider_configs
language plpgsql security invoker set search_path = '' as $$
declare
  v_store public.stores%rowtype;
  v_config public.order_payment_provider_configs%rowtype;
  v_access uuid;
  v_webhook uuid;
  v_name text;
begin
  if p_handle is null or p_handle !~ '^[a-zA-Z0-9._-]{1,100}$' then raise exception 'invalid InfiniteTag'; end if;
  if p_api_key is not null and (p_api_key not like 'inchk_%' or length(p_api_key) not between 12 and 500) then raise exception 'invalid InfinitePay API key'; end if;
  if p_webhook_secret is null or length(p_webhook_secret) < 32 then raise exception 'webhook secret required'; end if;
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store.id is null then raise exception 'store not found'; end if;
  select * into v_config from public.order_payment_provider_configs
    where store_id = p_store_id and provider = 'infinitepay' for update;
  if v_config.id is not null and v_config.provider_account_id is distinct from p_handle and exists (
    select 1 from public.order_payment_provider_charges where store_id = p_store_id
      and provider = 'infinitepay' and status in ('creating','pending')
  ) then raise exception 'resolve pending InfinitePay charges before changing account'; end if;
  if v_config.id is null then
    insert into public.order_payment_provider_configs(organization_id,store_id,provider,environment,enabled,connection_mode)
      values(v_store.organization_id,p_store_id,'infinitepay','production',false,'manual') returning * into v_config;
  end if;
  v_access := v_config.access_token_secret_id;
  v_webhook := v_config.webhook_secret_id;
  if p_api_key is not null then
    v_name := 'pedeaqui_order_payment_' || p_store_id::text || '_infinitepay_api_key';
    if v_access is null then
      select vault.create_secret(p_api_key,v_name,'PedeAqui InfinitePay API key') into v_access;
    else
      perform vault.update_secret(v_access,p_api_key,v_name,'PedeAqui InfinitePay API key');
    end if;
  end if;
  if v_access is null then raise exception 'InfinitePay API key required'; end if;
  -- Preserve callback authentication for links already issued to customers.
  if v_webhook is null then
    select vault.create_secret(p_webhook_secret,'pedeaqui_order_payment_' || p_store_id::text || '_infinitepay_webhook','PedeAqui InfinitePay callback token') into v_webhook;
  end if;
  update public.order_payment_provider_configs set enabled=false, environment='production',
    connection_mode='manual', provider_account_id=p_handle, access_token_secret_id=v_access,
    webhook_secret_id=v_webhook, authorized_at=now(), revoked_at=null,
    last_health_status='unknown', last_health_checked_at=null, last_error_code=null, updated_at=now()
    where id=v_config.id returning * into v_config;
  return v_config;
end; $$;
revoke all on function public.order_payment_provider_infinitepay_configure_internal(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.order_payment_provider_infinitepay_configure_internal(uuid,text,text,text) to service_role;

create or replace function public.order_payment_provider_infinitepay_disconnect_internal(p_store_id uuid)
returns public.order_payment_provider_configs language plpgsql security invoker set search_path = '' as $$
declare v_config public.order_payment_provider_configs%rowtype;
begin
  update public.order_payment_provider_configs set enabled=false, revoked_at=now(), updated_at=now()
    where store_id=p_store_id and provider='infinitepay' returning * into v_config;
  if v_config.id is null then raise exception 'InfinitePay connection not found'; end if;
  return v_config;
end; $$;
revoke all on function public.order_payment_provider_infinitepay_disconnect_internal(uuid) from public, anon, authenticated;
grant execute on function public.order_payment_provider_infinitepay_disconnect_internal(uuid) to service_role;

-- Called ONLY after /payment_check confirms the amount and method with the store's API key.
-- One transaction updates actual method, canonical ledger, domain events and provider mirror.
create or replace function public.order_payment_provider_infinitepay_confirm_internal(
  p_charge_id uuid, p_store_id uuid, p_amount_cents bigint, p_method text,
  p_transaction_nsu text, p_invoice_slug text
) returns public.order_payment_provider_charges
language plpgsql security invoker set search_path = '' as $$
declare
  v_charge public.order_payment_provider_charges%rowtype;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reference text;
begin
  if p_method is null or p_method not in ('pix','credit_card') then raise exception 'invalid InfinitePay payment method'; end if;
  if p_transaction_nsu is null or p_transaction_nsu !~ '^[a-zA-Z0-9_-]{1,128}$'
    or p_invoice_slug is null or p_invoice_slug !~ '^[a-zA-Z0-9_-]{1,128}$' then raise exception 'invalid InfinitePay identifiers'; end if;
  v_reference := 'infinitepay:' || p_transaction_nsu;
  select * into v_charge from public.order_payment_provider_charges
    where id=p_charge_id and store_id=p_store_id and provider='infinitepay';
  if v_charge.id is null then raise exception 'InfinitePay charge not found'; end if;
  -- Same payment-first lock order as reserve/payment_confirm_internal.
  select * into v_payment from public.payments where id=v_charge.payment_id for update;
  select * into v_charge from public.order_payment_provider_charges where id=p_charge_id for update;
  if p_amount_cents is null or v_charge.amount_cents <> p_amount_cents or v_payment.amount_cents <> p_amount_cents then raise exception 'InfinitePay amount mismatch'; end if;
  if v_charge.status='paid' and v_charge.provider_payment_id is not null and v_charge.provider_payment_id <> p_transaction_nsu then raise exception 'InfinitePay transaction mismatch'; end if;
  if v_charge.provider_order_id is not null and v_charge.provider_order_id <> p_invoice_slug then raise exception 'InfinitePay invoice mismatch'; end if;
  if v_payment.status='paid' then
    if v_payment.reference is distinct from v_reference or v_payment.method <> p_method then raise exception 'payment already settled by another source'; end if;
  else
    if v_payment.status not in ('pending','authorized') or v_payment.method <> 'pix' then raise exception 'payment is not chargeable'; end if;
    select * into v_order from public.orders where id=v_charge.order_id for update;
    if v_order.order_status in ('canceled','rejected') then raise exception 'cannot confirm payment for canceled order'; end if;
    update public.payments set method=p_method, updated_at=now() where id=v_payment.id;
    -- Online checkout starts from the public Pix option; record the method actually paid.
    update public.orders set payment_method_snapshot=p_method, updated_at=now()
      where id=v_order.id and payment_method_snapshot='pix' and total_cents=p_amount_cents;
    perform public.payment_confirm_internal(v_payment.id,null,v_reference,null,'integration');
  end if;
  update public.order_payment_provider_charges set status='paid', provider_order_id=p_invoice_slug,
    provider_payment_id=p_transaction_nsu, last_reconciled_at=now(), last_error_code=null, updated_at=now()
    where id=p_charge_id returning * into v_charge;
  return v_charge;
end; $$;
revoke all on function public.order_payment_provider_infinitepay_confirm_internal(uuid,uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.order_payment_provider_infinitepay_confirm_internal(uuid,uuid,bigint,text,text,text) to service_role;
