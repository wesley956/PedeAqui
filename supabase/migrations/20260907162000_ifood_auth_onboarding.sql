-- PedeAqui OMNI #938 — iFood onboarding/authentication lifecycle.
-- Secrets live in Supabase Vault. Browser roles never receive provider credentials,
-- OAuth verifiers, access tokens or refresh tokens.

create extension if not exists supabase_vault with schema vault;

alter table public.integration_accounts
  add column if not exists environment text not null default 'sandbox',
  add column if not exists auth_mode text,
  add column if not exists connection_state text not null default 'not_connected',
  add column if not exists last_health_at timestamptz,
  add column if not exists last_health_error_code text,
  add column if not exists refresh_lock_owner text,
  add column if not exists refresh_lock_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.integration_accounts'::regclass
      and conname='integration_accounts_environment_check'
  ) then
    alter table public.integration_accounts
      add constraint integration_accounts_environment_check
      check (environment in ('sandbox','production'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.integration_accounts'::regclass
      and conname='integration_accounts_auth_mode_check'
  ) then
    alter table public.integration_accounts
      add constraint integration_accounts_auth_mode_check
      check (auth_mode is null or auth_mode in ('centralized','distributed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.integration_accounts'::regclass
      and conname='integration_accounts_connection_state_check'
  ) then
    alter table public.integration_accounts
      add constraint integration_accounts_connection_state_check
      check (connection_state in (
        'not_connected','starting','awaiting_authorization','exchanging_token',
        'resolving_merchant','health_checking','connected','action_required',
        'temporarily_unavailable','revoked','disconnected'
      ));
  end if;
end $$;

-- One provider account per organization/environment. Sandbox and production are
-- intentionally distinct connections and can never reuse the same token row.
create unique index if not exists integration_accounts_provider_env_uidx
  on public.integration_accounts(organization_id,provider,environment);

drop index if exists public.integration_accounts_external_uidx;
create unique index if not exists integration_accounts_external_uidx
  on public.integration_accounts(organization_id,provider,environment,external_account_id)
  where external_account_id is not null;

alter table public.integration_merchants
  add column if not exists environment text;

update public.integration_merchants merchant
set environment=account.environment
from public.integration_accounts account
where account.id=merchant.integration_account_id
  and account.organization_id=merchant.organization_id
  and merchant.environment is null;

update public.integration_merchants set environment='sandbox' where environment is null;
alter table public.integration_merchants alter column environment set default 'sandbox';
alter table public.integration_merchants alter column environment set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.integration_merchants'::regclass
      and conname='integration_merchants_environment_check'
  ) then
    alter table public.integration_merchants
      add constraint integration_merchants_environment_check
      check (environment in ('sandbox','production'));
  end if;
end $$;

-- The previous uniqueness did not distinguish sandbox from production.
alter table public.integration_merchants
  drop constraint if exists integration_merchants_organization_id_store_id_provider_key;
create unique index if not exists integration_merchants_store_provider_env_uidx
  on public.integration_merchants(organization_id,store_id,provider,environment);

-- iFood merchant ids are authoritative identities. The same external merchant
-- cannot silently be claimed by another tenant/account in the same environment.
create unique index if not exists integration_merchants_provider_env_external_uidx
  on public.integration_merchants(provider,environment,external_merchant_id);

create or replace function public.integration_guard_merchant_account_scope()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_provider text;
  v_environment text;
begin
  select provider,environment into v_provider,v_environment
  from public.integration_accounts
  where id=new.integration_account_id and organization_id=new.organization_id;

  if not found then
    raise exception 'integration account is outside merchant tenant scope';
  end if;
  if v_provider<>new.provider or v_environment<>new.environment then
    raise exception 'merchant provider/environment does not match integration account';
  end if;
  return new;
end;
$$;

drop trigger if exists integration_merchants_guard_account_scope on public.integration_merchants;
create trigger integration_merchants_guard_account_scope
before insert or update of organization_id,integration_account_id,provider,environment
on public.integration_merchants
for each row execute function public.integration_guard_merchant_account_scope();

create table if not exists public.integration_authorization_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  integration_account_id uuid not null,
  provider text not null check (provider='ifood'),
  environment text not null check (environment in ('sandbox','production')),
  state_hash text not null check (length(state_hash)=64),
  verifier_secret_reference text,
  status text not null default 'awaiting_authorization'
    check (status in ('starting','awaiting_authorization','exchanging_token','completed','cancelled','expired','failed')),
  correlation_id text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_authorization_sessions_store_scope_fk
    foreign key (organization_id,store_id) references public.stores(organization_id,id) on delete cascade,
  constraint integration_authorization_sessions_account_scope_fk
    foreign key (organization_id,integration_account_id) references public.integration_accounts(organization_id,id) on delete cascade,
  unique (integration_account_id,state_hash)
);

