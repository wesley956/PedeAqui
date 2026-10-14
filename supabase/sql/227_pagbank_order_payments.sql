-- PedeAqui — PagBank como segundo provedor de Pix online do pedido
-- Migração aditiva: o Mercado Pago continua igual. A loja pode ter os dois
-- conectados, mas só um provedor fica ativo por vez.

-- 1. Aceita 'pagbank' nas tabelas de configuração, cobrança e eventos.
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
        and pg_get_constraintdef(c.oid) not ilike '%pagbank%'
    loop
      execute format('alter table public.%I drop constraint %I', v_table, v_constraint);
    end loop;
    execute format('alter table public.%I drop constraint if exists %I', v_table, v_table || '_provider_known_check');
    execute format(
      'alter table public.%I add constraint %I check (provider in (''mercado_pago'',''pagbank''))',
      v_table, v_table || '_provider_known_check'
    );
  end loop;
end $$;

-- 2. Só um provedor de Pix online ativo por unidade.
create unique index if not exists order_payment_provider_configs_one_enabled_idx
  on public.order_payment_provider_configs (store_id)
  where enabled;

-- 3. Reserva de cobrança aceita os dois provedores (mesma lógica do original).
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
  if p_provider not in ('mercado_pago','pagbank') then raise exception 'unsupported order payment provider'; end if;

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

-- 4. Conexão PagBank Connect (tokens no Vault, nunca em coluna).
create or replace function public.order_payment_provider_pagbank_connect_internal(
  p_store_id uuid,
  p_environment text,
  p_access_token text,
  p_refresh_token text,
  p_webhook_secret text,
  p_provider_account_id text,
  p_access_token_expires_at timestamptz
) returns public.order_payment_provider_configs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_config public.order_payment_provider_configs%rowtype;
  v_access_secret uuid;
  v_refresh_secret uuid;
  v_webhook_secret uuid;
  v_name text;
