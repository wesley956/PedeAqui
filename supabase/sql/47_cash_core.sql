-- PedeAqui — Milestone 17 [164]–[174]
-- Caixa operacional: caixas configuráveis, sessões/turnos e ledger imutável.

insert into public.permissions (key, description) values
  ('cash.view', 'Visualizar caixas, sessões, movimentos e conferência'),
  ('cash.manage', 'Configurar caixas da unidade'),
  ('cash.open', 'Abrir sessão de caixa'),
  ('cash.supply', 'Realizar suprimento de caixa'),
  ('cash.withdraw', 'Realizar sangria de caixa'),
  ('cash.close', 'Conferir e fechar sessão de caixa')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('cash.view','cash.manage','cash.open','cash.supply','cash.withdraw','cash.close')
where r.key in ('owner','manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('cash.view','cash.open','cash.supply','cash.withdraw','cash.close')
where r.key = 'cashier'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'cash.view'
where r.key = 'financial'
on conflict do nothing;

create or replace function private.grant_cash_permissions_for_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.key in ('owner','manager') then
    insert into public.role_permissions (role_id, permission_id)
    select new.id, p.id from public.permissions p
    where p.key in ('cash.view','cash.manage','cash.open','cash.supply','cash.withdraw','cash.close')
    on conflict do nothing;
  elsif new.key = 'cashier' then
    insert into public.role_permissions (role_id, permission_id)
    select new.id, p.id from public.permissions p
    where p.key in ('cash.view','cash.open','cash.supply','cash.withdraw','cash.close')
    on conflict do nothing;
  elsif new.key = 'financial' then
    insert into public.role_permissions (role_id, permission_id)
    select new.id, p.id from public.permissions p
    where p.key = 'cash.view'
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.grant_cash_permissions_for_role() from public, anon, authenticated;

drop trigger if exists roles_grant_cash_permissions on public.roles;
create trigger roles_grant_cash_permissions
after insert on public.roles
for each row execute function private.grant_cash_permissions_for_role();

create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_registers_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint cash_registers_org_store_id_unique unique (organization_id, store_id, id),
  constraint cash_registers_store_code_unique unique (store_id, code)
);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  cash_register_id uuid not null,
  status text not null default 'open' check (status in ('open','closed')),
  opening_balance_cents bigint not null check (opening_balance_cents >= 0),
  expected_cash_cents_snapshot bigint check (expected_cash_cents_snapshot is null or expected_cash_cents_snapshot >= 0),
  counted_cash_cents bigint check (counted_cash_cents is null or counted_cash_cents >= 0),
  difference_cents bigint,
  open_idempotency_key text not null check (char_length(open_idempotency_key) between 8 and 240),
  close_idempotency_key text check (close_idempotency_key is null or char_length(close_idempotency_key) between 8 and 240),
  opening_note text check (opening_note is null or char_length(opening_note) <= 500),
  closing_note text check (closing_note is null or char_length(closing_note) <= 500),
  opened_by uuid not null references auth.users(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_sessions_store_same_org_fk foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade,
  constraint cash_sessions_register_same_store_fk foreign key (organization_id, store_id, cash_register_id)
    references public.cash_registers (organization_id, store_id, id) on delete restrict,
  constraint cash_sessions_org_store_id_unique unique (organization_id, store_id, id),
  constraint cash_sessions_open_idem_unique unique (organization_id, open_idempotency_key),
  constraint cash_sessions_close_idem_unique unique (organization_id, close_idempotency_key),
  constraint cash_sessions_close_consistency check (
    (status = 'open' and closed_at is null and closed_by is null and counted_cash_cents is null and difference_cents is null and expected_cash_cents_snapshot is null)
    or
    (status = 'closed' and closed_at is not null and closed_by is not null and counted_cash_cents is not null and difference_cents is not null and expected_cash_cents_snapshot is not null)
  )
);

create unique index if not exists cash_sessions_one_open_per_register_idx
  on public.cash_sessions (cash_register_id)
  where status = 'open';
create unique index if not exists cash_sessions_one_open_per_operator_store_idx
  on public.cash_sessions (store_id, opened_by)
  where status = 'open';

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  cash_session_id uuid not null,
  movement_type text not null check (movement_type in ('opening','sale','supply','withdrawal','refund','adjustment')),
  direction text not null check (direction in ('in','out')),
  amount_cents bigint not null check (amount_cents > 0),
  payment_id uuid,
  order_id uuid,
  reference_movement_id uuid,
  reason text check (reason is null or char_length(trim(reason)) between 3 and 500),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 240),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cash_movements_session_same_store_fk foreign key (organization_id, store_id, cash_session_id)
    references public.cash_sessions (organization_id, store_id, id) on delete restrict,
  constraint cash_movements_payment_same_store_fk foreign key (organization_id, store_id, payment_id)
    references public.payments (organization_id, store_id, id) on delete restrict,
  constraint cash_movements_order_same_store_fk foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete restrict,
  constraint cash_movements_org_store_id_unique unique (organization_id, store_id, id),
  constraint cash_movements_reference_same_store_fk foreign key (organization_id, store_id, reference_movement_id)
    references public.cash_movements(organization_id, store_id, id) on delete restrict,
  constraint cash_movements_org_idem_unique unique (organization_id, idempotency_key),
  constraint cash_movements_type_direction_check check (
    (movement_type in ('opening','sale','supply') and direction = 'in')
    or (movement_type in ('withdrawal','refund') and direction = 'out')
    or movement_type = 'adjustment'
  ),
  constraint cash_movements_payment_requirement check (
    (movement_type in ('sale','refund') and payment_id is not null and order_id is not null)
    or (movement_type not in ('sale','refund') and payment_id is null and order_id is null)
  )
);