create index if not exists integration_authorization_sessions_active_idx
  on public.integration_authorization_sessions(integration_account_id,store_id,expires_at)
  where status in ('starting','awaiting_authorization','exchanging_token');

alter table public.integration_authorization_sessions enable row level security;
revoke all on table public.integration_authorization_sessions from public,anon,authenticated;
grant select,insert,update,delete on table public.integration_authorization_sessions to service_role;

-- Application credentials are configured once in Supabase Vault under one of:
-- pedeaqui_ifood_app_sandbox / pedeaqui_ifood_app_production.
-- Expected JSON: {"clientId":"...","clientSecret":"...","authMode":"centralized|distributed"}
create or replace function public.integration_ifood_app_credentials(p_environment text)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_secret text;
begin
  if p_environment not in ('sandbox','production') then
    raise exception 'invalid iFood environment';
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='pedeaqui_ifood_app_' || p_environment;
  if v_secret is null then
    return null;
  end if;
  return v_secret::jsonb;
end;
$$;

-- Account-scoped token bundle. The reference is safe to persist; plaintext is not.
create or replace function public.integration_secret_upsert(
  p_organization_id uuid,
  p_integration_account_id uuid,
  p_secret jsonb,
  p_description text default null
)
returns text
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_reference text;
  v_name text;
  v_id uuid;
begin
  select secret_reference into v_reference
  from public.integration_accounts
  where id=p_integration_account_id and organization_id=p_organization_id
  for update;
  if not found then raise exception 'integration account not found in tenant'; end if;

  v_name := 'integration_account_' || p_integration_account_id::text;
  if v_reference is not null and exists (
    select 1 from vault.secrets where id=v_reference::uuid
  ) then
    perform vault.update_secret(v_reference::uuid,p_secret::text,v_name,coalesce(p_description,'PedeAqui integration token bundle'));
    return v_reference;
  end if;

  select vault.create_secret(p_secret::text,v_name,coalesce(p_description,'PedeAqui integration token bundle')) into v_id;
  update public.integration_accounts
  set secret_reference=v_id::text,updated_at=now()
  where id=p_integration_account_id and organization_id=p_organization_id;
  return v_id::text;
end;
$$;

