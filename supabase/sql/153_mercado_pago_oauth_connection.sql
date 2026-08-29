-- PedeAqui — Mercado Pago OAuth foundation
-- Additive migration: preserves the existing manual connector and never enables PIX.

alter table public.order_payment_provider_configs
  add column if not exists connection_mode text not null default 'manual',
  add column if not exists provider_account_id text,
  add column if not exists refresh_token_secret_id uuid,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists authorized_at timestamptz,
  add column if not exists revoked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_payment_provider_configs_connection_mode_check'
      and conrelid = 'public.order_payment_provider_configs'::regclass
  ) then
    alter table public.order_payment_provider_configs
      add constraint order_payment_provider_configs_connection_mode_check
      check (connection_mode in ('manual','oauth'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_payment_provider_configs_oauth_ready_check'
      and conrelid = 'public.order_payment_provider_configs'::regclass
  ) then
    alter table public.order_payment_provider_configs
      add constraint order_payment_provider_configs_oauth_ready_check
      check (
        not enabled
        or connection_mode = 'manual'
        or (refresh_token_secret_id is not null and revoked_at is null)
      );
  end if;
end $$;

create index if not exists order_payment_provider_configs_provider_account_idx
  on public.order_payment_provider_configs (provider, provider_account_id)
  where provider_account_id is not null;

create or replace function public.order_payment_provider_oauth_connect_internal(
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
    v_store.organization_id, v_store.id, 'mercado_pago', p_environment, false, 'oauth'
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

  v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_mercado_pago_access_token';
  if v_access_secret is null then
    select vault.create_secret(trim(p_access_token), v_name, 'PedeAqui Mercado Pago OAuth access token') into v_access_secret;
  else
    perform vault.update_secret(v_access_secret, trim(p_access_token), v_name, 'PedeAqui Mercado Pago OAuth access token');
  end if;

  v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_mercado_pago_refresh_token';
  if v_refresh_secret is null then
    select vault.create_secret(trim(p_refresh_token), v_name, 'PedeAqui Mercado Pago OAuth refresh token') into v_refresh_secret;
  else
    perform vault.update_secret(v_refresh_secret, trim(p_refresh_token), v_name, 'PedeAqui Mercado Pago OAuth refresh token');
  end if;

  v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_mercado_pago_webhook_secret';
  if v_webhook_secret is null then
    select vault.create_secret(trim(p_webhook_secret), v_name, 'PedeAqui Mercado Pago webhook signature secret') into v_webhook_secret;
  else
    perform vault.update_secret(v_webhook_secret, trim(p_webhook_secret), v_name, 'PedeAqui Mercado Pago webhook signature secret');
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
revoke all on function public.order_payment_provider_oauth_connect_internal(uuid,text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.order_payment_provider_oauth_connect_internal(uuid,text,text,text,text,text,timestamptz) to service_role;

create or replace function public.order_payment_provider_credentials_v2_internal(
  p_store_id uuid,
  p_provider text
) returns table (
  organization_id uuid,
  store_id uuid,
  provider text,
  environment text,
  enabled boolean,
  connection_mode text,
  provider_account_id text,
  access_token text,
  refresh_token text,
  webhook_secret text,
  access_token_expires_at timestamptz,
  authorized_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select c.organization_id,
         c.store_id,
         c.provider,
         c.environment,
         c.enabled,
         c.connection_mode,
         c.provider_account_id,
         a.decrypted_secret as access_token,
         r.decrypted_secret as refresh_token,
         w.decrypted_secret as webhook_secret,
         c.access_token_expires_at,
         c.authorized_at,
         c.revoked_at,
         c.updated_at
  from public.order_payment_provider_configs c
  left join vault.decrypted_secrets a on a.id = c.access_token_secret_id
  left join vault.decrypted_secrets r on r.id = c.refresh_token_secret_id
  left join vault.decrypted_secrets w on w.id = c.webhook_secret_id
  where c.store_id = p_store_id and c.provider = p_provider
  limit 1
$$;
revoke all on function public.order_payment_provider_credentials_v2_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.order_payment_provider_credentials_v2_internal(uuid,text) to service_role;

create or replace function public.order_payment_provider_oauth_refresh_internal(
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
  v_name text;
begin
  if nullif(trim(coalesce(p_access_token,'')),'') is null then raise exception 'oauth access token is required'; end if;
  if nullif(trim(coalesce(p_refresh_token,'')),'') is null then raise exception 'oauth refresh token is required'; end if;

  select * into v_config
  from public.order_payment_provider_configs
  where store_id = p_store_id and provider = 'mercado_pago'
  for update;

  if v_config.id is null then raise exception 'provider config not found'; end if;
  if v_config.connection_mode <> 'oauth' then raise exception 'provider is not connected with oauth'; end if;
  if v_config.revoked_at is not null then raise exception 'oauth authorization is revoked'; end if;
  if v_config.refresh_token_secret_id is null or v_config.access_token_secret_id is null then raise exception 'oauth credentials are incomplete'; end if;
  if v_config.updated_at is distinct from p_expected_updated_at then raise exception 'oauth credentials changed concurrently'; end if;

  v_name := 'pedeaqui_order_payment_' || p_store_id::text || '_mercado_pago_access_token';
  perform vault.update_secret(v_config.access_token_secret_id, trim(p_access_token), v_name, 'PedeAqui Mercado Pago OAuth access token');

  v_name := 'pedeaqui_order_payment_' || p_store_id::text || '_mercado_pago_refresh_token';
  perform vault.update_secret(v_config.refresh_token_secret_id, trim(p_refresh_token), v_name, 'PedeAqui Mercado Pago OAuth refresh token');

  update public.order_payment_provider_configs set
    access_token_expires_at = p_access_token_expires_at,
    last_health_status = 'unknown',
    last_error_code = null,
    updated_at = now()
  where id = v_config.id
  returning * into v_config;

  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_oauth_refresh_internal(uuid,text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.order_payment_provider_oauth_refresh_internal(uuid,text,text,timestamptz,timestamptz) to service_role;

create or replace function public.order_payment_provider_oauth_disconnect_internal(
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
    last_health_status = 'error',
    last_health_checked_at = now(),
    last_error_code = 'oauth_disconnected',
    updated_at = now()
  where store_id = p_store_id
    and provider = 'mercado_pago'
    and connection_mode = 'oauth'
  returning * into v_config;

  if v_config.id is null then raise exception 'oauth provider config not found'; end if;
  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_oauth_disconnect_internal(uuid) from public, anon, authenticated;
grant execute on function public.order_payment_provider_oauth_disconnect_internal(uuid) to service_role;
