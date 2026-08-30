-- PedeAqui — agendamento diário da renovação de assinaturas no Supabase.
-- Mantém jobs críticos independentes do Vercel Cron e usa o token já armazenado no Vault.
-- O job nasce pausado e só é ativado junto com a cobrança SaaS em uma transação auditada.

create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_internal_job(p_job_key text)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_path text;
  v_secret_name text;
  v_token text;
begin
  select x.path,x.secret_name into v_path,v_secret_name
  from (values
    ('campaign_messages','/api/internal/campaign-messages','pedeaqui_internal_campaign_messages_token'),
    ('route_retention','/api/internal/route-retention','pedeaqui_internal_route_retention_token'),
    ('payment_reconciliation','/api/internal/payment-reconciliation','pedeaqui_internal_payment_reconciliation_token'),
    ('subscription_renewals','/api/internal/subscription-renewals','pedeaqui_internal_subscription_renewals_token')
  ) as x(job_key,path,secret_name)
  where x.job_key=p_job_key;

  if v_path is null then raise exception 'unknown internal job'; end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name=v_secret_name
  limit 1;
  if v_token is null or length(v_token)<>64 then raise exception 'internal job token unavailable'; end if;

  return net.http_get(
    url=>'https://www.pedeaqui.pp.ua' || v_path,
    headers=>jsonb_build_object(
      'Authorization','Bearer ' || v_token,
      'User-Agent','PedeAqui-Supabase-Scheduler/1.0'
    ),
    timeout_milliseconds=>30000
  );
end $$;
revoke all on function private.invoke_internal_job(text) from public,anon,authenticated;

select cron.unschedule('pedeaqui-subscription-renewals')
where exists(select 1 from cron.job where jobname='pedeaqui-subscription-renewals');

select cron.schedule(
  'pedeaqui-subscription-renewals',
  '0 8 * * *',
  $job$select private.invoke_internal_job('subscription_renewals');$job$
);

-- Não dispara até o go-live explícito. Usa a API oficial do pg_cron, sem UPDATE direto na tabela interna.
select cron.alter_job(
  job_id => (select jobid from cron.job where jobname='pedeaqui-subscription-renewals' limit 1),
  active => false
);

create or replace function public.subscription_renewal_scheduler_ready_internal()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    exists(
      select 1
      from vault.decrypted_secrets
      where name='pedeaqui_internal_subscription_renewals_token'
        and decrypted_secret is not null
        and length(decrypted_secret)=64
    )
    and exists(
      select 1
      from cron.job
      where jobname='pedeaqui-subscription-renewals'
        and schedule='0 8 * * *'
        and command like '%subscription_renewals%'
    );
$$;
revoke all on function public.subscription_renewal_scheduler_ready_internal() from public,anon,authenticated;
grant execute on function public.subscription_renewal_scheduler_ready_internal() to service_role;

create or replace function public.platform_subscription_billing_set_enabled_internal(
  p_enabled boolean,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_setting public.platform_settings%rowtype;
  v_source_store_id uuid;
  v_source_organization_id uuid;
  v_provider_account_id text;
  v_source public.order_payment_provider_configs%rowtype;
  v_scheduler_ready boolean;
  v_scheduler_job_id bigint;
  v_before jsonb;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;

  select * into v_setting
  from public.platform_settings
  where key='billing.mercado_pago.source'
  for update;
  if v_setting.key is null then raise exception 'billing source setting not found'; end if;

  v_source_store_id:=nullif(v_setting.value->>'source_store_id','')::uuid;
  v_source_organization_id:=nullif(v_setting.value->>'source_organization_id','')::uuid;
  v_provider_account_id:=nullif(v_setting.value->>'provider_account_id','');
  if v_source_store_id is null or v_source_organization_id is null or v_provider_account_id is null then
    raise exception 'billing source setting incomplete';
  end if;

  select * into v_source
  from public.order_payment_provider_configs
  where organization_id=v_source_organization_id
    and store_id=v_source_store_id
    and provider='mercado_pago'
  for update;
  if v_source.id is null then raise exception 'billing Mercado Pago source not found'; end if;

  select public.subscription_renewal_scheduler_ready_internal() into v_scheduler_ready;
  select jobid into v_scheduler_job_id from cron.job where jobname='pedeaqui-subscription-renewals' limit 1;

  if p_enabled then
    if not v_scheduler_ready or v_scheduler_job_id is null then raise exception 'subscription renewal scheduler is not ready'; end if;
    if not v_source.enabled
      or v_source.environment<>'production'
      or v_source.connection_mode<>'oauth'
      or v_source.provider_account_id is distinct from v_provider_account_id
      or v_source.last_health_status is distinct from 'healthy'
      or v_source.revoked_at is not null
      or v_source.access_token_secret_id is null
      or v_source.refresh_token_secret_id is null
      or v_source.webhook_secret_id is null
    then raise exception 'billing Mercado Pago source is not healthy'; end if;
  end if;

  v_before:=jsonb_build_object(
    'enabled',coalesce((v_setting.value->>'enabled')::boolean,false),
    'scheduler_active',coalesce((select active from cron.job where jobname='pedeaqui-subscription-renewals' limit 1),false)
  );

  if v_scheduler_job_id is not null then
    perform cron.alter_job(job_id => v_scheduler_job_id, active => p_enabled);
  end if;

  update public.platform_settings
  set value=jsonb_set(value,'{enabled}',to_jsonb(p_enabled),true),
      active=true,
      updated_by=p_actor_user_id,
      updated_at=now()
  where key='billing.mercado_pago.source';

  insert into public.platform_global_audit(
    actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol
  ) values(
    p_actor_user_id,
    case when p_enabled then 'platform.subscription_billing.enabled' else 'platform.subscription_billing.paused' end,
    'platform_setting',
    null,
    v_source_organization_id,
    v_before,
    jsonb_build_object(
      'enabled',p_enabled,
      'scheduler_active',p_enabled,
      'provider_account_id',v_provider_account_id,
      'source_store_id',v_source_store_id
    ),
    trim(p_reason),
    trim(p_protocol)
  );

  return jsonb_build_object(
    'enabled',p_enabled,
    'scheduler_active',p_enabled,
    'scheduler_ready',v_scheduler_ready,
    'provider_account_id',v_provider_account_id
  );
end;
$$;
revoke all on function public.platform_subscription_billing_set_enabled_internal(boolean,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_subscription_billing_set_enabled_internal(boolean,uuid,text,text) to service_role;
