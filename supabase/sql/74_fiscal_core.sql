-- PedeAqui — Milestone 22 [225]–[238]
-- Fiscal e Integrações: núcleo desacoplado, snapshots fiscais e registry de adapters.

insert into public.permissions(key,description) values
  ('fiscal.view','Visualizar configuração e documentos fiscais'),
  ('fiscal.manage','Gerenciar configuração e classificação fiscal'),
  ('fiscal.issue','Solicitar e reprocessar emissão fiscal'),
  ('fiscal.cancel','Cancelar documentos fiscais quando permitido'),
  ('integrations.view','Visualizar integrações configuradas'),
  ('integrations.manage','Gerenciar integrações e referências de credenciais')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p
  on p.key in ('fiscal.view','fiscal.manage','fiscal.issue','fiscal.cancel')
where r.key in ('owner','manager','financial') on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p
  on p.key in ('fiscal.view','fiscal.issue')
where r.key='cashier' on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p
  on p.key in ('integrations.view','integrations.manage')
where r.key in ('owner','manager') on conflict do nothing;

create or replace function private.grant_fiscal_permissions_for_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.key='financial' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p
    where p.key in ('fiscal.view','fiscal.manage','fiscal.issue','fiscal.cancel')
    on conflict do nothing;
  elsif new.key='cashier' then
    insert into public.role_permissions(role_id,permission_id)
    select new.id,p.id from public.permissions p
    where p.key in ('fiscal.view','fiscal.issue')
    on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.grant_fiscal_permissions_for_role() from public,anon,authenticated;
drop trigger if exists roles_grant_fiscal_permissions on public.roles;
create trigger roles_grant_fiscal_permissions after insert on public.roles
for each row execute function private.grant_fiscal_permissions_for_role();

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  kind text not null check (kind in ('fiscal','payment','whatsapp','marketplace','delivery','generic')),
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  environment text not null default 'production' check (environment in ('sandbox','homologation','production')),
  secret_ref text check (secret_ref is null or char_length(trim(secret_ref)) between 2 and 240),
  webhook_secret_ref text check (webhook_secret_ref is null or char_length(trim(webhook_secret_ref)) between 2 and 240),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities)='array'),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint integrations_org_store_id_unique unique (organization_id,store_id,id)
);
create unique index integrations_scope_provider_unique_idx
  on public.integrations(organization_id,coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid),kind,provider_key,environment)
  where active;
create index integrations_scope_kind_idx on public.integrations(organization_id,store_id,kind,active);

create table public.fiscal_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  integration_id uuid,
  issuer_tax_id text not null check (char_length(trim(issuer_tax_id)) between 8 and 32),
  state_registration text check (state_registration is null or char_length(trim(state_registration)) between 1 and 32),
  municipal_registration text check (municipal_registration is null or char_length(trim(municipal_registration)) between 1 and 32),
  crt_code text check (crt_code is null or char_length(trim(crt_code)) between 1 and 8),
  default_document_model text not null default '65' check (default_document_model in ('55','65')),
  environment text not null default 'homologation' check (environment in ('homologation','production')),
  certificate_ref text check (certificate_ref is null or char_length(trim(certificate_ref)) between 2 and 240),
  emission_policy text not null default 'manual' check (emission_policy in ('manual','on_payment','on_completion')),
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_profiles_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint fiscal_profiles_integration_fk foreign key (organization_id,store_id,integration_id)
    references public.integrations(organization_id,store_id,id) on delete restrict,
  constraint fiscal_profiles_org_store_id_unique unique (organization_id,store_id,id),
  constraint fiscal_profiles_store_unique unique (store_id)
);
create index fiscal_profiles_scope_active_idx on public.fiscal_profiles(organization_id,store_id,active);

create table public.product_fiscal_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  product_id uuid not null,
  version integer not null check (version>0),
  effective_at timestamptz not null default now(),
  ncm text check (ncm is null or char_length(trim(ncm)) between 2 and 16),
  cest text check (cest is null or char_length(trim(cest)) between 2 and 16),
  default_cfop text check (default_cfop is null or char_length(trim(default_cfop)) between 2 and 12),
  cst_csosn text check (cst_csosn is null or char_length(trim(cst_csosn)) between 1 and 12),
  cclass_trib text check (cclass_trib is null or char_length(trim(cclass_trib)) between 1 and 32),
  tax_data jsonb not null default '{}'::jsonb check (jsonb_typeof(tax_data)='object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint product_fiscal_profiles_product_fk foreign key (organization_id,store_id,product_id)
    references public.products(organization_id,store_id,id) on delete cascade,
  constraint product_fiscal_profiles_org_store_id_unique unique (organization_id,store_id,id),
  constraint product_fiscal_profiles_version_unique unique (organization_id,store_id,product_id,version)
);
create index product_fiscal_profiles_lookup_idx
  on public.product_fiscal_profiles(organization_id,store_id,product_id,effective_at desc,created_at desc);

