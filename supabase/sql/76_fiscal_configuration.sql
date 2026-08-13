-- PedeAqui — Milestone 22 [225]–[238]
-- Configuração fiscal transacional e cancelamento assíncrono.

create or replace function public.fiscal_configure_integration_internal(
  p_store_id uuid,
  p_provider_key text,
  p_name text,
  p_environment text,
  p_secret_ref text default null,
  p_webhook_secret_ref text default null,
  p_capabilities jsonb default '[]'::jsonb,
  p_config jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
) returns public.integrations
language plpgsql security invoker set search_path='' as $$
declare v_store public.stores%rowtype; v_result public.integrations%rowtype;
begin
  if p_environment not in ('sandbox','homologation','production') then raise exception 'invalid integration environment'; end if;
  if trim(coalesce(p_provider_key,'')) !~ '^[a-z0-9][a-z0-9._-]{1,79}$' then raise exception 'invalid provider key'; end if;
  if char_length(trim(coalesce(p_name,''))) < 2 or char_length(trim(p_name)) > 120 then raise exception 'invalid integration name'; end if;
  if jsonb_typeof(coalesce(p_capabilities,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' then raise exception 'invalid integration configuration'; end if;
  select * into v_store from public.stores where id=p_store_id and status='active' for update;
  if v_store.id is null then raise exception 'store unavailable'; end if;
  select * into v_result from public.integrations where organization_id=v_store.organization_id and store_id=v_store.id and kind='fiscal' and provider_key=trim(p_provider_key) and environment=p_environment and active=true for update;
  if v_result.id is null then
    insert into public.integrations(organization_id,store_id,kind,provider_key,name,environment,secret_ref,webhook_secret_ref,capabilities,config,active,created_by,updated_by)
    values(v_store.organization_id,v_store.id,'fiscal',trim(p_provider_key),trim(p_name),p_environment,nullif(trim(coalesce(p_secret_ref,'')),''),nullif(trim(coalesce(p_webhook_secret_ref,'')),''),coalesce(p_capabilities,'[]'::jsonb),coalesce(p_config,'{}'::jsonb),true,p_actor_user_id,p_actor_user_id)
    returning * into v_result;
  else
    update public.integrations set name=trim(p_name),secret_ref=nullif(trim(coalesce(p_secret_ref,'')),''),webhook_secret_ref=nullif(trim(coalesce(p_webhook_secret_ref,'')),''),capabilities=coalesce(p_capabilities,'[]'::jsonb),config=coalesce(p_config,'{}'::jsonb),updated_by=p_actor_user_id,updated_at=now() where id=v_result.id returning * into v_result;
  end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data) values(v_result.organization_id,v_result.store_id,p_actor_user_id,'fiscal.integration_configured','integration',v_result.id,jsonb_build_object('provider_key',v_result.provider_key,'environment',v_result.environment,'capabilities',v_result.capabilities));
  return v_result;
end; $$;
revoke all on function public.fiscal_configure_integration_internal(uuid,text,text,text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_configure_integration_internal(uuid,text,text,text,text,text,jsonb,jsonb,uuid) to service_role;

create or replace function public.fiscal_configure_profile_internal(
  p_store_id uuid,
  p_integration_id uuid,
  p_issuer_tax_id text,
  p_state_registration text default null,
  p_municipal_registration text default null,
  p_crt_code text default null,
  p_default_document_model text default '65',
  p_environment text default 'homologation',
  p_certificate_ref text default null,
  p_emission_policy text default 'manual',
  p_actor_user_id uuid default null
) returns public.fiscal_profiles
language plpgsql security invoker set search_path='' as $$
declare v_store public.stores%rowtype; v_integration public.integrations%rowtype; v_result public.fiscal_profiles%rowtype;
begin
  if p_default_document_model not in ('55','65') then raise exception 'unsupported fiscal model'; end if;
  if p_environment not in ('homologation','production') then raise exception 'invalid fiscal environment'; end if;
  if p_emission_policy not in ('manual','on_payment','on_completion') then raise exception 'invalid emission policy'; end if;
  if char_length(trim(coalesce(p_issuer_tax_id,''))) < 8 or char_length(trim(p_issuer_tax_id)) > 32 then raise exception 'invalid issuer tax id'; end if;
  select * into v_store from public.stores where id=p_store_id and status='active' for update; if v_store.id is null then raise exception 'store unavailable'; end if;
  select * into v_integration from public.integrations where id=p_integration_id and organization_id=v_store.organization_id and store_id=v_store.id and kind='fiscal' and active=true; if v_integration.id is null then raise exception 'fiscal integration outside store'; end if;
  select * into v_result from public.fiscal_profiles where store_id=v_store.id for update;
  if v_result.id is null then
    insert into public.fiscal_profiles(organization_id,store_id,integration_id,issuer_tax_id,state_registration,municipal_registration,crt_code,default_document_model,environment,certificate_ref,emission_policy,active,created_by,updated_by)
    values(v_store.organization_id,v_store.id,v_integration.id,trim(p_issuer_tax_id),nullif(trim(coalesce(p_state_registration,'')),''),nullif(trim(coalesce(p_municipal_registration,'')),''),nullif(trim(coalesce(p_crt_code,'')),''),p_default_document_model,p_environment,nullif(trim(coalesce(p_certificate_ref,'')),''),p_emission_policy,true,p_actor_user_id,p_actor_user_id) returning * into v_result;
  else
    update public.fiscal_profiles set integration_id=v_integration.id,issuer_tax_id=trim(p_issuer_tax_id),state_registration=nullif(trim(coalesce(p_state_registration,'')),''),municipal_registration=nullif(trim(coalesce(p_municipal_registration,'')),''),crt_code=nullif(trim(coalesce(p_crt_code,'')),''),default_document_model=p_default_document_model,environment=p_environment,certificate_ref=nullif(trim(coalesce(p_certificate_ref,'')),''),emission_policy=p_emission_policy,active=true,updated_by=p_actor_user_id,updated_at=now() where id=v_result.id returning * into v_result;
  end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data) values(v_result.organization_id,v_result.store_id,p_actor_user_id,'fiscal.profile_configured','fiscal_profile',v_result.id,jsonb_build_object('model',v_result.default_document_model,'environment',v_result.environment,'emission_policy',v_result.emission_policy));
  return v_result;
end; $$;
revoke all on function public.fiscal_configure_profile_internal(uuid,uuid,text,text,text,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_configure_profile_internal(uuid,uuid,text,text,text,text,text,text,text,text,uuid) to service_role;

create or replace function public.fiscal_create_product_profile_internal(
  p_product_id uuid,
  p_effective_at timestamptz,
  p_ncm text default null,
  p_cest text default null,
  p_default_cfop text default null,
  p_cst_csosn text default null,
  p_cclass_trib text default null,
  p_tax_data jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
) returns public.product_fiscal_profiles
language plpgsql security invoker set search_path='' as $$
declare v_product public.products%rowtype; v_version integer; v_result public.product_fiscal_profiles%rowtype;
begin
  if jsonb_typeof(coalesce(p_tax_data,'{}'::jsonb))<>'object' then raise exception 'invalid tax data'; end if;
  select * into v_product from public.products where id=p_product_id and deleted_at is null for update; if v_product.id is null then raise exception 'product unavailable'; end if;
  select coalesce(max(version),0)+1 into v_version from public.product_fiscal_profiles where organization_id=v_product.organization_id and store_id=v_product.store_id and product_id=v_product.id;
  insert into public.product_fiscal_profiles(organization_id,store_id,product_id,version,effective_at,ncm,cest,default_cfop,cst_csosn,cclass_trib,tax_data,created_by)
  values(v_product.organization_id,v_product.store_id,v_product.id,v_version,coalesce(p_effective_at,now()),nullif(trim(coalesce(p_ncm,'')),''),nullif(trim(coalesce(p_cest,'')),''),nullif(trim(coalesce(p_default_cfop,'')),''),nullif(trim(coalesce(p_cst_csosn,'')),''),nullif(trim(coalesce(p_cclass_trib,'')),''),coalesce(p_tax_data,'{}'::jsonb),p_actor_user_id) returning * into v_result;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data) values(v_result.organization_id,v_result.store_id,p_actor_user_id,'fiscal.product_profile_created','product_fiscal_profile',v_result.id,jsonb_build_object('product_id',v_result.product_id,'version',v_result.version,'effective_at',v_result.effective_at));
  return v_result;
end; $$;
revoke all on function public.fiscal_create_product_profile_internal(uuid,timestamptz,text,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_create_product_profile_internal(uuid,timestamptz,text,text,text,text,text,jsonb,uuid) to service_role;

create or replace function public.fiscal_request_cancel_internal(
  p_fiscal_document_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns public.fiscal_jobs
language plpgsql security invoker set search_path='' as $$
declare v_doc public.fiscal_documents%rowtype; v_existing public.fiscal_jobs%rowtype; v_job public.fiscal_jobs%rowtype;
begin
  if char_length(trim(coalesce(p_reason,''))) < 3 or char_length(trim(p_reason)) > 500 then raise exception 'cancel reason is required'; end if;
  select * into v_doc from public.fiscal_documents where id=p_fiscal_document_id for update; if v_doc.id is null then raise exception 'fiscal document not found'; end if;
  select * into v_existing from public.fiscal_jobs where organization_id=v_doc.organization_id and idempotency_key=trim(p_idempotency_key); if v_existing.id is not null then return v_existing; end if;
  if v_doc.status<>'authorized' then raise exception 'only authorized fiscal document can request cancellation'; end if;
  insert into public.fiscal_jobs(organization_id,store_id,fiscal_document_id,integration_id,job_type,status,idempotency_key,payload,created_by)
  values(v_doc.organization_id,v_doc.store_id,v_doc.id,v_doc.integration_id,'cancel','pending',trim(p_idempotency_key),jsonb_build_object('reason',trim(p_reason)),p_actor_user_id) returning * into v_job;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data) values(v_doc.organization_id,v_doc.store_id,p_actor_user_id,'fiscal.cancel_requested','fiscal_document',v_doc.id,jsonb_build_object('job_id',v_job.id,'reason',trim(p_reason)));
  return v_job;
end; $$;
revoke all on function public.fiscal_request_cancel_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_request_cancel_internal(uuid,text,text,uuid) to service_role;
