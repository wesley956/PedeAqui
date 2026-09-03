-- ESTABILIZAÇÃO #819/#823
-- Torna cadastro/edição de entregadores idempotentes e remove somente o índice duplicado comprovado.

-- O índice canônico nasceu no bloco de operações de entrega. A migration de acesso mobile
-- criou posteriormente um equivalente com outro nome. Preservamos o primeiro e removemos
-- apenas a duplicata confirmada por pg_indexes/pg_constraint.
create unique index if not exists drivers_store_user_unique_idx
  on public.drivers(store_id, user_id)
  where user_id is not null and deleted_at is null;

drop index if exists public.uq_drivers_store_user_active;

create or replace function public.delivery_create_driver_idempotent_internal(
  p_store_id uuid,
  p_name text,
  p_phone text,
  p_user_id uuid,
  p_max_active_deliveries integer,
  p_idempotency_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_store public.stores%rowtype;
  v_idem public.idempotency_keys%rowtype;
  v_inserted integer := 0;
  v_fingerprint text;
  v_driver public.drivers%rowtype;
begin
  if char_length(trim(coalesce(p_idempotency_key, ''))) < 8
     or char_length(trim(p_idempotency_key)) > 240 then
    raise exception 'invalid driver idempotency key';
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id and status = 'active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'store_id', p_store_id,
    'name', trim(p_name),
    'phone', nullif(trim(coalesce(p_phone, '')), ''),
    'user_id', p_user_id,
    'max_active_deliveries', p_max_active_deliveries,
    'actor_user_id', p_actor_user_id
  )::text);

  insert into public.idempotency_keys(
    organization_id, store_id, scope, idempotency_key, request_fingerprint,
    status, expires_at
  ) values (
    v_store.organization_id, v_store.id, 'delivery.driver.create', trim(p_idempotency_key),
    v_fingerprint, 'processing', now() + interval '24 hours'
  ) on conflict (organization_id, scope, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.idempotency_keys
  where organization_id = v_store.organization_id
    and scope = 'delivery.driver.create'
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if v_idem.id is null then raise exception 'driver idempotency unavailable'; end if;
  if v_idem.request_fingerprint is distinct from v_fingerprint then
    raise exception 'idempotency key reused with different driver payload';
  end if;
  if v_inserted = 0 and v_idem.status = 'completed' and v_idem.response_body is not null then
    return v_idem.response_body;
  end if;
  if v_inserted = 0 and v_idem.status = 'processing' and v_idem.expires_at > now() then
    raise exception 'driver creation is already processing';
  end if;

  update public.idempotency_keys
  set status = 'processing', response_code = null, response_body = null,
      expires_at = now() + interval '24 hours', updated_at = now()
  where id = v_idem.id;

  select * into v_driver
  from public.delivery_create_driver_internal(
    p_store_id,
    p_name,
    p_phone,
    p_user_id,
    p_max_active_deliveries,
    p_actor_user_id
  );

  update public.idempotency_keys
  set status = 'completed', response_code = 200, response_body = to_jsonb(v_driver), updated_at = now()
  where id = v_idem.id;

  return to_jsonb(v_driver);
end;
$function$;

create or replace function public.delivery_update_driver_idempotent_internal(
  p_driver_id uuid,
  p_name text,
  p_phone text,
  p_active boolean,
  p_on_duty boolean,
  p_max_active_deliveries integer,
  p_idempotency_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_existing public.drivers%rowtype;
  v_idem public.idempotency_keys%rowtype;
  v_inserted integer := 0;
  v_fingerprint text;
  v_driver public.drivers%rowtype;
begin
  if char_length(trim(coalesce(p_idempotency_key, ''))) < 8
     or char_length(trim(p_idempotency_key)) > 240 then
    raise exception 'invalid driver idempotency key';
  end if;

  select * into v_existing
  from public.drivers
  where id = p_driver_id and deleted_at is null;
  if v_existing.id is null then raise exception 'driver unavailable'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'driver_id', p_driver_id,
    'store_id', v_existing.store_id,
    'name', trim(p_name),
    'phone', nullif(trim(coalesce(p_phone, '')), ''),
    'active', p_active,
    'on_duty', p_on_duty,
    'max_active_deliveries', p_max_active_deliveries,
    'actor_user_id', p_actor_user_id
  )::text);

  insert into public.idempotency_keys(
    organization_id, store_id, scope, idempotency_key, request_fingerprint,
    status, expires_at
  ) values (
    v_existing.organization_id, v_existing.store_id, 'delivery.driver.update', trim(p_idempotency_key),
    v_fingerprint, 'processing', now() + interval '24 hours'
  ) on conflict (organization_id, scope, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.idempotency_keys
  where organization_id = v_existing.organization_id
    and scope = 'delivery.driver.update'
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if v_idem.id is null then raise exception 'driver idempotency unavailable'; end if;
  if v_idem.request_fingerprint is distinct from v_fingerprint then
    raise exception 'idempotency key reused with different driver payload';
  end if;
  if v_inserted = 0 and v_idem.status = 'completed' and v_idem.response_body is not null then
    return v_idem.response_body;
  end if;
  if v_inserted = 0 and v_idem.status = 'processing' and v_idem.expires_at > now() then
    raise exception 'driver update is already processing';
  end if;

  update public.idempotency_keys
  set status = 'processing', response_code = null, response_body = null,
      expires_at = now() + interval '24 hours', updated_at = now()
  where id = v_idem.id;

  select * into v_driver
  from public.delivery_update_driver_internal(
    p_driver_id,
    p_name,
    p_phone,
    p_active,
    p_on_duty,
    p_max_active_deliveries,
    p_actor_user_id
  );

  update public.idempotency_keys
  set status = 'completed', response_code = 200, response_body = to_jsonb(v_driver), updated_at = now()
  where id = v_idem.id;

  return to_jsonb(v_driver);
end;
$function$;

revoke all on function public.delivery_create_driver_idempotent_internal(uuid,text,text,uuid,integer,text,uuid) from public, anon, authenticated;
revoke all on function public.delivery_update_driver_idempotent_internal(uuid,text,text,boolean,boolean,integer,text,uuid) from public, anon, authenticated;
grant execute on function public.delivery_create_driver_idempotent_internal(uuid,text,text,uuid,integer,text,uuid) to service_role;
grant execute on function public.delivery_update_driver_idempotent_internal(uuid,text,text,boolean,boolean,integer,text,uuid) to service_role;
