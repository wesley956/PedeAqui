-- Stabilization #819: make manual printer creation replay-safe without imposing
-- permanent uniqueness on network/manual printer definitions.
--
-- Exact retries by the same actor within a short recovery window serialize on
-- an advisory transaction lock and reconcile to the same printer row.

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
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_name text := trim(p_name);
  v_address text := nullif(trim(coalesce(p_connection_address, '')), '');
  v_lock_key bigint;
  v_existing public.printers%rowtype;
  v_created public.printers%rowtype;
begin
  if p_actor_user_id is null then raise exception 'printer actor is required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'invalid printer name'; end if;

  select organization_id into v_organization_id
  from public.stores
  where id = p_store_id;
  if v_organization_id is null then raise exception 'store not found'; end if;

  v_lock_key := pg_catalog.hashtextextended(
    concat_ws('|',
      'print-create', p_store_id::text, p_actor_user_id::text, lower(v_name),
      coalesce(p_connection_type, ''), coalesce(v_address, ''), coalesce(p_connection_port::text, ''),
      coalesce(p_paper_width_mm::text, ''), coalesce(p_default_copies::text, ''),
      coalesce(p_agent_id::text, ''), coalesce(p_fallback_printer_id::text, '')
    ),
    0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_lock_key);

  select * into v_existing
  from public.printers
  where organization_id = v_organization_id
    and store_id = p_store_id
    and created_by = p_actor_user_id
    and name = v_name
    and connection_type = p_connection_type
    and connection_address is not distinct from v_address
    and connection_port is not distinct from p_connection_port
    and paper_width_mm = p_paper_width_mm
    and default_copies = p_default_copies
    and agent_id is not distinct from p_agent_id
    and fallback_printer_id is not distinct from p_fallback_printer_id
    and created_at >= now() - interval '15 minutes'
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id,
      'name', v_existing.name,
      'connection_type', v_existing.connection_type,
      'paper_width_mm', v_existing.paper_width_mm,
      'created', false
    );
  end if;

  insert into public.printers (
    organization_id, store_id, agent_id, name, connection_type,
    connection_address, connection_port, paper_width_mm, default_copies,
    fallback_printer_id, created_by
  ) values (
    v_organization_id, p_store_id, p_agent_id, v_name, p_connection_type,
    v_address, p_connection_port, p_paper_width_mm, p_default_copies,
    p_fallback_printer_id, p_actor_user_id
  )
  returning * into v_created;

  return jsonb_build_object(
    'id', v_created.id,
    'name', v_created.name,
    'connection_type', v_created.connection_type,
    'paper_width_mm', v_created.paper_width_mm,
    'created', true
  );
end;
$function$;

revoke all on function public.print_create_printer_idempotent_internal(uuid,text,text,text,integer,integer,integer,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.print_create_printer_idempotent_internal(uuid,text,text,text,integer,integer,integer,uuid,uuid,uuid) to service_role;
