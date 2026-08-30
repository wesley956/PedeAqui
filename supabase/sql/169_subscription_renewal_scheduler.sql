-- PedeAqui — agendamento diário da renovação de assinaturas no Supabase.
-- Mantém jobs críticos independentes do Vercel Cron e usa o token já armazenado no Vault.

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
        and active=true
    );
$$;
revoke all on function public.subscription_renewal_scheduler_ready_internal() from public,anon,authenticated;
grant execute on function public.subscription_renewal_scheduler_ready_internal() to service_role;
