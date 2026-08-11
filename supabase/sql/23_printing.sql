-- PedeAqui — bloco [058]–[082]
-- Central profissional de impressão: configuração, roteamento, fila durável e Print Agent.

insert into public.permissions (key, description) values
  ('printing.view', 'Visualizar impressoras, estações e fila de impressão'),
  ('printing.manage', 'Gerenciar impressoras, estações, agentes e fila de impressão'),
  ('printing.reprint', 'Solicitar reimpressões auditadas')
on conflict (key) do update set description = excluded.description;

-- Organizações existentes: owner/manager recebem a central. Em novas organizações,
-- o bootstrap já concede todo o catálogo ao owner e tudo exceto organization.manage ao manager.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('printing.view','printing.manage','printing.reprint')
where r.key in ('owner','manager')
on conflict do nothing;

create table if not exists public.production_stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 80),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  kind text not null default 'production' check (kind in ('production','expedition','counter')),
  active boolean not null default true,
  auto_print boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_stations_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint production_stations_org_store_id_unique unique (organization_id, store_id, id),
  constraint production_stations_store_code_unique unique (store_id, code)
);

create table if not exists public.print_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 100),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  status text not null default 'unknown' check (status in ('unknown','online','offline','degraded')),
  version text,
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_agents_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint print_agents_org_store_id_unique unique (organization_id, store_id, id)
);

create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  agent_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 100),
  connection_type text not null check (connection_type in ('network','usb','bluetooth','system','cloud_agent')),
  connection_address text,
  connection_port integer check (connection_port is null or connection_port between 1 and 65535),
  paper_width_mm integer not null default 80 check (paper_width_mm in (58,80)),
  default_copies integer not null default 1 check (default_copies between 1 and 10),
  active boolean not null default true,
  status text not null default 'unknown' check (status in ('unknown','online','offline','degraded')),
  last_seen_at timestamptz,
  last_error text,
  fallback_printer_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint printers_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint printers_agent_same_store_fk foreign key (organization_id, store_id, agent_id)
    references public.print_agents (organization_id, store_id, id) on delete set null (agent_id),
  constraint printers_org_store_id_unique unique (organization_id, store_id, id),
  constraint printers_network_config check (
    connection_type <> 'network' or (connection_address is not null and connection_port is not null)
  )
);

alter table public.printers drop constraint if exists printers_fallback_same_store_fk;
alter table public.printers add constraint printers_fallback_same_store_fk
  foreign key (organization_id, store_id, fallback_printer_id)
  references public.printers (organization_id, store_id, id) on delete set null (fallback_printer_id);

create table if not exists public.station_printers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  station_id uuid not null,
  printer_id uuid not null,
  priority integer not null default 100 check (priority between 0 and 10000),
  copies integer check (copies is null or copies between 1 and 10),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (station_id, printer_id),
  constraint station_printers_station_same_store_fk foreign key (organization_id, store_id, station_id)
    references public.production_stations (organization_id, store_id, id) on delete cascade,
  constraint station_printers_printer_same_store_fk foreign key (organization_id, store_id, printer_id)
    references public.printers (organization_id, store_id, id) on delete cascade
);