create unique index if not exists cash_movements_payment_type_unique_idx
  on public.cash_movements (payment_id, movement_type)
  where payment_id is not null and movement_type in ('sale','refund');
create index if not exists cash_registers_store_active_idx
  on public.cash_registers (organization_id, store_id, active, code);
create index if not exists cash_sessions_store_status_idx
  on public.cash_sessions (organization_id, store_id, status, opened_at desc);
create index if not exists cash_sessions_operator_idx
  on public.cash_sessions (organization_id, store_id, opened_by, status);
create index if not exists cash_movements_session_created_idx
  on public.cash_movements (organization_id, store_id, cash_session_id, created_at, id);
create index if not exists cash_movements_payment_idx
  on public.cash_movements (organization_id, store_id, payment_id)
  where payment_id is not null;

alter table public.cash_registers enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

revoke all on table public.cash_registers, public.cash_sessions, public.cash_movements from anon, authenticated;
grant select on table public.cash_registers, public.cash_sessions, public.cash_movements to authenticated;
grant select, insert, update, delete on table public.cash_registers, public.cash_sessions, public.cash_movements to service_role;

create policy cash_registers_view on public.cash_registers for select to authenticated
using (private.has_permission(organization_id, store_id, 'cash.view'));
create policy cash_sessions_view on public.cash_sessions for select to authenticated
using (private.has_permission(organization_id, store_id, 'cash.view'));
create policy cash_movements_view on public.cash_movements for select to authenticated
using (private.has_permission(organization_id, store_id, 'cash.view'));

create or replace function private.prevent_cash_movement_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'cash movement ledger is immutable';
end;
$$;
revoke all on function private.prevent_cash_movement_mutation() from public, anon, authenticated;

drop trigger if exists cash_movements_immutable on public.cash_movements;
create trigger cash_movements_immutable
before update or delete on public.cash_movements
for each row execute function private.prevent_cash_movement_mutation();

create or replace function private.cash_expected_balance(p_session_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(case when m.direction='in' then m.amount_cents else -m.amount_cents end),0)::bigint
  from public.cash_movements m
  where m.cash_session_id = p_session_id;
$$;
revoke all on function private.cash_expected_balance(uuid) from public, anon, authenticated;
grant execute on function private.cash_expected_balance(uuid) to service_role;

create or replace function private.cash_insert_movement(
  p_session_id uuid,
  p_type text,
  p_direction text,
  p_amount_cents bigint,
  p_idempotency_key text,
  p_reason text default null,
  p_payment_id uuid default null,
  p_order_id uuid default null,
  p_reference_movement_id uuid default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.cash_movements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_existing public.cash_movements%rowtype;
  v_result public.cash_movements%rowtype;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'invalid cash movement amount'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 240 then raise exception 'invalid cash movement idempotency key'; end if;
  if p_type not in ('opening','sale','supply','withdrawal','refund','adjustment') then raise exception 'invalid cash movement type'; end if;
  if p_direction not in ('in','out') then raise exception 'invalid cash movement direction'; end if;

  select * into v_session from public.cash_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'cash session not found'; end if;
  if v_session.status <> 'open' then raise exception 'cash session is closed'; end if;
  if p_direction='out' and p_amount_cents > private.cash_expected_balance(v_session.id) then
    raise exception 'cash outflow exceeds expected balance';
  end if;

  select * into v_existing from public.cash_movements
  where organization_id=v_session.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  insert into public.cash_movements (
    organization_id, store_id, cash_session_id, movement_type, direction, amount_cents,
    payment_id, order_id, reference_movement_id, reason, idempotency_key, metadata, created_by
  ) values (
    v_session.organization_id, v_session.store_id, v_session.id, p_type, p_direction, p_amount_cents,
    p_payment_id, p_order_id, p_reference_movement_id, nullif(trim(coalesce(p_reason,'')),''),
    trim(p_idempotency_key), coalesce(p_metadata,'{}'::jsonb), p_actor_user_id
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function private.cash_insert_movement(uuid,text,text,bigint,text,text,uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.cash_insert_movement(uuid,text,text,bigint,text,text,uuid,uuid,uuid,uuid,jsonb) to service_role;
