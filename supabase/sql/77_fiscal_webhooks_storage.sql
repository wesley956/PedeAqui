-- PedeAqui — Milestone 22 [225]–[238]
-- Callbacks idempotentes + referências de artefatos em bucket privado.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fiscal-artifacts','fiscal-artifacts',false,10485760,array['application/xml','text/xml','application/pdf','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types,updated_at=now();

create table public.fiscal_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  integration_id uuid not null,
  fiscal_document_id uuid,
  external_event_id text not null check (char_length(trim(external_event_id)) between 2 and 240),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  provider_document_id text,
  target_status text not null check (target_status in ('processing','authorized','rejected','cancelled','contingency')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fiscal_webhook_receipts_integration_fk foreign key (organization_id,store_id,integration_id)
    references public.integrations(organization_id,store_id,id) on delete restrict,
  constraint fiscal_webhook_receipts_document_fk foreign key (organization_id,store_id,fiscal_document_id)
    references public.fiscal_documents(organization_id,store_id,id) on delete restrict,
  constraint fiscal_webhook_receipts_event_unique unique (integration_id,external_event_id)
);
create index fiscal_webhook_receipts_document_idx on public.fiscal_webhook_receipts(organization_id,store_id,fiscal_document_id,created_at desc);
create index fiscal_webhook_receipts_pending_idx on public.fiscal_webhook_receipts(organization_id,store_id,created_at) where processed_at is null;

alter table public.fiscal_webhook_receipts enable row level security;
revoke all on table public.fiscal_webhook_receipts from anon,authenticated;
grant select,insert,update,delete on table public.fiscal_webhook_receipts to service_role;
create policy fiscal_webhook_receipts_browser_deny on public.fiscal_webhook_receipts for all to anon,authenticated using(false) with check(false);

