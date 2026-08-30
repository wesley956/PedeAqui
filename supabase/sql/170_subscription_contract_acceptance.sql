begin;

create table if not exists public.subscription_contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  contract_version text not null,
  contract_title text not null,
  contract_document jsonb not null,
  commercial_snapshot jsonb not null,
  document_sha256 text not null,
  protocol text not null unique,
  accepted_by_user_id uuid not null,
  representative_name text not null,
  representative_email text not null,
  representative_document text,
  ip_address text,
  user_agent text,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint subscription_contract_acceptances_version_not_blank check (btrim(contract_version) <> ''),
  constraint subscription_contract_acceptances_title_not_blank check (btrim(contract_title) <> ''),
  constraint subscription_contract_acceptances_hash_format check (document_sha256 ~ '^[a-f0-9]{64}$'),
  constraint subscription_contract_acceptances_protocol_not_blank check (btrim(protocol) <> ''),
  constraint subscription_contract_acceptances_representative_not_blank check (btrim(representative_name) <> ''),
  constraint subscription_contract_acceptances_email_not_blank check (btrim(representative_email) <> ''),
  unique (subscription_id, contract_version)
);

create index if not exists subscription_contract_acceptances_organization_idx
  on public.subscription_contract_acceptances (organization_id, accepted_at desc);
create index if not exists subscription_contract_acceptances_subscription_idx
  on public.subscription_contract_acceptances (subscription_id, accepted_at desc);

alter table public.subscription_contract_acceptances enable row level security;
revoke all on table public.subscription_contract_acceptances from anon, authenticated;

create or replace function private.reject_subscription_contract_acceptance_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  raise exception 'subscription contract acceptances are append-only';
end;
$$;

revoke all on function private.reject_subscription_contract_acceptance_mutation() from public;

create trigger subscription_contract_acceptances_append_only
before update or delete on public.subscription_contract_acceptances
for each row execute function private.reject_subscription_contract_acceptance_mutation();

insert into public.platform_settings (key, category, description, value, active)
values (
  'legal.contractor.identity',
  'legal',
  'Identificação jurídica da CONTRATADA usada nos contratos eletrônicos do PedeAqui. O aceite permanece bloqueado enquanto esta configuração estiver incompleta ou inativa.',
  jsonb_build_object(
    'legal_name', '',
    'tax_id', '',
    'address', '',
    'city_state', '',
    'email', ''
  ),
  false
)
on conflict (key) do nothing;

commit;