create or replace function public.integration_secret_read(
  p_organization_id uuid,
  p_integration_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_reference text;
  v_secret text;
begin
  select secret_reference into v_reference
  from public.integration_accounts
  where id=p_integration_account_id and organization_id=p_organization_id;
  if not found or v_reference is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_reference::uuid;
  if v_secret is null then return null; end if;
  return v_secret::jsonb;
end;
$$;

create or replace function public.integration_secret_delete(
  p_organization_id uuid,
  p_integration_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_reference text;
begin
  select secret_reference into v_reference
  from public.integration_accounts
  where id=p_integration_account_id and organization_id=p_organization_id
  for update;
  if not found then return false; end if;

  update public.integration_accounts
  set secret_reference=null,refresh_lock_owner=null,refresh_lock_until=null,updated_at=now()
  where id=p_integration_account_id and organization_id=p_organization_id;
  if v_reference is not null then delete from vault.secrets where id=v_reference::uuid; end if;
  return true;
end;
$$;

create or replace function public.integration_authorization_session_create(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_account_id uuid,
  p_environment text,
  p_state_hash text,
  p_verifier_secret jsonb,
  p_expires_at timestamptz,
  p_correlation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_session_id uuid := gen_random_uuid();
  v_reference uuid;
  v_provider text;
  v_account_environment text;
begin
  if length(p_state_hash)<>64 or p_expires_at<=now() then
    raise exception 'invalid authorization session parameters';
  end if;
  select provider,environment into v_provider,v_account_environment
  from public.integration_accounts
  where id=p_integration_account_id and organization_id=p_organization_id
  for update;
  if not found or v_provider<>'ifood' or v_account_environment<>p_environment then
    raise exception 'iFood account scope mismatch';
  end if;
  if not exists (
    select 1 from public.stores where id=p_store_id and organization_id=p_organization_id
  ) then raise exception 'store scope mismatch'; end if;

  update public.integration_authorization_sessions
  set status='cancelled',completed_at=now(),updated_at=now(),last_error_code='superseded'
  where integration_account_id=p_integration_account_id
    and store_id=p_store_id
    and status in ('starting','awaiting_authorization');

  select vault.create_secret(
    p_verifier_secret::text,
    'integration_auth_session_' || v_session_id::text,
    'Ephemeral iFood authorization verifier'
  ) into v_reference;

  insert into public.integration_authorization_sessions(
    id,organization_id,store_id,integration_account_id,provider,environment,
    state_hash,verifier_secret_reference,status,correlation_id,expires_at
  ) values (
    v_session_id,p_organization_id,p_store_id,p_integration_account_id,'ifood',p_environment,
    p_state_hash,v_reference::text,'awaiting_authorization',p_correlation_id,p_expires_at
  );
  return v_session_id;
end;
$$;

create or replace function public.integration_authorization_session_consume(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_account_id uuid,
  p_session_id uuid,
  p_state_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_row public.integration_authorization_sessions%rowtype;
  v_secret text;
begin
  select * into v_row
  from public.integration_authorization_sessions
  where id=p_session_id
    and organization_id=p_organization_id
    and store_id=p_store_id
    and integration_account_id=p_integration_account_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_row.state_hash<>p_state_hash then return jsonb_build_object('ok',false,'error','invalid_state'); end if;
  if v_row.status<>'awaiting_authorization' then return jsonb_build_object('ok',false,'error','replay'); end if;
  if v_row.expires_at<=now() then
    update public.integration_authorization_sessions
    set status='expired',completed_at=now(),updated_at=now(),last_error_code='expired'
    where id=p_session_id;
    return jsonb_build_object('ok',false,'error','expired');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id=v_row.verifier_secret_reference::uuid;
  if v_secret is null then return jsonb_build_object('ok',false,'error','verifier_missing'); end if;

  update public.integration_authorization_sessions
  set status='exchanging_token',consumed_at=now(),updated_at=now()
  where id=p_session_id;
  return jsonb_build_object('ok',true,'verifier',v_secret::jsonb,'correlationId',v_row.correlation_id);
end;
$$;

create or replace function public.integration_authorization_session_finish(
  p_organization_id uuid,
  p_session_id uuid,
  p_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_reference text;
begin
  if p_status not in ('completed','cancelled','failed') then raise exception 'invalid terminal session status'; end if;
  select verifier_secret_reference into v_reference
  from public.integration_authorization_sessions
  where id=p_session_id and organization_id=p_organization_id
  for update;
  if not found then return false; end if;

  update public.integration_authorization_sessions
  set status=p_status,completed_at=now(),updated_at=now(),last_error_code=p_error_code,
      verifier_secret_reference=null
  where id=p_session_id and organization_id=p_organization_id;
  if v_reference is not null then delete from vault.secrets where id=v_reference::uuid; end if;
  return true;
end;
$$;

create or replace function public.integration_acquire_refresh_lease(
  p_organization_id uuid,
  p_integration_account_id uuid,
  p_owner text,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_acquired boolean := false;
begin
  if nullif(trim(p_owner),'') is null then raise exception 'refresh lease owner is required'; end if;
  update public.integration_accounts
  set refresh_lock_owner=p_owner,
      refresh_lock_until=now()+make_interval(secs=>greatest(5,least(coalesce(p_lease_seconds,60),300))),
      updated_at=now()
  where id=p_integration_account_id
    and organization_id=p_organization_id
    and (refresh_lock_until is null or refresh_lock_until<=now() or refresh_lock_owner=p_owner)
  returning true into v_acquired;
  return coalesce(v_acquired,false);
end;
$$;

create or replace function public.integration_release_refresh_lease(
  p_organization_id uuid,
  p_integration_account_id uuid,
  p_owner text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_released boolean := false;
begin
  update public.integration_accounts
  set refresh_lock_owner=null,refresh_lock_until=null,updated_at=now()
  where id=p_integration_account_id
    and organization_id=p_organization_id
    and refresh_lock_owner=p_owner
  returning true into v_released;
  return coalesce(v_released,false);
end;
$$;

-- Every credential/verifier RPC is service_role-only. The browser can never call
-- Vault-backed helpers even if a future route accidentally exposes the function name.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'integration_ifood_app_credentials(text)',
    'integration_secret_upsert(uuid,uuid,jsonb,text)',
    'integration_secret_read(uuid,uuid)',
    'integration_secret_delete(uuid,uuid)',
    'integration_authorization_session_create(uuid,uuid,uuid,text,text,jsonb,timestamptz,text)',
    'integration_authorization_session_consume(uuid,uuid,uuid,uuid,text)',
    'integration_authorization_session_finish(uuid,uuid,text,text)',
    'integration_acquire_refresh_lease(uuid,uuid,text,integer)',
    'integration_release_refresh_lease(uuid,uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',fn);
    execute format('grant execute on function public.%s to service_role',fn);
  end loop;
end $$;

comment on column public.integration_accounts.secret_reference is
  'Opaque Supabase Vault UUID for provider token material. Never persist plaintext tokens in metadata.';
comment on table public.integration_authorization_sessions is
  'One-time server-side authorization sessions. Only a SHA-256 state hash is stored; OAuth verifier material stays in Vault.';
