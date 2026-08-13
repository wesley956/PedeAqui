-- PedeAqui — Milestone 23 [246]–[249] e [252]
-- Administração de plataforma, white-label, domínios, grupos multiunidade e catálogo de integrações.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'super_admin' check (role in ('super_admin','support')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  hostname text not null check (hostname=lower(hostname) and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'),
  status text not null default 'pending' check (status in ('pending','verified','failed','disabled')),
  verification_method text not null default 'dns_txt' check (verification_method='dns_txt'),
  verification_token text not null check (char_length(verification_token) between 16 and 128),
  provider_domain_id text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_domains_hostname_unique unique(hostname),
  constraint organization_domains_store_fk foreign key(organization_id,store_id) references public.stores(organization_id,id) on delete cascade
);
create index organization_domains_scope_idx on public.organization_domains(organization_id,store_id,status);
create index organization_domains_created_by_idx on public.organization_domains(created_by) where created_by is not null;
create index organization_domains_updated_by_idx on public.organization_domains(updated_by) where updated_by is not null;

create table public.franchise_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_groups_org_key_unique unique(organization_id,key),
  constraint franchise_groups_scope_id_unique unique(organization_id,id)
);

create table public.franchise_group_stores (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null,
  store_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(group_id,store_id),
  constraint franchise_group_stores_group_fk foreign key(organization_id,group_id) references public.franchise_groups(organization_id,id) on delete cascade,
  constraint franchise_group_stores_store_fk foreign key(organization_id,store_id) references public.stores(organization_id,id) on delete cascade
);
create index franchise_group_stores_org_store_idx on public.franchise_group_stores(organization_id,store_id,group_id);

create table public.integration_catalog (
  id uuid primary key default gen_random_uuid(),
  adapter_key text not null unique check (adapter_key ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  kind text not null check (kind in ('billing','payment','whatsapp','marketplace','fiscal','delivery','generic')),
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  description text,
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities)='array'),
  config_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(config_schema)='object'),
  docs_url text check (docs_url is null or docs_url ~ '^https://'),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.organization_domains enable row level security;
alter table public.franchise_groups enable row level security;
alter table public.franchise_group_stores enable row level security;
alter table public.integration_catalog enable row level security;
revoke all on table public.platform_admins,public.organization_domains,public.franchise_groups,public.franchise_group_stores,public.integration_catalog from anon,authenticated;
grant select,insert,update,delete on table public.platform_admins,public.organization_domains,public.franchise_groups,public.franchise_group_stores,public.integration_catalog to service_role;
create policy platform_admins_browser_deny on public.platform_admins for all to anon,authenticated using(false) with check(false);
create policy organization_domains_browser_deny on public.organization_domains for all to anon,authenticated using(false) with check(false);
create policy franchise_groups_browser_deny on public.franchise_groups for all to anon,authenticated using(false) with check(false);
create policy franchise_group_stores_browser_deny on public.franchise_group_stores for all to anon,authenticated using(false) with check(false);
create policy integration_catalog_browser_deny on public.integration_catalog for all to anon,authenticated using(false) with check(false);

insert into public.plans(key,name,description,position) values
  ('essential','Essencial','Operação essencial de cardápio, pedidos, PDV, clientes e caixa',10),
  ('professional','Profissional','Operação avançada com CRM, salão, entregas e integrações',20),
  ('management','Gestão','Gestão completa com estoque, compras, financeiro, fiscal e escala',30)
on conflict(key) do update set name=excluded.name,description=excluded.description,position=excluded.position;

insert into public.features(key,name,description,value_type) values
  ('branding.white_label','White-label','Ocultar marca PedeAqui e aplicar identidade da organização','boolean'),
  ('domains.custom','Domínios personalizados','Quantidade de domínios personalizados verificados','count'),
  ('scale.multiunit','Multiunidade avançada','Grupos de unidades/franquias e visões consolidadas','boolean'),
  ('scale.central_purchasing','Central de compras','Consolidação de necessidades de compra entre unidades','boolean'),
  ('scale.bi','BI multiunidade','Indicadores consolidados da organização/grupo','boolean'),
  ('integrations.marketplace','Marketplace de integrações','Catálogo e instalação de adapters aprovados','boolean')
on conflict(key) do update set name=excluded.name,description=excluded.description,value_type=excluded.value_type;

insert into public.plan_features(plan_id,feature_id,enabled,limit_value)
select p.id,f.id,true,
  case when f.key='domains.custom' then case p.key when 'professional' then 1 when 'management' then 10 else 0 end else null end
from public.plans p cross join public.features f
where (p.key='professional' and f.key in ('integrations.marketplace','domains.custom'))
   or (p.key='management' and f.key in ('branding.white_label','domains.custom','scale.multiunit','scale.central_purchasing','scale.bi','integrations.marketplace'))
on conflict(plan_id,feature_id) do update set enabled=excluded.enabled,limit_value=excluded.limit_value;

