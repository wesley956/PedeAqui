-- PedeAqui FLOW-10 / D05 — verify two independent workers claimed exactly once.
\set ON_ERROR_STOP on

select set_config('flow10.fixture_slug', :'fixture_slug', false);
select set_config('flow10.worker_a', :'worker_a', false);
select set_config('flow10.worker_b', :'worker_b', false);

do $$
declare
  v_slug text := current_setting('flow10.fixture_slug');
  v_worker_a text := current_setting('flow10.worker_a');
  v_worker_b text := current_setting('flow10.worker_b');
  v_organization_id uuid;
  v_count integer;
  v_job record;
begin
  select organization_id into v_organization_id
    from public.stores
   where slug=v_slug;
  if v_organization_id is null then
    raise exception 'concurrent fixture organization not found';
  end if;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id=v_organization_id
     and status='processing'
     and locked_by in (v_worker_a,v_worker_b)
     and attempts=1;
  if v_count <> 20 then
    raise exception 'concurrent workers expected 20 unique processing jobs, got %',v_count;
  end if;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id=v_organization_id and locked_by=v_worker_a;
  if v_count <> 10 then
    raise exception 'worker A expected 10 claims, got %',v_count;
  end if;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id=v_organization_id and locked_by=v_worker_b;
  if v_count <> 10 then
    raise exception 'worker B expected 10 claims, got %',v_count;
  end if;

  for v_job in
    select id,locked_by
      from public.order_whatsapp_notifications
     where organization_id=v_organization_id
       and locked_by in (v_worker_a,v_worker_b)
  loop
    perform public.order_notification_finish_internal(
      v_job.id,v_job.locked_by,'sent',null,null,null,null
    );
  end loop;

  select count(*) into v_count
    from public.order_whatsapp_notifications
   where organization_id=v_organization_id
     and status='sent'
     and attempts=1;
  if v_count <> 20 then
    raise exception 'concurrent fixture expected 20 finalized jobs, got %',v_count;
  end if;
end $$;

select 'FLOW10_CONCURRENT_CLAIM_RESULT=passed';
