-- PedeAqui — Milestone 22 [225]–[238]
-- Fiscal operations: snapshots, state machine, persistent queue and idempotency.

alter table public.fiscal_documents
  add column if not exists cancellation_protocol text,
  add column if not exists cancel_reason text;

create table public.fiscal_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  fiscal_document_id uuid not null,
  integration_id uuid not null,
  job_type text not null check (job_type in ('issue','query','cancel')),
  status text not null default 'pending' check (status in ('pending','leased','succeeded','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  available_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  leased_by text,
  last_error text,
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint fiscal_jobs_document_fk foreign key (organization_id,store_id,fiscal_document_id)
    references public.fiscal_documents(organization_id,store_id,id) on delete cascade,
  constraint fiscal_jobs_integration_fk foreign key (organization_id,store_id,integration_id)
    references public.integrations(organization_id,store_id,id) on delete restrict,
  constraint fiscal_jobs_org_idem_unique unique (organization_id,idempotency_key)
);
create index fiscal_jobs_claim_idx on public.fiscal_jobs(status,available_at,lease_expires_at,created_at)
  where status in ('pending','leased');
create index fiscal_jobs_document_idx on public.fiscal_jobs(organization_id,store_id,fiscal_document_id,created_at desc);

alter table public.fiscal_jobs enable row level security;
revoke all on table public.fiscal_jobs from anon,authenticated;
grant select,insert,update,delete on table public.fiscal_jobs to service_role;
create policy fiscal_jobs_browser_deny on public.fiscal_jobs for all to anon,authenticated using(false) with check(false);

create or replace function private.fiscal_can_transition(p_from text,p_to text)
returns boolean
language sql immutable security invoker set search_path=''
as $$
  select case
    when p_from='draft' then p_to='queued'
    when p_from='queued' then p_to in ('processing','contingency')
    when p_from='processing' then p_to in ('authorized','rejected','contingency')
    when p_from='rejected' then p_to='queued'
    when p_from='contingency' then p_to in ('processing','authorized','rejected')
    when p_from='authorized' then p_to='cancelled'
    else false
  end;
$$;
revoke all on function private.fiscal_can_transition(text,text) from public,anon,authenticated;
grant execute on function private.fiscal_can_transition(text,text) to service_role;

create or replace function public.fiscal_create_document_internal(
  p_order_id uuid,
  p_model text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns public.fiscal_documents
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_store public.stores%rowtype;
  v_profile public.fiscal_profiles%rowtype;
  v_existing public.fiscal_documents%rowtype;
  v_doc public.fiscal_documents%rowtype;
  v_reference_time timestamptz;
begin
  if p_model not in ('55','65') then raise exception 'unsupported fiscal document model'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 240 then
    raise exception 'invalid fiscal idempotency key';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.order_status not in ('confirmed','completed') then raise exception 'order is not eligible for fiscal document'; end if;

  select * into v_existing from public.fiscal_documents
  where organization_id=v_order.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  select * into v_store from public.stores
  where organization_id=v_order.organization_id and id=v_order.store_id and status='active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  select * into v_profile from public.fiscal_profiles
  where organization_id=v_order.organization_id and store_id=v_order.store_id and active=true
  for update;
  if v_profile.id is null then raise exception 'active fiscal profile is required'; end if;
  if v_profile.integration_id is null then raise exception 'active fiscal integration is required'; end if;

  v_reference_time := coalesce(v_order.confirmed_at,v_order.created_at);

  insert into public.fiscal_documents(
    organization_id,store_id,order_id,integration_id,model,environment,status,idempotency_key,
    issuer_snapshot,customer_snapshot,totals_snapshot,fiscal_payload,schema_version,created_by,updated_by
  ) values (
    v_order.organization_id,v_order.store_id,v_order.id,v_profile.integration_id,p_model,v_profile.environment,'draft',
    trim(p_idempotency_key),
    jsonb_build_object(
      'fiscal_profile_id',v_profile.id,
      'tax_id',v_profile.issuer_tax_id,
      'state_registration',v_profile.state_registration,
      'municipal_registration',v_profile.municipal_registration,
      'crt_code',v_profile.crt_code,
      'store_name',v_store.name,
      'street',v_store.street,'number',v_store.number,'complement',v_store.complement,
      'district',v_store.district,'city',v_store.city,'state',v_store.state,'postal_code',v_store.postal_code
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'customer_id',v_order.customer_id,
      'name',v_order.customer_name_snapshot,
      'phone',v_order.customer_phone_snapshot,
      'email',v_order.customer_email_snapshot,
      'postal_code',v_order.address_postal_code_snapshot,
      'street',v_order.address_street_snapshot,
      'number',v_order.address_number_snapshot,
      'complement',v_order.address_complement_snapshot,
      'district',v_order.address_district_snapshot,
      'city',v_order.address_city_snapshot,
      'state',v_order.address_state_snapshot
    )),
    jsonb_build_object(
      'subtotal_cents',v_order.subtotal_cents,
      'discount_cents',v_order.discount_cents,
      'delivery_fee_cents',v_order.delivery_fee_cents,
      'total_cents',v_order.total_cents
    ),
    jsonb_build_object(
      'order_display_number',v_order.display_number,
      'channel',v_order.channel,
      'fulfillment_type',v_order.fulfillment_type,
      'reference_time',v_reference_time
    ),
    'pedeaqui-fiscal-v1',
    p_actor_user_id,p_actor_user_id
  ) returning * into v_doc;

  insert into public.fiscal_items(
    organization_id,store_id,fiscal_document_id,order_item_id,product_id,line_number,
    description,quantity,unit_price_cents,total_cents,fiscal_snapshot
  )
  select
    oi.organization_id,oi.store_id,v_doc.id,oi.id,oi.product_id,
    row_number() over(order by oi.created_at,oi.id)::integer,
    oi.product_name_snapshot,oi.quantity::numeric,
    oi.unit_total_price_cents,oi.line_total_cents,
    case when pf.id is null
      then jsonb_build_object('missing_profile',true,'reference_time',v_reference_time)
      else jsonb_build_object(
        'missing_profile',false,'profile_id',pf.id,'version',pf.version,'effective_at',pf.effective_at,
        'ncm',pf.ncm,'cest',pf.cest,'cfop',pf.default_cfop,'cst_csosn',pf.cst_csosn,
        'cclass_trib',pf.cclass_trib,'tax_data',pf.tax_data
      )
    end
  from public.order_items oi
  left join lateral (
    select p.*
    from public.product_fiscal_profiles p
    where p.organization_id=oi.organization_id
      and p.store_id=oi.store_id
      and p.product_id=oi.product_id
      and p.effective_at <= v_reference_time
    order by p.effective_at desc,p.version desc,p.created_at desc
    limit 1
  ) pf on true
  where oi.organization_id=v_order.organization_id
    and oi.store_id=v_order.store_id
    and oi.order_id=v_order.id;

  insert into public.fiscal_document_history(
    organization_id,store_id,fiscal_document_id,from_status,to_status,event_type,idempotency_key,actor_user_id
  ) values (
    v_doc.organization_id,v_doc.store_id,v_doc.id,null,'draft','fiscal.document_created',
    'fiscal-doc:'||v_doc.id::text||':created',p_actor_user_id
  );

  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (v_doc.organization_id,v_doc.store_id,p_actor_user_id,'fiscal.document_created','fiscal_document',v_doc.id,
    jsonb_build_object('order_id',v_doc.order_id,'model',v_doc.model,'environment',v_doc.environment));

  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values (v_doc.organization_id,v_doc.store_id,'fiscal.document_created','fiscal_document',v_doc.id,
    jsonb_build_object('order_id',v_doc.order_id,'model',v_doc.model),'pending',0,now(),p_actor_user_id);

  return v_doc;
end;
$$;
revoke all on function public.fiscal_create_document_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_create_document_internal(uuid,text,text,uuid) to service_role;

create or replace function public.fiscal_transition_internal(
  p_fiscal_document_id uuid,
  p_to_status text,
  p_idempotency_key text,
  p_event_type text,
  p_provider_code text default null,
  p_message text default null,
  p_access_key text default null,
  p_protocol text default null,
  p_cancellation_protocol text default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.fiscal_documents
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_doc public.fiscal_documents%rowtype;
  v_hist public.fiscal_document_history%rowtype;
  v_from_status text;
  v_now timestamptz := now();
begin
  if p_to_status not in ('queued','processing','authorized','rejected','cancelled','contingency') then
    raise exception 'invalid fiscal target status';
  end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 240 then
    raise exception 'invalid fiscal transition idempotency key';
  end if;

  select * into v_hist from public.fiscal_document_history
  where organization_id=(select organization_id from public.fiscal_documents where id=p_fiscal_document_id)
    and idempotency_key=trim(p_idempotency_key);
  if v_hist.id is not null then
    select * into v_doc from public.fiscal_documents where id=p_fiscal_document_id;
    return v_doc;
  end if;

  select * into v_doc from public.fiscal_documents where id=p_fiscal_document_id for update;
  if v_doc.id is null then raise exception 'fiscal document not found'; end if;
  if not private.fiscal_can_transition(v_doc.status,p_to_status) then
    raise exception 'invalid fiscal transition % -> %',v_doc.status,p_to_status;
  end if;
  v_from_status := v_doc.status;
  if p_to_status='authorized' and (nullif(trim(coalesce(p_access_key,'')),'') is null or nullif(trim(coalesce(p_protocol,'')),'') is null) then
    raise exception 'authorization requires access key and protocol';
  end if;
  if p_to_status='rejected' and nullif(trim(coalesce(p_message,'')),'') is null then
    raise exception 'rejection message is required';
  end if;
  if p_to_status='cancelled' and nullif(trim(coalesce(p_cancellation_protocol,'')),'') is null then
    raise exception 'cancellation protocol is required';
  end if;

  update public.fiscal_documents set
    status=p_to_status,
    access_key=case when p_to_status='authorized' then trim(p_access_key) else access_key end,
    protocol=case when p_to_status='authorized' then trim(p_protocol) else protocol end,
    cancellation_protocol=case when p_to_status='cancelled' then trim(p_cancellation_protocol) else cancellation_protocol end,
    cancel_reason=case when p_to_status='cancelled' then nullif(trim(coalesce(p_message,'')),'') else cancel_reason end,
    rejection_code=case when p_to_status='rejected' then nullif(trim(coalesce(p_provider_code,'')),'') else rejection_code end,
    rejection_message=case when p_to_status='rejected' then trim(p_message) else rejection_message end,
    queued_at=case when p_to_status='queued' then v_now else queued_at end,
    processing_at=case when p_to_status='processing' then v_now else processing_at end,
    authorized_at=case when p_to_status='authorized' then v_now else authorized_at end,
    rejected_at=case when p_to_status='rejected' then v_now else rejected_at end,
    cancelled_at=case when p_to_status='cancelled' then v_now else cancelled_at end,
    contingency_at=case when p_to_status='contingency' then v_now else contingency_at end,
    updated_by=coalesce(p_actor_user_id,updated_by),
    updated_at=v_now
  where id=v_doc.id
  returning * into v_doc;

  insert into public.fiscal_document_history(
    organization_id,store_id,fiscal_document_id,from_status,to_status,event_type,idempotency_key,
    provider_code,message,metadata,actor_user_id
  ) values (
    v_doc.organization_id,v_doc.store_id,v_doc.id,v_from_status,
    p_to_status,trim(p_event_type),trim(p_idempotency_key),nullif(trim(coalesce(p_provider_code,'')),''),
    nullif(trim(coalesce(p_message,'')),''),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id
  );

  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values (v_doc.organization_id,v_doc.store_id,'fiscal.'||p_to_status,'fiscal_document',v_doc.id,
    jsonb_build_object('order_id',v_doc.order_id,'status',p_to_status,'provider_code',p_provider_code),
    'pending',0,v_now,p_actor_user_id);
  return v_doc;
end;
$$;
revoke all on function public.fiscal_transition_internal(uuid,text,text,text,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fiscal_transition_internal(uuid,text,text,text,text,text,text,text,text,uuid,jsonb) to service_role;

create or replace function public.fiscal_queue_document_internal(
  p_fiscal_document_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns public.fiscal_jobs
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_doc public.fiscal_documents%rowtype;
  v_integration public.integrations%rowtype;
  v_existing public.fiscal_jobs%rowtype;
  v_job public.fiscal_jobs%rowtype;
  v_transition_key text;
begin
  select * into v_doc from public.fiscal_documents where id=p_fiscal_document_id for update;
  if v_doc.id is null then raise exception 'fiscal document not found'; end if;

  select * into v_existing from public.fiscal_jobs
  where organization_id=v_doc.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  if v_doc.status not in ('draft','rejected') then raise exception 'fiscal document cannot be queued from status %',v_doc.status; end if;
  if exists (
    select 1 from public.fiscal_items i
    where i.fiscal_document_id=v_doc.id and coalesce((i.fiscal_snapshot->>'missing_profile')::boolean,false)=true
  ) then raise exception 'all fiscal items require a fiscal profile before queue'; end if;

  select * into v_integration from public.integrations
  where id=v_doc.integration_id and organization_id=v_doc.organization_id and store_id=v_doc.store_id and kind='fiscal' and active=true;
  if v_integration.id is null then raise exception 'active fiscal integration unavailable'; end if;

  v_transition_key := trim(p_idempotency_key)||':transition';
  perform public.fiscal_transition_internal(
    v_doc.id,'queued',v_transition_key,'fiscal.queued',null,null,null,null,null,p_actor_user_id,
    jsonb_build_object('integration_id',v_integration.id,'provider_key',v_integration.provider_key)
  );

  insert into public.fiscal_jobs(
    organization_id,store_id,fiscal_document_id,integration_id,job_type,status,idempotency_key,payload,created_by
  ) values (
    v_doc.organization_id,v_doc.store_id,v_doc.id,v_integration.id,'issue','pending',trim(p_idempotency_key),
    jsonb_build_object('provider_key',v_integration.provider_key,'environment',v_integration.environment),p_actor_user_id
  ) returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.fiscal_queue_document_internal(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_queue_document_internal(uuid,text,uuid) to service_role;

create or replace function public.fiscal_claim_jobs_internal(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
) returns setof public.fiscal_jobs
language plpgsql
security invoker
set search_path=''
as $$
begin
  if char_length(trim(coalesce(p_worker_id,''))) < 2 then raise exception 'worker id is required'; end if;
  if p_limit < 1 or p_limit > 50 then raise exception 'invalid claim limit'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then raise exception 'invalid lease duration'; end if;

  return query
  with candidates as (
    select j.id
    from public.fiscal_jobs j
    where (
      (j.status='pending' and j.available_at<=now())
      or (j.status='leased' and j.lease_expires_at<=now())
    )
      and j.attempts < j.max_attempts
    order by j.available_at,j.created_at,j.id
    for update skip locked
    limit p_limit
  )
  update public.fiscal_jobs j set
    status='leased',
    attempts=j.attempts+1,
    leased_at=now(),
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
    leased_by=trim(p_worker_id),
    updated_at=now()
  from candidates c
  where j.id=c.id
  returning j.*;
end;
$$;
revoke all on function public.fiscal_claim_jobs_internal(text,integer,integer) from public,anon,authenticated;
grant execute on function public.fiscal_claim_jobs_internal(text,integer,integer) to service_role;

create or replace function public.fiscal_finish_job_internal(
  p_job_id uuid,
  p_worker_id text,
  p_success boolean,
  p_error text default null,
  p_retry_after_seconds integer default 60
) returns public.fiscal_jobs
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.fiscal_jobs%rowtype;
begin
  select * into v_job from public.fiscal_jobs where id=p_job_id for update;
  if v_job.id is null then raise exception 'fiscal job not found'; end if;
  if v_job.status='succeeded' or v_job.status='dead' then return v_job; end if;
  if v_job.status<>'leased' or v_job.leased_by is distinct from trim(p_worker_id) then raise exception 'fiscal job lease mismatch'; end if;

  if p_success then
    update public.fiscal_jobs set status='succeeded',completed_at=now(),lease_expires_at=null,last_error=null,updated_at=now()
    where id=v_job.id returning * into v_job;
  elsif v_job.attempts>=v_job.max_attempts then
    update public.fiscal_jobs set status='dead',completed_at=now(),lease_expires_at=null,last_error=left(coalesce(p_error,'unknown fiscal provider error'),2000),updated_at=now()
    where id=v_job.id returning * into v_job;
  else
    update public.fiscal_jobs set status='pending',available_at=now()+make_interval(secs=>greatest(1,p_retry_after_seconds)),
      lease_expires_at=null,leased_by=null,last_error=left(coalesce(p_error,'unknown fiscal provider error'),2000),updated_at=now()
    where id=v_job.id returning * into v_job;
  end if;
  return v_job;
end;
$$;
revoke all on function public.fiscal_finish_job_internal(uuid,text,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.fiscal_finish_job_internal(uuid,text,boolean,text,integer) to service_role;
