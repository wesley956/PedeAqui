-- PedeAqui — [329]
-- Notificações transacionais de pedido via WhatsApp, desacopladas da state machine.
-- A fila reage apenas a domain_events já persistidos; falhas do canal nunca alteram o pedido.

alter table public.store_conversation_settings
  add column if not exists order_notifications_enabled boolean not null default false,
  add column if not exists notify_order_received boolean not null default true,
  add column if not exists notify_payment_paid boolean not null default false,
  add column if not exists notify_pickup_ready boolean not null default true,
  add column if not exists notify_out_for_delivery boolean not null default true,
  add column if not exists notify_delivered boolean not null default false;

create table if not exists public.order_notification_contexts (
  order_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  tracking_access_token text not null check (char_length(tracking_access_token) between 32 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_notification_contexts_order_same_store_fk
    foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade
);

alter table public.order_notification_contexts enable row level security;
revoke all on table public.order_notification_contexts from public, anon, authenticated;
grant select, insert, update, delete on table public.order_notification_contexts to service_role;

comment on table public.order_notification_contexts is
  'Contexto interno para links transacionais de acompanhamento. Nunca expor tracking_access_token em consultas públicas, logs ou auditoria.';

create table if not exists public.order_whatsapp_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid not null,
  domain_event_id uuid,
  notification_type text not null check (notification_type in (
    'order_received','payment_paid','pickup_ready','out_for_delivery','delivered'
  )),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  message_id uuid,
  last_error_code text,
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_whatsapp_notifications_order_same_store_fk
    foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade,
  constraint order_whatsapp_notifications_event_fk
    foreign key (domain_event_id) references public.domain_events(id) on delete set null,
  constraint order_whatsapp_notifications_message_fk
    foreign key (organization_id, store_id, message_id)
    references public.messages (organization_id, store_id, id) on delete set null,
  constraint order_whatsapp_notifications_once_per_type
    unique (organization_id, order_id, notification_type)
);

create index if not exists order_whatsapp_notifications_claim_idx
  on public.order_whatsapp_notifications (status, available_at, created_at)
  where status in ('pending','failed','processing');
create index if not exists order_whatsapp_notifications_order_idx
  on public.order_whatsapp_notifications (organization_id, store_id, order_id, created_at);

alter table public.order_whatsapp_notifications enable row level security;
revoke all on table public.order_whatsapp_notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.order_whatsapp_notifications to service_role;

