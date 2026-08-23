-- PedeAqui — agendador interno seguro para campanhas e retenção [PA-C01-010/013]

create extension if not exists pg_net with schema extensions;

do $$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id from vault.secrets where name='pedeaqui_internal_campaign_messages_token';
  if v_secret_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'pedeaqui_internal_campaign_messages_token',
      'Token rotativo do agendador interno de campanhas',
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      encode(extensions.gen_random_bytes(32),'hex'),
      'pedeaqui_internal_campaign_messages_token',
      'Token rotativo do agendador interno de campanhas',
      null
    );
  end if;

  select id into v_secret_id from vault.secrets where name='pedeaqui_internal_route_retention_token';
  if v_secret_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'pedeaqui_internal_route_retention_token',
      'Token rotativo do agendador interno de retenção de rotas',
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      encode(extensions.gen_random_bytes(32),'hex'),
      'pedeaqui_internal_route_retention_token',
      'Token rotativo do agendador interno de retenção de rotas',
      null
    );
  end if;
end $$;

create or replace function public.authorize_internal_job_internal(p_job_key text,p_token text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when p_token is null or length(p_token)<>64 then false
    else coalesce(
      extensions.digest(p_token,'sha256') = extensions.digest(
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name=case p_job_key
            when 'campaign_messages' then 'pedeaqui_internal_campaign_messages_token'
            when 'route_retention' then 'pedeaqui_internal_route_retention_token'
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
revoke all on function public.authorize_internal_job_internal(text,text) from public,anon,authenticated;
grant execute on function public.authorize_internal_job_internal(text,text) to service_role;

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
    ('route_retention','/api/internal/route-retention','pedeaqui_internal_route_retention_token')
  ) as x(job_key,path,secret_name)
  where x.job_key=p_job_key;

  if v_path is null then raise exception 'unknown internal job'; end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name=v_secret_name
  limit 1;
  if v_token is null then raise exception 'internal job token unavailable'; end if;

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

select cron.unschedule('pedeaqui-campaign-message-recovery')
where exists(select 1 from cron.job where jobname='pedeaqui-campaign-message-recovery');
select cron.unschedule('pedeaqui-route-retention')
where exists(select 1 from cron.job where jobname='pedeaqui-route-retention');

select cron.schedule(
  'pedeaqui-campaign-message-recovery',
  '*/5 * * * *',
  $job$select private.invoke_internal_job('campaign_messages');$job$
);
select cron.schedule(
  'pedeaqui-route-retention',
  '17 3 * * *',
  $job$select private.invoke_internal_job('route_retention');$job$
);
