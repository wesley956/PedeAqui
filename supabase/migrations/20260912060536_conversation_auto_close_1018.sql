alter table public.store_conversation_settings
  add column if not exists conversation_auto_close_enabled boolean not null default false,
  add column if not exists bot_auto_close_minutes integer not null default 30,
  add column if not exists human_auto_close_minutes integer not null default 60,
  add column if not exists keep_open_while_order_active boolean not null default true,
  add column if not exists send_auto_close_message boolean not null default true,
  add column if not exists auto_close_message text not null default 'Como não tivemos novas mensagens, vou encerrar este atendimento por enquanto. Quando precisar, é só chamar novamente 😊';

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_bot_auto_close_minutes_check,
  add constraint store_conversation_settings_bot_auto_close_minutes_check
    check (bot_auto_close_minutes between 5 and 1440),
  drop constraint if exists store_conversation_settings_human_auto_close_minutes_check,
  add constraint store_conversation_settings_human_auto_close_minutes_check
    check (human_auto_close_minutes between 5 and 1440),
  drop constraint if exists store_conversation_settings_auto_close_message_check,
  add constraint store_conversation_settings_auto_close_message_check
    check (
      char_length(trim(auto_close_message)) between 10 and 800
      and auto_close_message !~* '(https?://|www\.)'
      and auto_close_message !~ '\{[^}]+\}'
    );

comment on column public.store_conversation_settings.conversation_auto_close_enabled is
  'Ativa o encerramento automático por inatividade nesta unidade.';
comment on column public.store_conversation_settings.bot_auto_close_minutes is
  'Tempo relativo de inatividade, em minutos, para conversas no estado bot.';
comment on column public.store_conversation_settings.human_auto_close_minutes is
  'Tempo relativo de inatividade, em minutos, para conversas no estado human.';
comment on column public.store_conversation_settings.keep_open_while_order_active is
  'Impede encerramento automático enquanto o mesmo cliente possui pedido canônico não terminal.';
comment on column public.store_conversation_settings.send_auto_close_message is
  'Tenta enviar uma mensagem transacional comum antes do fechamento; falha do provider não reabre a conversa.';

create index if not exists conversations_auto_close_candidates_idx
  on public.conversations (status, last_message_at, opened_at, store_id)
  where status in ('bot', 'human');

create or replace function public.conversation_auto_close_candidates_internal(
  p_limit integer default 100
) returns table(conversation_id uuid, expected_version bigint)
language sql
security invoker
set search_path = ''
as $$
  select c.id, c.version
  from public.conversations c
  join public.store_conversation_settings s
    on s.organization_id = c.organization_id
   and s.store_id = c.store_id
  join public.contacts ct
    on ct.organization_id = c.organization_id
   and ct.store_id = c.store_id
   and ct.id = c.contact_id
  where s.conversation_auto_close_enabled
    and c.status in ('bot', 'human')
    and coalesce(c.last_message_at, c.opened_at) <= pg_catalog.now() - pg_catalog.make_interval(
      mins => case when c.status = 'human' then s.human_auto_close_minutes else s.bot_auto_close_minutes end
    )
    and not exists (
      select 1
      from public.automation_sessions a
      where a.organization_id = c.organization_id
        and a.store_id = c.store_id
        and a.conversation_id = c.id
        and a.state = 'active'
        and (a.expires_at is null or a.expires_at > pg_catalog.now())
        and a.context ->> 'channel' = 'whatsapp_order'
        and a.step in ('order_items','order_name','order_fulfillment','order_address','order_payment','order_confirmation')
    )
    and not exists (
      select 1
      from public.messages m
      where m.organization_id = c.organization_id
        and m.store_id = c.store_id
        and m.conversation_id = c.id
        and m.direction = 'outbound'
        and m.delivery_status = 'pending'
    )
    and (
      not s.keep_open_while_order_active
      or not exists (
        select 1
        from public.orders o
        where o.organization_id = c.organization_id
          and o.store_id = c.store_id
          and o.order_status not in ('completed','rejected','canceled')
          and (
            (ct.customer_id is not null and o.customer_id = ct.customer_id)
            or (
              ct.phone_normalized is not null
              and pg_catalog.regexp_replace(o.customer_phone_snapshot, '[^0-9]', '', 'g') = ct.phone_normalized
            )
          )
      )
    )
  order by coalesce(c.last_message_at, c.opened_at), c.id
  limit greatest(1, least(coalesce(p_limit, 100), 250));
