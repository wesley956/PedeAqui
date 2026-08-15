-- PedeAqui — [327]–[328]
-- Provedores de pagamento online por unidade, cobrança PIX idempotente e replay protection.

create table if not exists public.order_payment_provider_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  provider text not null check (provider in ('mercado_pago')),
  environment text not null default 'production' check (environment in ('test','production')),
  enabled boolean not null default false,
  access_token_secret_id uuid,
  webhook_secret_id uuid,
  last_health_status text not null default 'unknown' check (last_health_status in ('unknown','healthy','error')),
  last_health_checked_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_payment_provider_configs_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint order_payment_provider_configs_store_provider_unique unique (store_id, provider),
  constraint order_payment_provider_configs_enabled_secrets check (
    not enabled or (access_token_secret_id is not null and webhook_secret_id is not null)
  )
);

create index if not exists order_payment_provider_configs_org_store_idx
  on public.order_payment_provider_configs (organization_id, store_id, provider);

alter table public.order_payment_provider_configs enable row level security;
revoke all on table public.order_payment_provider_configs from anon, authenticated;
grant select, insert, update, delete on table public.order_payment_provider_configs to service_role;

create table if not exists public.order_payment_provider_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid not null,
  payment_id uuid not null,
  provider text not null check (provider in ('mercado_pago')),
  attempt integer not null check (attempt > 0),
  status text not null default 'creating' check (status in ('creating','pending','paid','expired','canceled','failed')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  external_reference text not null check (char_length(external_reference) between 8 and 64),
  provider_order_id text,
  provider_payment_id text,
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  expires_at timestamptz,
  last_reconciled_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_payment_provider_charges_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint order_payment_provider_charges_order_same_store_fk foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade,
  constraint order_payment_provider_charges_payment_same_store_fk foreign key (organization_id, store_id, payment_id)
    references public.payments (organization_id, store_id, id) on delete cascade,
  constraint order_payment_provider_charges_payment_attempt_unique unique (payment_id, attempt),
  constraint order_payment_provider_charges_idempotency_unique unique (provider, idempotency_key),
  constraint order_payment_provider_charges_external_reference_unique unique (provider, external_reference)
);

create unique index if not exists order_payment_provider_charges_provider_order_unique
  on public.order_payment_provider_charges (provider, provider_order_id)
  where provider_order_id is not null;
create unique index if not exists order_payment_provider_charges_provider_payment_unique
  on public.order_payment_provider_charges (provider, provider_payment_id)
  where provider_payment_id is not null;
create unique index if not exists order_payment_provider_charges_one_active_idx
  on public.order_payment_provider_charges (payment_id)
  where status in ('creating','pending');
create index if not exists order_payment_provider_charges_order_idx
  on public.order_payment_provider_charges (organization_id, store_id, order_id, created_at desc);

alter table public.order_payment_provider_charges enable row level security;
revoke all on table public.order_payment_provider_charges from anon, authenticated;
grant select, insert, update, delete on table public.order_payment_provider_charges to service_role;

create table if not exists public.order_payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  provider text not null check (provider in ('mercado_pago')),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 200),
  provider_order_id text,
  action text,
  request_id text,
  payload_sha256 text not null check (char_length(payload_sha256) = 64),
  status text not null default 'processing' check (status in ('processing','processed','duplicate','rejected','error')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint order_payment_provider_events_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint order_payment_provider_events_replay_unique unique (store_id, provider, provider_event_id)
);

create index if not exists order_payment_provider_events_order_idx
  on public.order_payment_provider_events (provider, provider_order_id, received_at desc);

alter table public.order_payment_provider_events enable row level security;
revoke all on table public.order_payment_provider_events from anon, authenticated;
grant select, insert, update, delete on table public.order_payment_provider_events to service_role;

create or replace function public.order_payment_provider_configure_internal(
  p_store_id uuid,
  p_provider text,
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
begin
  if p_provider <> 'mercado_pago' then raise exception 'unsupported order payment provider'; end if;
  if p_environment not in ('test','production') then raise exception 'invalid provider environment'; end if;

  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  insert into public.order_payment_provider_configs (
    organization_id, store_id, provider, environment, enabled
  ) values (
    v_store.organization_id, v_store.id, p_provider, p_environment, false
  )
  on conflict (store_id, provider) do update set
    environment = excluded.environment,
    updated_at = now()
  returning * into v_config;

  v_access_secret := v_config.access_token_secret_id;
  v_webhook_secret := v_config.webhook_secret_id;

  if nullif(trim(coalesce(p_access_token,'')),'') is not null then
    v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_' || p_provider || '_access_token';
    if v_access_secret is null then
      select vault.create_secret(trim(p_access_token), v_name, 'PedeAqui order payment provider access token') into v_access_secret;
    else
      perform vault.update_secret(v_access_secret, trim(p_access_token), v_name, 'PedeAqui order payment provider access token');
    end if;
  end if;

  if nullif(trim(coalesce(p_webhook_secret,'')),'') is not null then
    v_name := 'pedeaqui_order_payment_' || v_store.id::text || '_' || p_provider || '_webhook_secret';
    if v_webhook_secret is null then
      select vault.create_secret(trim(p_webhook_secret), v_name, 'PedeAqui order payment provider webhook secret') into v_webhook_secret;
    else
      perform vault.update_secret(v_webhook_secret, trim(p_webhook_secret), v_name, 'PedeAqui order payment provider webhook secret');
    end if;
  end if;

  if p_enabled and (v_access_secret is null or v_webhook_secret is null) then
    raise exception 'provider credentials are required before enabling online payments';
  end if;

  update public.order_payment_provider_configs set
    environment = p_environment,
    enabled = p_enabled,
    access_token_secret_id = v_access_secret,
    webhook_secret_id = v_webhook_secret,
    last_health_status = case when p_enabled then 'unknown' else last_health_status end,
    last_error_code = null,
    updated_at = now()
  where id = v_config.id
  returning * into v_config;

  return v_config;
end;
$$;
revoke all on function public.order_payment_provider_configure_internal(uuid,text,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.order_payment_provider_configure_internal(uuid,text,text,boolean,text,text) to service_role;

create or replace function public.order_payment_provider_credentials_internal(
  p_store_id uuid,
  p_provider text
) returns table (
  organization_id uuid,
  store_id uuid,
  provider text,
  environment text,
  enabled boolean,
  access_token text,
  webhook_secret text
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
         a.decrypted_secret as access_token,
         w.decrypted_secret as webhook_secret
  from public.order_payment_provider_configs c
  left join vault.decrypted_secrets a on a.id = c.access_token_secret_id
  left join vault.decrypted_secrets w on w.id = c.webhook_secret_id
  where c.store_id = p_store_id and c.provider = p_provider
  limit 1
$$;
revoke all on function public.order_payment_provider_credentials_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.order_payment_provider_credentials_internal(uuid,text) to service_role;

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
  if p_provider <> 'mercado_pago' then raise exception 'unsupported order payment provider'; end if;

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