create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid,
  integration_id uuid,
  model text not null check (model in ('55','65')),
  environment text not null check (environment in ('homologation','production')),
  status text not null default 'draft' check (status in ('draft','queued','processing','authorized','rejected','cancelled','contingency')),
  series text,
  document_number bigint check (document_number is null or document_number>0),
  access_key text,
  protocol text,
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  issuer_snapshot jsonb not null check (jsonb_typeof(issuer_snapshot)='object'),
  customer_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(customer_snapshot)='object'),
  totals_snapshot jsonb not null check (jsonb_typeof(totals_snapshot)='object'),
  fiscal_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(fiscal_payload)='object'),
  schema_version text,
  provider_document_id text,
  rejection_code text,
  rejection_message text,
  xml_storage_path text,
  danfe_storage_path text,
  xml_sha256 text,
  queued_at timestamptz,
  processing_at timestamptz,
  authorized_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  contingency_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_documents_store_fk foreign key (organization_id,store_id)
    references public.stores(organization_id,id) on delete cascade,
  constraint fiscal_documents_order_fk foreign key (organization_id,store_id,order_id)
    references public.orders(organization_id,store_id,id) on delete restrict,
  constraint fiscal_documents_integration_fk foreign key (organization_id,store_id,integration_id)
    references public.integrations(organization_id,store_id,id) on delete restrict,
  constraint fiscal_documents_org_store_id_unique unique (organization_id,store_id,id),
  constraint fiscal_documents_org_idem_unique unique (organization_id,idempotency_key)
);
create unique index fiscal_documents_access_key_unique_idx on public.fiscal_documents(access_key) where access_key is not null;
create unique index fiscal_documents_provider_id_unique_idx on public.fiscal_documents(integration_id,provider_document_id)
  where integration_id is not null and provider_document_id is not null;
create index fiscal_documents_store_status_idx on public.fiscal_documents(organization_id,store_id,status,created_at desc);
create index fiscal_documents_order_idx on public.fiscal_documents(organization_id,store_id,order_id) where order_id is not null;

create table public.fiscal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  fiscal_document_id uuid not null,
  order_item_id uuid,
  product_id uuid,
  line_number integer not null check (line_number>0),
  description text not null check (char_length(trim(description)) between 1 and 300),
  quantity numeric(18,6) not null check (quantity>0),
  unit_price_cents bigint not null check (unit_price_cents>=0),
  total_cents bigint not null check (total_cents>=0),
  fiscal_snapshot jsonb not null check (jsonb_typeof(fiscal_snapshot)='object'),
  created_at timestamptz not null default now(),
  constraint fiscal_items_document_fk foreign key (organization_id,store_id,fiscal_document_id)
    references public.fiscal_documents(organization_id,store_id,id) on delete cascade,
  constraint fiscal_items_order_item_fk foreign key (organization_id,store_id,order_item_id)
    references public.order_items(organization_id,store_id,id) on delete restrict,
  constraint fiscal_items_product_fk foreign key (organization_id,store_id,product_id)
    references public.products(organization_id,store_id,id) on delete restrict,
  constraint fiscal_items_line_unique unique (fiscal_document_id,line_number)
);
create index fiscal_items_document_idx on public.fiscal_items(organization_id,store_id,fiscal_document_id,line_number);

create table public.fiscal_document_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  fiscal_document_id uuid not null,
  from_status text,
  to_status text not null check (to_status in ('draft','queued','processing','authorized','rejected','cancelled','contingency')),
  event_type text not null check (char_length(trim(event_type)) between 2 and 80),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  provider_code text,
  message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fiscal_document_history_document_fk foreign key (organization_id,store_id,fiscal_document_id)
    references public.fiscal_documents(organization_id,store_id,id) on delete cascade,
  constraint fiscal_document_history_idem_unique unique (organization_id,idempotency_key)
);
create index fiscal_document_history_document_idx on public.fiscal_document_history(organization_id,store_id,fiscal_document_id,created_at,id);

alter table public.integrations enable row level security;
alter table public.fiscal_profiles enable row level security;
alter table public.product_fiscal_profiles enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_items enable row level security;
alter table public.fiscal_document_history enable row level security;

revoke all on table public.integrations,public.fiscal_profiles,public.product_fiscal_profiles,public.fiscal_documents,public.fiscal_items,public.fiscal_document_history from anon,authenticated;
grant select,insert,update,delete on table public.integrations,public.fiscal_profiles,public.product_fiscal_profiles,public.fiscal_documents,public.fiscal_items,public.fiscal_document_history to service_role;

create policy integrations_browser_deny on public.integrations for all to anon,authenticated using(false) with check(false);
create policy fiscal_profiles_browser_deny on public.fiscal_profiles for all to anon,authenticated using(false) with check(false);
create policy product_fiscal_profiles_browser_deny on public.product_fiscal_profiles for all to anon,authenticated using(false) with check(false);
create policy fiscal_documents_browser_deny on public.fiscal_documents for all to anon,authenticated using(false) with check(false);
create policy fiscal_items_browser_deny on public.fiscal_items for all to anon,authenticated using(false) with check(false);
create policy fiscal_document_history_browser_deny on public.fiscal_document_history for all to anon,authenticated using(false) with check(false);

create or replace function private.prevent_fiscal_history_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'fiscal document history is immutable'; end; $$;
revoke all on function private.prevent_fiscal_history_mutation() from public,anon,authenticated;
create trigger fiscal_document_history_immutable before update or delete on public.fiscal_document_history
for each row execute function private.prevent_fiscal_history_mutation();

create or replace function private.prevent_fiscal_item_mutation_after_queue()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_status text;
begin
  if tg_op='DELETE' then
    select d.status into v_status from public.fiscal_documents d where d.id=old.fiscal_document_id;
  else
    select d.status into v_status from public.fiscal_documents d where d.id=new.fiscal_document_id;
  end if;
  if v_status is distinct from 'draft' then raise exception 'fiscal items are immutable after document is queued'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.prevent_fiscal_item_mutation_after_queue() from public,anon,authenticated;
create trigger fiscal_items_lock_after_queue before update or delete on public.fiscal_items
for each row execute function private.prevent_fiscal_item_mutation_after_queue();
