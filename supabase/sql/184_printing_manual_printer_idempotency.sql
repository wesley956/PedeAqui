-- Stabilization #819: make manual printer creation replay-safe without imposing
-- permanent uniqueness on network/manual printer definitions.
--
-- The same explicit intent key always reconciles to the same result. A new key
-- represents a new conscious operator action, even when the printer payload is
-- identical.

create or replace function public.print_create_printer_idempotent_internal(
  p_store_id uuid,
  p_name text,
  p_connection_type text,
  p_connection_address text,
  p_connection_port integer,
  p_paper_width_mm integer,
  p_default_copies integer,
  p_agent_id uuid,
  p_fallback_printer_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_store public.stores%rowtype;
  v_name text := trim(p_name);
  v_address text := nullif(trim(coalesce(p_connection_address, '')), '');
  v_idem public.idempotency_keys%rowtype;
  v_inserted integer := 0;
  v_fingerprint text;
  v_created public.printers%rowtype;
  v_response jsonb;
begin
  if p_actor_user_id is null then raise exception 'printer actor is required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'invalid printer name'; end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) < 8
     or char_length(trim(p_idempotency_key)) > 240 then
    raise exception 'invalid printer idempotency key';
  end if;

  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'store_id', p_store_id,
    'name', v_name,
    'connection_type', p_connection_type,
    'connection_address', v_address,
    'connection_port', p_connection_port,
    'paper_width_mm', p_paper_width_mm,
    'default_copies', p_default_copies,
    'agent_id', p_agent_id,
    'fallback_printer_id', p_fallback_printer_id,
    'actor_user_id', p_actor_user_id
  )::text);

  insert into public.idempotency_keys(
    organization_id, store_id, scope, idempotency_key, request_fingerprint,
    status, expires_at
  ) values (
    v_store.organization_id, v_store.id, 'printing.printer.create', trim(p_idempotency_key),
    v_fingerprint, 'processing', now() + interval '24 hours'
  ) on conflict (organization_id, scope, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.idempotency_keys
  where organization_id = v_store.organization_id
    and scope = 'printing.printer.create'
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if v_idem.id is null then raise exception 'printer idempotency unavailable'; end if;
  if v_idem.request_fingerprint is distinct from v_fingerprint then
    raise exception 'idempotency key reused with different printer payload';
  end if;
  if v_inserted = 0 and v_idem.status = 'completed' and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 and v_idem.status = 'processing' and v_idem.expires_at > now() then
    raise exception 'printer creation is already processing';
  end if;

  update public.idempotency_keys
  set status = 'processing', response_code = null, response_body = null,
      expires_at = now() + interval '24 hours', updated_at = now()
  where id = v_idem.id;

  insert into public.printers (
    organization_id, store_id, agent_id, name, connection_type,
    connection_address, connection_port, paper_width_mm, default_copies,
    fallback_printer_id, created_by
  ) values (
    v_store.organization_id, p_store_id, p_agent_id, v_name, p_connection_type,
    v_address, p_connection_port, p_paper_width_mm, p_default_copies,
    p_fallback_printer_id, p_actor_user_id
  ) returning * into v_created;

  v_response := jsonb_build_object(
    'id', v_created.id,
    'name', v_created.name,
    'connection_type', v_created.connection_type,
    'paper_width_mm', v_created.paper_width_mm,
    'created', true
  );

  update public.idempotency_keys
  set status = 'completed', response_code = 200, response_body = v_response, updated_at = now()
  where id = v_idem.id;

  return v_response || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function public.print_create_printer_idempotent_internal(uuid,text,text,text,integer,integer,integer,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.print_create_printer_idempotent_internal(uuid,text,text,text,integer,integer,integer,uuid,uuid,text,uuid) to service_role;