create table if not exists public.product_production_stations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  product_id uuid not null,
  station_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (product_id, station_id),
  constraint product_production_stations_product_same_store_fk foreign key (organization_id, store_id, product_id)
    references public.products (organization_id, store_id, id) on delete cascade,
  constraint product_production_stations_station_same_store_fk foreign key (organization_id, store_id, station_id)
    references public.production_stations (organization_id, store_id, id) on delete cascade
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid,
  station_id uuid,
  printer_id uuid not null,
  fallback_from_printer_id uuid,
  document_type text not null check (document_type in ('kitchen','expedition','counter','receipt','custom')),
  template_key text not null,
  template_version integer not null default 1 check (template_version > 0),
  payload jsonb not null default '{}'::jsonb,
  rendered_content text,
  status text not null default 'pending' check (status in ('pending','processing','printed','failed','cancelled')),
  priority integer not null default 100 check (priority between 0 and 10000),
  copies integer not null default 1 check (copies between 1 and 10),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 300),
  available_at timestamptz not null default now(),
  claimed_by_agent_id uuid,
  lease_expires_at timestamptz,
  processing_at timestamptz,
  printed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  original_job_id uuid,
  is_reprint boolean not null default false,
  reprint_reason text,
  reprint_requested_by uuid references auth.users(id) on delete set null,
  source text not null default 'system' check (source in ('system','order_confirmed','panel','pdv','integration','reprint')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_jobs_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint print_jobs_order_same_store_fk foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade,
  constraint print_jobs_station_same_store_fk foreign key (organization_id, store_id, station_id)
    references public.production_stations (organization_id, store_id, id) on delete set null (station_id),
  constraint print_jobs_printer_same_store_fk foreign key (organization_id, store_id, printer_id)
    references public.printers (organization_id, store_id, id) on delete restrict,
  constraint print_jobs_fallback_same_store_fk foreign key (organization_id, store_id, fallback_from_printer_id)
    references public.printers (organization_id, store_id, id) on delete set null (fallback_from_printer_id),
  constraint print_jobs_agent_same_store_fk foreign key (organization_id, store_id, claimed_by_agent_id)
    references public.print_agents (organization_id, store_id, id) on delete set null (claimed_by_agent_id),
  constraint print_jobs_original_same_store_fk foreign key (organization_id, store_id, original_job_id)
    references public.print_jobs (organization_id, store_id, id) on delete set null (original_job_id),
  constraint print_jobs_org_store_id_unique unique (organization_id, store_id, id),
  constraint print_jobs_reprint_consistency check (
    (is_reprint = false and original_job_id is null and reprint_reason is null)
    or (is_reprint = true and original_job_id is not null and char_length(trim(reprint_reason)) >= 3)
  )
);

create index if not exists production_stations_store_idx on public.production_stations (organization_id, store_id, active, sort_order);
create index if not exists print_agents_store_idx on public.print_agents (organization_id, store_id, active, last_seen_at desc);
create index if not exists printers_store_idx on public.printers (organization_id, store_id, active, status);
create index if not exists printers_agent_fk_idx on public.printers (organization_id, store_id, agent_id) where agent_id is not null;
create index if not exists printers_fallback_fk_idx on public.printers (organization_id, store_id, fallback_printer_id) where fallback_printer_id is not null;
create index if not exists station_printers_store_idx on public.station_printers (organization_id, store_id, station_id, active, priority);
create index if not exists station_printers_printer_fk_idx on public.station_printers (organization_id, store_id, printer_id);
create index if not exists product_production_stations_station_idx on public.product_production_stations (organization_id, store_id, station_id, product_id);
create index if not exists print_jobs_queue_idx on public.print_jobs (store_id, status, available_at, priority, created_at) where status in ('pending','processing','failed');
create index if not exists print_jobs_order_idx on public.print_jobs (organization_id, store_id, order_id, created_at) where order_id is not null;
create index if not exists print_jobs_printer_idx on public.print_jobs (organization_id, store_id, printer_id, created_at desc);
create index if not exists print_jobs_station_idx on public.print_jobs (organization_id, store_id, station_id, created_at desc) where station_id is not null;
create index if not exists print_jobs_agent_idx on public.print_jobs (organization_id, store_id, claimed_by_agent_id, lease_expires_at) where claimed_by_agent_id is not null;
create index if not exists print_jobs_original_idx on public.print_jobs (organization_id, store_id, original_job_id) where original_job_id is not null;
create index if not exists print_jobs_fallback_idx on public.print_jobs (organization_id, store_id, fallback_from_printer_id) where fallback_from_printer_id is not null;

alter table public.production_stations enable row level security;
alter table public.print_agents enable row level security;
alter table public.printers enable row level security;
alter table public.station_printers enable row level security;
alter table public.product_production_stations enable row level security;
alter table public.print_jobs enable row level security;