$$;

revoke all on function public.conversation_auto_close_candidates_internal(integer)
  from public, anon, authenticated;
grant execute on function public.conversation_auto_close_candidates_internal(integer)
  to service_role;

create or replace function public.conversation_auto_close_internal(
  p_conversation_id uuid,
  p_expected_version bigint
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_settings public.store_conversation_settings%rowtype;
  v_contact public.contacts%rowtype;
  v_timeout integer;
  v_message public.messages%rowtype;
begin
  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if v_conversation.id is null then
    return jsonb_build_object('closed', false, 'reason', 'not_found');
  end if;
  if v_conversation.version is distinct from p_expected_version then
    return jsonb_build_object('closed', false, 'reason', 'version_changed');
  end if;
  if v_conversation.status not in ('bot','human') then
    return jsonb_build_object('closed', false, 'reason', 'state_ineligible');
  end if;

  select * into v_settings
  from public.store_conversation_settings
  where organization_id = v_conversation.organization_id
    and store_id = v_conversation.store_id;
  if v_settings.store_id is null or not v_settings.conversation_auto_close_enabled then
    return jsonb_build_object('closed', false, 'reason', 'disabled');
  end if;

  v_timeout := case
    when v_conversation.status = 'human' then v_settings.human_auto_close_minutes
    else v_settings.bot_auto_close_minutes
  end;
  if coalesce(v_conversation.last_message_at, v_conversation.opened_at)
      > pg_catalog.now() - pg_catalog.make_interval(mins => v_timeout) then
    return jsonb_build_object('closed', false, 'reason', 'activity_changed');
  end if;

  if exists (
    select 1 from public.automation_sessions a
    where a.organization_id = v_conversation.organization_id
      and a.store_id = v_conversation.store_id
      and a.conversation_id = v_conversation.id
      and a.state = 'active'
      and (a.expires_at is null or a.expires_at > pg_catalog.now())
      and a.context ->> 'channel' = 'whatsapp_order'
      and a.step in ('order_items','order_name','order_fulfillment','order_address','order_payment','order_confirmation')
  ) then
    return jsonb_build_object('closed', false, 'reason', 'whatsapp_order_active');
  end if;

  if exists (
    select 1 from public.messages m
    where m.organization_id = v_conversation.organization_id
      and m.store_id = v_conversation.store_id
      and m.conversation_id = v_conversation.id
      and m.direction = 'outbound'
      and m.delivery_status = 'pending'
  ) then
    return jsonb_build_object('closed', false, 'reason', 'outbound_pending');
  end if;

  select * into v_contact
  from public.contacts
  where organization_id = v_conversation.organization_id
    and store_id = v_conversation.store_id
    and id = v_conversation.contact_id;

  if v_settings.keep_open_while_order_active and exists (
    select 1 from public.orders o
    where o.organization_id = v_conversation.organization_id
      and o.store_id = v_conversation.store_id
      and o.order_status not in ('completed','rejected','canceled')
      and (
        (v_contact.customer_id is not null and o.customer_id = v_contact.customer_id)
        or (
          v_contact.phone_normalized is not null
          and pg_catalog.regexp_replace(o.customer_phone_snapshot, '[^0-9]', '', 'g') = v_contact.phone_normalized
        )
      )
  ) then
    return jsonb_build_object('closed', false, 'reason', 'canonical_order_active');
  end if;

  if v_settings.send_auto_close_message
    and v_conversation.channel = 'whatsapp'
    and v_settings.whatsapp_enabled
    and v_settings.whatsapp_phone_number_id is not null
    and v_settings.access_token_secret_ref is not null
    and v_contact.external_id is not null
    and exists (
      select 1 from public.messages inbound
      where inbound.organization_id = v_conversation.organization_id
        and inbound.store_id = v_conversation.store_id
        and inbound.conversation_id = v_conversation.id
        and inbound.direction = 'inbound'
        and inbound.created_at >= pg_catalog.now() - interval '24 hours'
    )
  then
    select * into v_message
    from public.conversation_create_outbound_internal(
      v_conversation.id,
      v_settings.auto_close_message,
      'auto:conversation-close:' || v_conversation.id::text || ':' || v_conversation.version::text,
      'system',
      null
    );
  end if;

  perform public.conversation_transition_internal(
    v_conversation.id,
    'closed',
    null,
    'Encerramento automático por inatividade (' || v_timeout::text || ' min)',
    null,
    'system'
  );

  update public.automation_sessions
  set state = 'expired', context = '{}'::jsonb, expires_at = pg_catalog.now(),
      version = version + 1, updated_at = pg_catalog.now()
  where organization_id = v_conversation.organization_id
    and store_id = v_conversation.store_id
    and conversation_id = v_conversation.id
    and state in ('active','paused');

  return jsonb_build_object(
    'closed', true,
    'conversation_id', v_conversation.id,
    'organization_id', v_conversation.organization_id,
    'store_id', v_conversation.store_id,
    'previous_state', v_conversation.status,
    'timeout_minutes', v_timeout,
    'message_id', v_message.id,
    'message_body', case when v_message.id is null then null else v_message.body end,
    'recipient', case when v_message.id is null then null else v_contact.external_id end,
    'phone_number_id', case when v_message.id is null then null else v_settings.whatsapp_phone_number_id end,
    'access_token_secret_ref', case when v_message.id is null then null else v_settings.access_token_secret_ref end
  );
end;
$$;

revoke all on function public.conversation_auto_close_internal(uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.conversation_auto_close_internal(uuid,bigint)
  to service_role;

do $$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id
  from vault.secrets
  where name = 'pedeaqui_internal_conversation_auto_close_token';
  if v_secret_id is null then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'pedeaqui_internal_conversation_auto_close_token',
      'Token do agendador de encerramento automático de conversas',
      null
    );
  end if;
end $$;

create or replace function public.authorize_internal_job_internal(p_job_key text,p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_token is null or pg_catalog.length(p_token) <> 64 then false
    else coalesce(
      extensions.digest(p_token, 'sha256') = extensions.digest(
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = case p_job_key
            when 'campaign_messages' then 'pedeaqui_internal_campaign_messages_token'
            when 'route_retention' then 'pedeaqui_internal_route_retention_token'
            when 'payment_reconciliation' then 'pedeaqui_internal_payment_reconciliation_token'
            when 'subscription_renewals' then 'pedeaqui_internal_subscription_renewals_token'
            when 'ifood_order_intake' then 'pedeaqui_internal_ifood_order_intake_token'
            when 'conversation_auto_close' then 'pedeaqui_internal_conversation_auto_close_token'
            else null
          end
          limit 1
        ),
        'sha256'
      ),
      false
    )
  end
$$;
revoke all on function public.authorize_internal_job_internal(text,text)
  from public, anon, authenticated;
grant execute on function public.authorize_internal_job_internal(text,text)
  to service_role;

create or replace function private.invoke_internal_job(p_job_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_secret_name text;
  v_token text;
begin
  select x.path, x.secret_name into v_path, v_secret_name
  from (values
    ('campaign_messages','/api/internal/campaign-messages','pedeaqui_internal_campaign_messages_token'),
    ('route_retention','/api/internal/route-retention','pedeaqui_internal_route_retention_token'),
    ('payment_reconciliation','/api/internal/payment-reconciliation','pedeaqui_internal_payment_reconciliation_token'),
    ('subscription_renewals','/api/internal/subscription-renewals','pedeaqui_internal_subscription_renewals_token'),
    ('ifood_order_intake','/api/internal/ifood-order-intake','pedeaqui_internal_ifood_order_intake_token'),
    ('conversation_auto_close','/api/internal/conversation-auto-close','pedeaqui_internal_conversation_auto_close_token')
  ) as x(job_key,path,secret_name)
  where x.job_key = p_job_key;

  if v_path is null then raise exception 'unknown internal job'; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = v_secret_name limit 1;
  if v_token is null or pg_catalog.length(v_token) <> 64 then raise exception 'internal job token unavailable'; end if;

  return net.http_get(
    url => 'https://www.pedeaqui.pp.ua' || v_path,
    headers => jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'User-Agent', 'PedeAqui-Supabase-Scheduler/1.0'
    ),
    timeout_milliseconds => 25000
  );
end;
$$;
revoke all on function private.invoke_internal_job(text) from public, anon, authenticated;

select cron.unschedule('pedeaqui-conversation-auto-close')
where exists(select 1 from cron.job where jobname = 'pedeaqui-conversation-auto-close');

select cron.schedule(
  'pedeaqui-conversation-auto-close',
  '*/5 * * * *',
  $job$select private.invoke_internal_job('conversation_auto_close');$job$
);
