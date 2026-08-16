-- PedeAqui — [331]
-- Onboarding multitenant do WhatsApp via Meta Embedded Signup.
-- Tokens de restaurantes ficam no Vault; navegador nunca recebe credencial permanente.

alter table public.store_conversation_settings
  add column if not exists meta_business_id text,
  add column if not exists access_token_secret_id uuid,
  add column if not exists connection_status text not null default 'not_connected',
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists display_phone_number text,
  add column if not exists verified_name text,
  add column if not exists quality_rating text,
  add column if not exists connected_at timestamptz,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_connection_error_kind text,
  add column if not exists meta_billing_mode text not null default 'unconfigured';

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_connection_status_check,
  add constraint store_conversation_settings_connection_status_check
    check (connection_status in ('not_connected','connected','action_required','temporarily_unavailable','revoked','disconnected')),
  drop constraint if exists store_conversation_settings_onboarding_status_check,
  add constraint store_conversation_settings_onboarding_status_check
    check (onboarding_status in ('not_started','starting','awaiting_meta','authorizing','configuring_assets','subscribing_webhooks','registering_phone','health_checking','completed','failed','canceled')),
  drop constraint if exists store_conversation_settings_billing_mode_check,
  add constraint store_conversation_settings_billing_mode_check
    check (meta_billing_mode in ('unconfigured','customer_direct','provider_credit')),
  drop constraint if exists store_conversation_settings_meta_business_shape,
  add constraint store_conversation_settings_meta_business_shape
    check (meta_business_id is null or meta_business_id ~ '^[0-9]{3,40}$'),
  drop constraint if exists store_conversation_settings_display_phone_shape,
  add constraint store_conversation_settings_display_phone_shape
    check (display_phone_number is null or char_length(display_phone_number) between 4 and 40),
  drop constraint if exists store_conversation_settings_verified_name_shape,
  add constraint store_conversation_settings_verified_name_shape
    check (verified_name is null or char_length(verified_name) between 1 and 180),
  drop constraint if exists store_conversation_settings_quality_shape,
  add constraint store_conversation_settings_quality_shape
    check (quality_rating is null or quality_rating in ('GREEN','YELLOW','RED','UNKNOWN')),
  drop constraint if exists store_conversation_settings_connection_error_shape,
  add constraint store_conversation_settings_connection_error_shape
    check (last_connection_error_kind is null or char_length(last_connection_error_kind) between 1 and 120);

create index if not exists store_conversation_settings_connection_idx
  on public.store_conversation_settings (organization_id, connection_status, onboarding_status);

create table if not exists public.whatsapp_embedded_signup_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  state_token_sha256 text not null check (state_token_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'starting' check (status in ('starting','awaiting_meta','authorizing','configuring_assets','subscribing_webhooks','registering_phone','health_checking','completed','failed','canceled','expired')),
  meta_business_id text,
  waba_id text,
  phone_number_id text,
  error_kind text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_embedded_signup_sessions_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint whatsapp_embedded_signup_sessions_meta_business_shape
    check (meta_business_id is null or meta_business_id ~ '^[0-9]{3,40}$'),
  constraint whatsapp_embedded_signup_sessions_waba_shape
    check (waba_id is null or waba_id ~ '^[0-9]{3,40}$'),
  constraint whatsapp_embedded_signup_sessions_phone_shape
    check (phone_number_id is null or phone_number_id ~ '^[0-9]{3,40}$'),
  constraint whatsapp_embedded_signup_sessions_error_shape
    check (error_kind is null or char_length(error_kind) between 1 and 120)
);

create index if not exists whatsapp_embedded_signup_sessions_store_idx
  on public.whatsapp_embedded_signup_sessions (organization_id, store_id, created_at desc);
create index if not exists whatsapp_embedded_signup_sessions_expiry_idx
  on public.whatsapp_embedded_signup_sessions (status, expires_at);

alter table public.whatsapp_embedded_signup_sessions enable row level security;
revoke all on table public.whatsapp_embedded_signup_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_embedded_signup_sessions to service_role;

create or replace function public.whatsapp_channel_store_access_token_internal(
  p_store_id uuid,
  p_access_token text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_secret_id uuid;
  v_name text;
begin
  if nullif(trim(coalesce(p_access_token,'')),'') is null then
    raise exception 'access token required';
  end if;
  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  insert into public.store_conversation_settings (organization_id, store_id)
  values (v_store.organization_id, v_store.id)
  on conflict (store_id) do nothing;

  select access_token_secret_id into v_secret_id
  from public.store_conversation_settings
  where store_id = v_store.id
  for update;

  v_name := 'pedeaqui_whatsapp_' || v_store.id::text || '_access_token';
  if v_secret_id is null then
    select vault.create_secret(trim(p_access_token), v_name, 'PedeAqui WhatsApp Embedded Signup access token') into v_secret_id;
  else
    perform vault.update_secret(v_secret_id, trim(p_access_token), v_name, 'PedeAqui WhatsApp Embedded Signup access token');
  end if;

  update public.store_conversation_settings
  set access_token_secret_id = v_secret_id, updated_at = now()
  where store_id = v_store.id;
  return v_secret_id;
end;
$$;
revoke all on function public.whatsapp_channel_store_access_token_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.whatsapp_channel_store_access_token_internal(uuid,text) to service_role;

create or replace function public.whatsapp_channel_access_token_internal(
  p_store_id uuid
) returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.store_conversation_settings c
  join vault.decrypted_secrets s on s.id = c.access_token_secret_id
  where c.store_id = p_store_id
  limit 1
$$;
revoke all on function public.whatsapp_channel_access_token_internal(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_channel_access_token_internal(uuid) to service_role;