create or replace function public.order_notification_store_context_internal(
  p_order_id uuid,
  p_tracking_access_token text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if char_length(coalesce(p_tracking_access_token,'')) not between 32 and 128 then
    raise exception 'invalid tracking access token';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then raise exception 'order not found'; end if;

  insert into public.order_notification_contexts (
    order_id, organization_id, store_id, tracking_access_token, updated_at
  ) values (
    v_order.id, v_order.organization_id, v_order.store_id, p_tracking_access_token, now()
  )
  on conflict (order_id) do update set
    tracking_access_token = excluded.tracking_access_token,
    updated_at = now();
end;
$$;
revoke all on function public.order_notification_store_context_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.order_notification_store_context_internal(uuid,text) to service_role;

create or replace function public.conversation_resolve_outbound_internal(
  p_store_id uuid,
  p_phone_normalized text,
  p_contact_name text default null,
  p_customer_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_contact public.contacts%rowtype;
  v_conversation public.conversations%rowtype;
  v_phone text := regexp_replace(coalesce(p_phone_normalized,''), '[^0-9]', '', 'g');
begin
  if v_phone !~ '^[0-9]{8,20}$' then raise exception 'invalid whatsapp recipient'; end if;

  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  select * into v_contact
  from public.contacts
  where organization_id = v_store.organization_id
    and store_id = v_store.id
    and channel = 'whatsapp'
    and (phone_normalized = v_phone or external_id = v_phone)
  order by case when phone_normalized = v_phone then 0 else 1 end, created_at
  limit 1
  for update;

  if v_contact.id is null then
    begin
      insert into public.contacts (
        organization_id, store_id, channel, external_id, phone_normalized, name, customer_id, updated_at
      ) values (
        v_store.organization_id, v_store.id, 'whatsapp', v_phone, v_phone,
        nullif(left(trim(coalesce(p_contact_name,'')),120),''), p_customer_id, now()
      ) returning * into v_contact;
    exception when unique_violation then
      select * into v_contact
      from public.contacts
      where organization_id = v_store.organization_id
        and store_id = v_store.id
        and channel = 'whatsapp'
        and (phone_normalized = v_phone or external_id = v_phone)
      order by created_at
      limit 1
      for update;
    end;
  end if;

  if v_contact.id is null then raise exception 'contact resolution failed'; end if;

  update public.contacts set
    external_id = coalesce(external_id, v_phone),
    phone_normalized = coalesce(phone_normalized, v_phone),
    name = coalesce(name, nullif(left(trim(coalesce(p_contact_name,'')),120),'')),
    customer_id = coalesce(customer_id, p_customer_id),
    updated_at = now()
  where id = v_contact.id
  returning * into v_contact;

  select * into v_conversation
  from public.conversations
  where organization_id = v_store.organization_id
    and store_id = v_store.id
    and contact_id = v_contact.id
    and channel = 'whatsapp'
    and status <> 'closed'
  order by opened_at desc
  limit 1
  for update;

  if v_conversation.id is null then
    begin
      insert into public.conversations (
        organization_id, store_id, contact_id, channel, status, opened_at, updated_at
      ) values (
        v_store.organization_id, v_store.id, v_contact.id, 'whatsapp', 'bot', now(), now()
      ) returning * into v_conversation;
    exception when unique_violation then
      select * into v_conversation
      from public.conversations
      where organization_id = v_store.organization_id
        and store_id = v_store.id
        and contact_id = v_contact.id
        and channel = 'whatsapp'
        and status <> 'closed'
      order by opened_at desc
      limit 1;
    end;
  end if;

  if v_conversation.id is null then raise exception 'conversation resolution failed'; end if;

  return jsonb_build_object(
    'conversation_id', v_conversation.id,
    'contact_id', v_contact.id,
    'external_id', v_contact.external_id
  );
end;
$$;
revoke all on function public.conversation_resolve_outbound_internal(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.conversation_resolve_outbound_internal(uuid,text,text,uuid) to service_role;

create or replace function private.enqueue_order_whatsapp_notification_from_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type text;
  v_fulfillment_type text;
begin
  if new.entity_type <> 'order' or new.entity_id is null then return new; end if;

  v_type := case new.event_type
    when 'order.created' then 'order_received'
    when 'payment.paid' then 'payment_paid'
    when 'production.ready' then 'pickup_ready'
    when 'fulfillment.out_for_delivery' then 'out_for_delivery'
    when 'fulfillment.delivered' then 'delivered'
    else null
  end;
  if v_type is null then return new; end if;

  if v_type = 'pickup_ready' then
    select fulfillment_type into v_fulfillment_type from public.orders where id = new.entity_id;
    if v_fulfillment_type is distinct from 'pickup' then return new; end if;
  end if;

  insert into public.order_whatsapp_notifications (
    organization_id, store_id, order_id, domain_event_id, notification_type
  ) values (
    new.organization_id, new.store_id, new.entity_id, new.id, v_type
  )
  on conflict (organization_id, order_id, notification_type) do nothing;

  return new;
end;
$$;
revoke all on function private.enqueue_order_whatsapp_notification_from_event() from public, anon, authenticated;

drop trigger if exists domain_events_enqueue_order_whatsapp_notification on public.domain_events;
create trigger domain_events_enqueue_order_whatsapp_notification
after insert on public.domain_events
for each row execute function private.enqueue_order_whatsapp_notification_from_event();

create or replace function public.order_notification_claim_internal(
  p_worker_id text,
  p_limit integer default 20
) returns setof public.order_whatsapp_notifications
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if char_length(trim(coalesce(p_worker_id,''))) not between 3 and 120 then raise exception 'invalid worker id'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid claim limit'; end if;

  return query
  with candidates as (
    select q.id
    from public.order_whatsapp_notifications q
    where (
      (q.status in ('pending','failed') and q.available_at <= now())
      or (q.status = 'processing' and q.locked_until < now())
    )
    order by q.available_at, q.created_at, q.id
    for update skip locked
    limit p_limit
  )
  update public.order_whatsapp_notifications q set
    status = 'processing',
    attempts = q.attempts + 1,
    locked_by = trim(p_worker_id),
    locked_until = now() + interval '2 minutes',
    updated_at = now()
  from candidates c
  where q.id = c.id
  returning q.*;
end;
$$;
revoke all on function public.order_notification_claim_internal(text,integer) from public, anon, authenticated;
grant execute on function public.order_notification_claim_internal(text,integer) to service_role;

create or replace function public.order_notification_finish_internal(
  p_notification_id uuid,
  p_worker_id text,
  p_status text,
  p_message_id uuid default null,
  p_error_code text default null,
  p_error_message text default null,
  p_retry_after_seconds integer default null
) returns public.order_whatsapp_notifications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.order_whatsapp_notifications%rowtype;
  v_retry integer;
begin
  if p_status not in ('sent','failed','skipped') then raise exception 'invalid notification result'; end if;
  v_retry := least(greatest(coalesce(p_retry_after_seconds, 60), 30), 86400);

  update public.order_whatsapp_notifications set
    status = p_status,
    message_id = coalesce(p_message_id, message_id),
    last_error_code = case when p_status = 'sent' then null else nullif(left(coalesce(p_error_code,''),120),'') end,
    last_error_message = case when p_status = 'sent' then null else nullif(left(coalesce(p_error_message,''),500),'') end,
    sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
    available_at = case when p_status = 'failed' then now() + make_interval(secs => v_retry) else available_at end,
    locked_by = null,
    locked_until = null,
    updated_at = now()
  where id = p_notification_id
    and status = 'processing'
    and locked_by = trim(p_worker_id)
  returning * into v_row;

  if v_row.id is null then raise exception 'notification lease unavailable'; end if;
  return v_row;
end;
$$;
revoke all on function public.order_notification_finish_internal(uuid,text,text,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.order_notification_finish_internal(uuid,text,text,uuid,text,text,integer) to service_role;