-- Configuração e fila podem ser vistas por usuários autorizados. Mudanças sensíveis são server-side.
revoke all on table public.production_stations, public.printers, public.station_printers, public.product_production_stations, public.print_jobs from anon, authenticated;
grant select on table public.production_stations, public.printers, public.station_printers, public.product_production_stations, public.print_jobs to authenticated;
grant select, insert, update, delete on table public.production_stations, public.printers, public.station_printers, public.product_production_stations, public.print_jobs to service_role;

-- Hash do token do agente nunca é exposto ao usuário autenticado pelo Data API.
revoke all on table public.print_agents from anon, authenticated;
grant select, insert, update, delete on table public.print_agents to service_role;

create policy production_stations_view on public.production_stations for select to authenticated
using (private.has_permission(organization_id, store_id, 'printing.view'));
create policy printers_view on public.printers for select to authenticated
using (private.has_permission(organization_id, store_id, 'printing.view'));
create policy station_printers_view on public.station_printers for select to authenticated
using (private.has_permission(organization_id, store_id, 'printing.view'));
create policy product_production_stations_view on public.product_production_stations for select to authenticated
using (private.has_permission(organization_id, store_id, 'printing.view'));
create policy print_jobs_view on public.print_jobs for select to authenticated
using (private.has_permission(organization_id, store_id, 'printing.view'));
create policy print_agents_deny_direct on public.print_agents as restrictive for all to anon, authenticated using (false) with check (false);

-- Snapshot JSON de itens para um ticket. Produção filtra por estação; expedição/balcão usam todos.
create or replace function private.print_order_items_payload(p_order_id uuid, p_station_id uuid, p_filter_station boolean)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_item_id', oi.id,
      'product_id', oi.product_id,
      'name', oi.product_name_snapshot,
      'quantity', oi.quantity,
      'note', oi.note,
      'unit_total_cents', oi.unit_total_price_cents,
      'line_total_cents', oi.line_total_cents,
      'modifiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'group', oim.group_name_snapshot,
          'name', oim.modifier_name_snapshot,
          'unit_price_cents', oim.unit_price_cents
        ) order by oim.created_at)
        from public.order_item_modifiers oim
        where oim.order_item_id = oi.id
      ), '[]'::jsonb)
    ) order by oi.created_at
  ), '[]'::jsonb)
  from public.order_items oi
  where oi.order_id = p_order_id
    and (
      not p_filter_station
      or exists (
        select 1 from public.product_production_stations pps
        where pps.organization_id = oi.organization_id
          and pps.store_id = oi.store_id
          and pps.product_id = oi.product_id
          and pps.station_id = p_station_id
      )
    );
$$;
revoke all on function private.print_order_items_payload(uuid,uuid,boolean) from public, anon, authenticated;

