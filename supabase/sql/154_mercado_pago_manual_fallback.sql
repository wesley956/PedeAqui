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
  select * into v_store from public.stores where id = p_store_id;
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