create or replace function public.platform_admin_check_internal(p_user_id uuid)
returns table(role text) language sql stable security invoker set search_path='' as $$
  select pa.role from public.platform_admins pa where pa.user_id=p_user_id and pa.active=true;
$$;
revoke all on function public.platform_admin_check_internal(uuid) from public,anon,authenticated;
grant execute on function public.platform_admin_check_internal(uuid) to service_role;

create or replace function public.configure_branding_internal(
  p_organization_id uuid,p_white_label_enabled boolean,p_product_name text,p_logo_asset_ref text,p_favicon_asset_ref text,
  p_primary_color text,p_secondary_color text,p_support_url text,p_hide_pedeaqui_branding boolean,p_actor_user_id uuid
) returns public.organization_branding
language plpgsql security invoker set search_path='' as $$
declare v_row public.organization_branding%rowtype;
begin
  if p_hide_pedeaqui_branding and not p_white_label_enabled then raise exception 'hide branding requires white-label'; end if;
  insert into public.organization_branding(organization_id,white_label_enabled,product_name,logo_asset_ref,favicon_asset_ref,primary_color,secondary_color,support_url,hide_pedeaqui_branding,updated_by)
  values(p_organization_id,p_white_label_enabled,nullif(trim(coalesce(p_product_name,'')),''),nullif(trim(coalesce(p_logo_asset_ref,'')),''),nullif(trim(coalesce(p_favicon_asset_ref,'')),''),nullif(trim(coalesce(p_primary_color,'')),''),nullif(trim(coalesce(p_secondary_color,'')),''),nullif(trim(coalesce(p_support_url,'')),''),p_hide_pedeaqui_branding,p_actor_user_id)
  on conflict(organization_id) do update set white_label_enabled=excluded.white_label_enabled,product_name=excluded.product_name,logo_asset_ref=excluded.logo_asset_ref,favicon_asset_ref=excluded.favicon_asset_ref,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,support_url=excluded.support_url,hide_pedeaqui_branding=excluded.hide_pedeaqui_branding,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.configure_branding_internal(uuid,boolean,text,text,text,text,text,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.configure_branding_internal(uuid,boolean,text,text,text,text,text,text,boolean,uuid) to service_role;

create or replace function public.configure_domain_internal(p_organization_id uuid,p_store_id uuid,p_hostname text,p_actor_user_id uuid)
returns public.organization_domains
language plpgsql security invoker set search_path='' as $$
declare v_row public.organization_domains%rowtype; v_host text:=lower(trim(p_hostname));
begin
  if p_store_id is not null and not exists(select 1 from public.stores s where s.organization_id=p_organization_id and s.id=p_store_id) then raise exception 'store outside organization'; end if;
  insert into public.organization_domains(organization_id,store_id,hostname,verification_token,created_by,updated_by)
  values(p_organization_id,p_store_id,v_host,encode(gen_random_bytes(18),'hex'),p_actor_user_id,p_actor_user_id)
  on conflict(hostname) do update set store_id=excluded.store_id,status='pending',verification_token=encode(gen_random_bytes(18),'hex'),verified_at=null,last_error=null,updated_by=excluded.updated_by,updated_at=now()
  where public.organization_domains.organization_id=excluded.organization_id
  returning * into v_row;
  if v_row.id is null then raise exception 'domain belongs to another organization'; end if;
  return v_row;
end;
$$;
revoke all on function public.configure_domain_internal(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.configure_domain_internal(uuid,uuid,text,uuid) to service_role;

create or replace function public.mark_domain_verification_internal(p_domain_id uuid,p_status text,p_provider_domain_id text default null,p_error text default null)
returns public.organization_domains
language plpgsql security invoker set search_path='' as $$
declare v_row public.organization_domains%rowtype;
begin
  if p_status not in ('pending','verified','failed','disabled') then raise exception 'invalid domain status'; end if;
  update public.organization_domains set status=p_status,provider_domain_id=coalesce(nullif(trim(coalesce(p_provider_domain_id,'')),''),provider_domain_id),verified_at=case when p_status='verified' then now() else verified_at end,last_checked_at=now(),last_error=case when p_status='failed' then left(coalesce(p_error,'verification failed'),1000) else null end,updated_at=now() where id=p_domain_id returning * into v_row;
  if v_row.id is null then raise exception 'domain not found'; end if;
  return v_row;
end;
$$;
revoke all on function public.mark_domain_verification_internal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mark_domain_verification_internal(uuid,text,text,text) to service_role;

create or replace function public.resolve_verified_domain_internal(p_hostname text)
returns table(organization_id uuid,store_id uuid,hostname text) language sql stable security invoker set search_path='' as $$
  select d.organization_id,d.store_id,d.hostname from public.organization_domains d where d.hostname=lower(trim(p_hostname)) and d.status='verified' limit 1;
$$;
revoke all on function public.resolve_verified_domain_internal(text) from public,anon,authenticated;
grant execute on function public.resolve_verified_domain_internal(text) to service_role;