begin
  if p_environment not in ('test','production') then raise exception 'invalid provider environment'; end if;
  if nullif(trim(coalesce(p_access_token,'')),'') is null then raise exception 'oauth access token is required'; end if;
  if nullif(trim(coalesce(p_refresh_token,'')),'') is null then raise exception 'oauth refresh token is required'; end if;
  if nullif(trim(coalesce(p_webhook_secret,'')),'') is null then raise exception 'webhook secret is required'; end if;
  if nullif(trim(coalesce(p_provider_account_id,'')),'') is null then raise exception 'provider account id is required'; end if;

  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  insert into public.order_payment_provider_configs (
    organization_id, store_id, provider, environment, enabled, connection_mode
  ) values (
    v_store.organization_id, v_store.id, 'pagbank', p_environment, false, 'oauth'
  )
  on conflict (store_id, provider) do update set
    environment = excluded.environment,
    enabled = false,
    connection_mode = 'oauth',
    updated_at = now()
  returning * into v_config;

  v_access_secret := v_config.access_token_secret_id;
  v_refresh_secret := v_config.refresh_token_secret_id;
  v_webhook_secret := v_config.webhook_secret_id;

  v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_pagbank_access_token';
  if v_access_secret is null then
    select vault.create_secret(trim(p_access_token), v_name, 'PedeAqui PagBank Connect access token') into v_access_secret;
  else
    perform vault.update_secret(v_access_secret, trim(p_access_token), v_name, 'PedeAqui PagBank Connect access token');
  end if;

  v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_pagbank_refresh_token';
  if v_refresh_secret is null then
    select vault.create_secret(trim(p_refresh_token), v_name, 'PedeAqui PagBank Connect refresh token') into v_refresh_secret;
  else
    perform vault.update_secret(v_refresh_secret, trim(p_refresh_token), v_name, 'PedeAqui PagBank Connect refresh token');
  end if;

  v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_pagbank_webhook_secret';
  if v_webhook_secret is null then
    select vault.create_secret(trim(p_webhook_secret), v_name, 'PedeAqui PagBank notification token') into v_webhook_secret;
  else
    perform vault.update_secret(v_webhook_secret, trim(p_webhook_secret), v_name, 'PedeAqui PagBank notification token');
  end if;

  update public.order_payment_provider_configs set
    environment = p_environment,
    enabled = false,
    connection_mode = 'oauth',
    provider_account_id = trim(p_provider_account_id),
    access_token_secret_id = v_access_secret,
    refresh_token_secret_id = v_refresh_secret,
    webhook_secret_id = v_webhook_secret,
    access_token_expires_at = p_access_token_expires_at,
    authorized_at = now(),
    revoked_at = null,
    last_health_status = 'unknown',
    last_health_checked_at = null,
    last_error_code = null,
    updated_at = now()
  where id = v_config.id
  returning * into v_config;

  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_pagbank_connect_internal(uuid,text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.order_payment_provider_pagbank_connect_internal(uuid,text,text,text,text,text,timestamptz) to service_role;

-- 5. Renovação do token PagBank (cada renovação invalida o refresh token anterior).
create or replace function public.order_payment_provider_pagbank_refresh_internal(
  p_store_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_access_token_expires_at timestamptz,
  p_expected_updated_at timestamptz
) returns public.order_payment_provider_configs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_config public.order_payment_provider_configs%rowtype;
begin
  select * into v_config
  from public.order_payment_provider_configs
  where store_id = p_store_id and provider = 'pagbank'
  for update;
  if v_config.id is null or v_config.connection_mode <> 'oauth' or v_config.revoked_at is not null then
    raise exception 'pagbank connection is not active';
  end if;
  if v_config.updated_at <> p_expected_updated_at then raise exception 'pagbank credentials changed concurrently'; end if;

  perform vault.update_secret(v_config.access_token_secret_id, trim(p_access_token), 'pedeaqui_order_payment_' || p_store_id::text || '_pagbank_access_token', 'PedeAqui PagBank Connect access token');
  perform vault.update_secret(v_config.refresh_token_secret_id, trim(p_refresh_token), 'pedeaqui_order_payment_' || p_store_id::text || '_pagbank_refresh_token', 'PedeAqui PagBank Connect refresh token');

  update public.order_payment_provider_configs set
    access_token_expires_at = p_access_token_expires_at,
    updated_at = now()
  where id = v_config.id
  returning * into v_config;
  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_pagbank_refresh_internal(uuid,text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.order_payment_provider_pagbank_refresh_internal(uuid,text,text,timestamptz,timestamptz) to service_role;

-- 6. Ativar, desativar e desconectar por provedor. Ativar um provedor desativa o outro.
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
  if p_provider not in ('mercado_pago','pagbank') then raise exception 'unsupported order payment provider'; end if;
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

create or replace function public.order_payment_provider_pagbank_disconnect_internal(
  p_store_id uuid
) returns public.order_payment_provider_configs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_config public.order_payment_provider_configs%rowtype;
begin
  update public.order_payment_provider_configs set
    enabled = false,
    revoked_at = now(),
    updated_at = now()
  where store_id = p_store_id
    and provider = 'pagbank'
  returning * into v_config;
  if v_config.id is null then raise exception 'pagbank connection not found'; end if;
  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_pagbank_disconnect_internal(uuid) from public, anon, authenticated;
grant execute on function public.order_payment_provider_pagbank_disconnect_internal(uuid) to service_role;

-- 7. Manual Mercado Pago configuration and provider switching are one transaction.
-- PedeAqui — safe fallback from Mercado Pago OAuth to manual credentials.
-- This RPC is separate from the legacy configure RPC so OAuth enable/disable can
-- continue using the legacy path without accidentally changing connection mode.

create or replace function public.order_payment_provider_configure_manual_internal(
  p_store_id uuid,
  p_environment text,
  p_enabled boolean,
  p_access_token text default null,
  p_webhook_secret text default null
) returns public.order_payment_provider_configs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_config public.order_payment_provider_configs%rowtype;
  v_access_secret uuid;
  v_webhook_secret uuid;
  v_name text;
  v_switching_from_oauth boolean := false;
begin
  if p_environment not in ('test','production') then raise exception 'invalid provider environment'; end if;
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store.id is null then raise exception 'store not found'; end if;

  select * into v_config
  from public.order_payment_provider_configs
  where store_id = p_store_id and provider = 'mercado_pago'
  for update;

  if v_config.id is null then
    insert into public.order_payment_provider_configs (
      organization_id, store_id, provider, environment, enabled, connection_mode
    ) values (
      v_store.organization_id, v_store.id, 'mercado_pago', p_environment, false, 'manual'
    ) returning * into v_config;
  else
    v_switching_from_oauth := v_config.connection_mode = 'oauth';
  end if;

  if v_switching_from_oauth and (
    nullif(trim(coalesce(p_access_token,'')),'') is null
    or nullif(trim(coalesce(p_webhook_secret,'')),'') is null
  ) then
    raise exception 'manual credentials are required when switching from oauth';
  end if;

  v_access_secret := v_config.access_token_secret_id;
  v_webhook_secret := v_config.webhook_secret_id;

  if nullif(trim(coalesce(p_access_token,'')),'') is not null then
    v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_mercado_pago_access_token';
    if v_access_secret is null then
      select vault.create_secret(trim(p_access_token), v_name, 'PedeAqui Mercado Pago manual access token') into v_access_secret;
    else
      perform vault.update_secret(v_access_secret, trim(p_access_token), v_name, 'PedeAqui Mercado Pago manual access token');
    end if;
  end if;

  if nullif(trim(coalesce(p_webhook_secret,'')),'') is not null then
    v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_mercado_pago_webhook_secret';
    if v_webhook_secret is null then
      select vault.create_secret(trim(p_webhook_secret), v_name, 'PedeAqui Mercado Pago webhook signature secret') into v_webhook_secret;
    else
      perform vault.update_secret(v_webhook_secret, trim(p_webhook_secret), v_name, 'PedeAqui Mercado Pago webhook signature secret');
    end if;
  end if;

  if p_enabled and (v_access_secret is null or v_webhook_secret is null) then
    raise exception 'provider credentials are required before enabling online payments';
  end if;

  if p_enabled then
    update public.order_payment_provider_configs set enabled = false, updated_at = now()
    where store_id = p_store_id and provider <> 'mercado_pago' and enabled;
  end if;

  update public.order_payment_provider_configs set
    environment = p_environment,
    enabled = p_enabled,
    connection_mode = 'manual',
    provider_account_id = null,
    access_token_secret_id = v_access_secret,
    webhook_secret_id = v_webhook_secret,
    access_token_expires_at = null,
    authorized_at = null,
    revoked_at = null,
    last_health_status = case when p_enabled then 'unknown' else last_health_status end,
    last_error_code = null,
    updated_at = now()
  where id = v_config.id
  returning * into v_config;

  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_configure_manual_internal(uuid,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.order_payment_provider_configure_manual_internal(uuid,text,boolean,text,text) to service_role;