create or replace function private.enqueue_order_print_jobs(p_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_route record;
  v_items jsonb;
  v_payload jsonb;
  v_document_type text;
  v_count integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.order_status <> 'confirmed' then return 0; end if;

  for v_route in
    select
      s.id as station_id, s.name as station_name, s.code as station_code, s.kind,
      sp.printer_id, coalesce(sp.copies, p.default_copies) as copies, sp.priority,
      p.paper_width_mm, p.name as printer_name
    from public.production_stations s
    join public.station_printers sp
      on sp.organization_id = s.organization_id and sp.store_id = s.store_id and sp.station_id = s.id
    join public.printers p
      on p.organization_id = sp.organization_id and p.store_id = sp.store_id and p.id = sp.printer_id
    where s.organization_id = v_order.organization_id
      and s.store_id = v_order.store_id
      and s.active and s.auto_print and sp.active and p.active
    order by s.sort_order, sp.priority, p.name
  loop
    v_items := private.print_order_items_payload(v_order.id, v_route.station_id, v_route.kind = 'production');
    if v_route.kind = 'production' and jsonb_array_length(v_items) = 0 then continue; end if;

    v_document_type := case v_route.kind when 'production' then 'kitchen' when 'expedition' then 'expedition' else 'counter' end;
    v_payload := jsonb_build_object(
      'order', jsonb_build_object(
        'id', v_order.id,
        'display_number', v_order.display_number,
        'channel', v_order.channel,
        'fulfillment_type', v_order.fulfillment_type,
        'customer_name', v_order.customer_name_snapshot,
        'customer_phone', v_order.customer_phone_snapshot,
        'address', jsonb_build_object(
          'street', v_order.address_street_snapshot,
          'number', v_order.address_number_snapshot,
          'complement', v_order.address_complement_snapshot,
          'district', v_order.address_district_snapshot,
          'city', v_order.address_city_snapshot,
          'state', v_order.address_state_snapshot,
          'reference', v_order.address_reference_snapshot
        ),
        'subtotal_cents', v_order.subtotal_cents,
        'discount_cents', v_order.discount_cents,
        'delivery_fee_cents', v_order.delivery_fee_cents,
        'total_cents', v_order.total_cents,
        'payment_method', v_order.payment_method_snapshot,
        'cash_change_for_cents', v_order.cash_change_for_cents,
        'created_at', v_order.created_at,
        'confirmed_at', v_order.confirmed_at
      ),
      'station', jsonb_build_object('id', v_route.station_id, 'name', v_route.station_name, 'code', v_route.station_code, 'kind', v_route.kind),
      'items', v_items
    );

    insert into public.print_jobs (
      organization_id, store_id, order_id, station_id, printer_id,
      document_type, template_key, template_version, payload,
      priority, copies, idempotency_key, source
    ) values (
      v_order.organization_id, v_order.store_id, v_order.id, v_route.station_id, v_route.printer_id,
      v_document_type, 'order_' || v_document_type, 1, v_payload,
      v_route.priority, v_route.copies,
      'order:' || v_order.id::text || ':confirmed:' || v_route.station_id::text || ':' || v_route.printer_id::text || ':' || v_document_type,
      'order_confirmed'
    ) on conflict (idempotency_key) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  if v_count = 0 then
    insert into public.domain_events (
      organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at
    ) values (
      v_order.organization_id, v_order.store_id, 'print.routing_missing', 'order', v_order.id,
      jsonb_build_object('display_number', v_order.display_number), 'pending', 0, now()
    );
  else
    insert into public.domain_events (
      organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at
    ) values (
      v_order.organization_id, v_order.store_id, 'print.jobs_enqueued', 'order', v_order.id,
      jsonb_build_object('display_number', v_order.display_number, 'jobs', v_count), 'pending', 0, now()
    );
  end if;

  return v_count;
end;
$$;
revoke all on function private.enqueue_order_print_jobs(uuid) from public, anon, authenticated;

create or replace function private.on_order_confirmed_enqueue_print()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.order_status is distinct from new.order_status and new.order_status = 'confirmed' then
    perform private.enqueue_order_print_jobs(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.on_order_confirmed_enqueue_print() from public, anon, authenticated;

drop trigger if exists orders_enqueue_print_on_confirm on public.orders;
create trigger orders_enqueue_print_on_confirm
after update of order_status on public.orders
for each row
when (old.order_status is distinct from new.order_status and new.order_status = 'confirmed')
execute function private.on_order_confirmed_enqueue_print();

-- Claim concorrente: lease expirado volta a ser elegível; SKIP LOCKED evita dois agentes no mesmo job.
create or replace function public.print_agent_claim_internal(p_agent_id uuid, p_limit integer default 5)
returns setof public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_agent public.print_agents%rowtype;
begin
  if p_limit < 1 or p_limit > 20 then raise exception 'invalid claim limit'; end if;
  select * into v_agent from public.print_agents where id = p_agent_id and active;
  if v_agent.id is null then raise exception 'agent unavailable'; end if;

  update public.print_jobs
  set status = 'pending', claimed_by_agent_id = null, lease_expires_at = null, processing_at = null, updated_at = now()
  where organization_id = v_agent.organization_id and store_id = v_agent.store_id
    and status = 'processing' and lease_expires_at < now();

  return query
  with candidates as (
    select j.id
    from public.print_jobs j
    join public.printers p on p.id = j.printer_id
    where j.organization_id = v_agent.organization_id
      and j.store_id = v_agent.store_id
      and j.status in ('pending','failed')
      and j.available_at <= now()
      and j.attempts < j.max_attempts
      and p.active
      and (p.agent_id is null or p.agent_id = v_agent.id)
    order by j.priority, j.created_at
    for update of j skip locked
    limit p_limit
  )
  update public.print_jobs j
  set status = 'processing', attempts = attempts + 1,
      claimed_by_agent_id = v_agent.id,
      lease_expires_at = now() + interval '90 seconds',
      processing_at = now(), last_error = null, updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function public.print_agent_claim_internal(uuid,integer) from public, anon, authenticated;
grant execute on function public.print_agent_claim_internal(uuid,integer) to service_role;

create or replace function public.print_agent_ack_internal(p_agent_id uuid, p_job_id uuid)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.print_jobs set
    status = 'printed', printed_at = now(), lease_expires_at = null,
    claimed_by_agent_id = null, last_error = null, updated_at = now()
  where id = p_job_id and status = 'processing' and claimed_by_agent_id = p_agent_id;
  if not found then raise exception 'job not owned by agent'; end if;
  return true;
end;
$$;
revoke all on function public.print_agent_ack_internal(uuid,uuid) from public, anon, authenticated;
grant execute on function public.print_agent_ack_internal(uuid,uuid) to service_role;

create or replace function public.print_agent_fail_internal(p_agent_id uuid, p_job_id uuid, p_error text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job public.print_jobs%rowtype;
  v_fallback uuid;
  v_backoff_seconds integer;
begin
  select * into v_job from public.print_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'processing' or v_job.claimed_by_agent_id <> p_agent_id then
    raise exception 'job not owned by agent';
  end if;

  select fallback_printer_id into v_fallback from public.printers where id = v_job.printer_id;
  v_backoff_seconds := least(600, 30 * (2 ^ greatest(v_job.attempts - 1, 0))::integer);

  if v_job.attempts >= v_job.max_attempts and v_fallback is not null and v_job.fallback_from_printer_id is null then
    update public.print_jobs set
      printer_id = v_fallback, fallback_from_printer_id = v_job.printer_id,
      status = 'pending', attempts = 0, available_at = now(),
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('status','pending','fallback',true,'printer_id',v_fallback);
  elsif v_job.attempts >= v_job.max_attempts then
    update public.print_jobs set
      status = 'failed', failed_at = now(), available_at = now() + interval '1 hour',
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('status','failed','fallback',false);
  else
    update public.print_jobs set
      status = 'pending', available_at = now() + make_interval(secs => v_backoff_seconds),
      claimed_by_agent_id = null, lease_expires_at = null, processing_at = null,
      last_error = left(coalesce(p_error,'print failed'),2000), updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('status','pending','retry_in_seconds',v_backoff_seconds,'fallback',false);
  end if;
end;
$$;
revoke all on function public.print_agent_fail_internal(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.print_agent_fail_internal(uuid,uuid,text) to service_role;

create or replace function public.print_agent_heartbeat_internal(
  p_agent_id uuid, p_version text, p_capabilities jsonb, p_printers jsonb
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare v_item jsonb;
begin
  update public.print_agents set
    status = 'online', version = nullif(trim(coalesce(p_version,'')),''),
    capabilities = coalesce(p_capabilities,'{}'::jsonb), last_seen_at = now(), last_error = null, updated_at = now()
  where id = p_agent_id and active;
  if not found then raise exception 'agent unavailable'; end if;

  if jsonb_typeof(coalesce(p_printers,'[]'::jsonb)) <> 'array' then raise exception 'invalid printers payload'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_printers,'[]'::jsonb)) loop
    update public.printers set
      status = case when v_item->>'status' in ('online','offline','degraded','unknown') then v_item->>'status' else status end,
      last_seen_at = now(), last_error = nullif(left(coalesce(v_item->>'error',''),2000),''), updated_at = now()
    where id = (v_item->>'id')::uuid and agent_id = p_agent_id;
  end loop;
  return true;
end;
$$;
revoke all on function public.print_agent_heartbeat_internal(uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.print_agent_heartbeat_internal(uuid,text,jsonb,jsonb) to service_role;