create or replace function public.fiscal_apply_webhook_internal(
  p_integration_id uuid,
  p_external_event_id text,
  p_payload_sha256 text,
  p_provider_document_id text,
  p_access_key text,
  p_target_status text,
  p_protocol text default null,
  p_cancellation_protocol text default null,
  p_provider_code text default null,
  p_message text default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.fiscal_documents
language plpgsql security invoker set search_path='' as $$
declare
  v_integration public.integrations%rowtype;
  v_receipt public.fiscal_webhook_receipts%rowtype;
  v_doc public.fiscal_documents%rowtype;
  v_transition_key text;
begin
  if p_target_status not in ('processing','authorized','rejected','cancelled','contingency') then raise exception 'unsupported fiscal webhook status'; end if;
  if trim(coalesce(p_payload_sha256,'')) !~ '^[0-9a-f]{64}$' then raise exception 'invalid webhook payload hash'; end if;
  select * into v_integration from public.integrations where id=p_integration_id and kind='fiscal' and active=true;
  if v_integration.id is null then raise exception 'fiscal integration unavailable'; end if;

  select * into v_receipt from public.fiscal_webhook_receipts where integration_id=v_integration.id and external_event_id=trim(p_external_event_id) for update;
  if v_receipt.id is not null then
    if v_receipt.payload_sha256<>p_payload_sha256 or v_receipt.target_status<>p_target_status then raise exception 'webhook replay payload mismatch'; end if;
    if v_receipt.fiscal_document_id is not null then select * into v_doc from public.fiscal_documents where id=v_receipt.fiscal_document_id; return v_doc; end if;
  end if;

  select * into v_doc from public.fiscal_documents d
  where d.integration_id=v_integration.id
    and ((p_provider_document_id is not null and d.provider_document_id=p_provider_document_id) or (p_access_key is not null and d.access_key=p_access_key))
  order by d.created_at desc limit 1 for update;
  if v_doc.id is null then raise exception 'fiscal webhook document not found'; end if;

  if v_receipt.id is null then
    insert into public.fiscal_webhook_receipts(organization_id,store_id,integration_id,fiscal_document_id,external_event_id,payload_sha256,provider_document_id,target_status,metadata)
    values(v_doc.organization_id,v_doc.store_id,v_integration.id,v_doc.id,trim(p_external_event_id),p_payload_sha256,nullif(trim(coalesce(p_provider_document_id,'')),''),p_target_status,coalesce(p_metadata,'{}'::jsonb)) returning * into v_receipt;
  else
    update public.fiscal_webhook_receipts set fiscal_document_id=v_doc.id,provider_document_id=coalesce(provider_document_id,nullif(trim(coalesce(p_provider_document_id,'')),'')),metadata=coalesce(p_metadata,'{}'::jsonb) where id=v_receipt.id returning * into v_receipt;
  end if;

  if p_provider_document_id is not null and v_doc.provider_document_id is null then update public.fiscal_documents set provider_document_id=trim(p_provider_document_id),updated_at=now() where id=v_doc.id returning * into v_doc; end if;
  v_transition_key:='fiscal-webhook:'||v_integration.id::text||':'||trim(p_external_event_id);

  if p_target_status='processing' then
    if v_doc.status='queued' then perform public.fiscal_transition_internal(v_doc.id,'processing',v_transition_key,'fiscal.webhook.processing',p_provider_code,p_message,null,null,null,null,p_metadata); end if;
  elsif p_target_status='contingency' then
    if v_doc.status in ('queued','processing') then perform public.fiscal_transition_internal(v_doc.id,'contingency',v_transition_key,'fiscal.webhook.contingency',p_provider_code,p_message,null,null,null,null,p_metadata); end if;
  elsif p_target_status in ('authorized','rejected') then
    if v_doc.status='queued' then perform public.fiscal_transition_internal(v_doc.id,'processing',v_transition_key||':processing','fiscal.webhook.processing',p_provider_code,null,null,null,null,null,p_metadata); select * into v_doc from public.fiscal_documents where id=v_doc.id; end if;
    if v_doc.status in ('processing','contingency') then perform public.fiscal_transition_internal(v_doc.id,p_target_status,v_transition_key,'fiscal.webhook.'||p_target_status,p_provider_code,p_message,case when p_target_status='authorized' then p_access_key else null end,case when p_target_status='authorized' then p_protocol else null end,null,null,p_metadata); end if;
  elsif p_target_status='cancelled' then
    if v_doc.status='authorized' then perform public.fiscal_transition_internal(v_doc.id,'cancelled',v_transition_key,'fiscal.webhook.cancelled',p_provider_code,p_message,null,null,p_cancellation_protocol,null,p_metadata); end if;
  end if;

  update public.fiscal_webhook_receipts set processed_at=now() where id=v_receipt.id;
  select * into v_doc from public.fiscal_documents where id=v_doc.id;
  return v_doc;
end; $$;
revoke all on function public.fiscal_apply_webhook_internal(uuid,text,text,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.fiscal_apply_webhook_internal(uuid,text,text,text,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.fiscal_record_artifacts_internal(
  p_fiscal_document_id uuid,
  p_xml_storage_path text,
  p_danfe_storage_path text,
  p_xml_sha256 text
) returns public.fiscal_documents
language plpgsql security invoker set search_path='' as $$
declare v_doc public.fiscal_documents%rowtype; v_prefix text;
begin
  select * into v_doc from public.fiscal_documents where id=p_fiscal_document_id for update; if v_doc.id is null then raise exception 'fiscal document not found'; end if;
  if v_doc.status not in ('authorized','cancelled') then raise exception 'fiscal artifacts require authorized or cancelled document'; end if;
  if trim(coalesce(p_xml_sha256,'')) !~ '^[0-9a-f]{64}$' then raise exception 'invalid XML SHA-256'; end if;
  v_prefix:=v_doc.organization_id::text||'/'||v_doc.store_id::text||'/'||v_doc.id::text||'/';
  if p_xml_storage_path not like v_prefix||'%' then raise exception 'invalid fiscal XML path scope'; end if;
  if p_danfe_storage_path is not null and p_danfe_storage_path not like v_prefix||'%' then raise exception 'invalid DANFE path scope'; end if;
  update public.fiscal_documents set xml_storage_path=p_xml_storage_path,danfe_storage_path=nullif(trim(coalesce(p_danfe_storage_path,'')),''),xml_sha256=p_xml_sha256,updated_at=now() where id=v_doc.id returning * into v_doc;
  return v_doc;
end; $$;
revoke all on function public.fiscal_record_artifacts_internal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fiscal_record_artifacts_internal(uuid,text,text,text) to service_role;
