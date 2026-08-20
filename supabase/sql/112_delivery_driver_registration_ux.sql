-- Hotfix: novos entregadores devem ficar disponíveis imediatamente após o cadastro.
-- Mantém a assinatura existente do RPC para não quebrar clientes atuais.

create or replace function public.delivery_create_driver_internal(
  p_store_id uuid,
  p_name text,
  p_phone text default null,
  p_user_id uuid default null,
  p_max_active_deliveries integer default 3,
  p_actor_user_id uuid default null
)
returns public.drivers
language plpgsql
set search_path to ''
as $function$
declare
  v_store public.stores%rowtype;
  v_driver public.drivers%rowtype;
begin
  if p_actor_user_id is null then raise exception 'driver actor is required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'invalid driver name'; end if;
  if p_phone is not null and char_length(trim(p_phone)) not between 8 and 30 then raise exception 'invalid driver phone'; end if;
  if p_max_active_deliveries not between 1 and 20 then raise exception 'invalid driver capacity'; end if;

  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  if p_user_id is not null and not exists(
    select 1
    from public.organization_members m
    where m.organization_id = v_store.organization_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and (
        exists(
          select 1 from public.user_store_roles usr
          where usr.organization_id = m.organization_id
            and usr.store_id = v_store.id
            and usr.user_id = p_user_id
        )
        or exists(
          select 1 from public.roles r
          where r.id = m.role_id and r.key = 'owner'
        )
      )
  ) then
    raise exception 'driver user is not active in store';
  end if;

  insert into public.drivers(
    organization_id,
    store_id,
    user_id,
    name,
    phone,
    active,
    on_duty,
    max_active_deliveries,
    created_by,
    updated_by
  )
  values(
    v_store.organization_id,
    v_store.id,
    p_user_id,
    trim(p_name),
    nullif(trim(coalesce(p_phone,'')),''),
    true,
    true,
    p_max_active_deliveries,
    p_actor_user_id,
    p_actor_user_id
  )
  returning * into v_driver;

  insert into public.audit_logs(
    organization_id, store_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values(
    v_driver.organization_id,
    v_driver.store_id,
    p_actor_user_id,
    'delivery.driver_created',
    'driver',
    v_driver.id,
    to_jsonb(v_driver)
  );

  insert into public.domain_events(
    organization_id, store_id, event_type, entity_type, entity_id, payload,
    status, attempts, occurred_at, created_by
  ) values(
    v_driver.organization_id,
    v_driver.store_id,
    'delivery.driver_created',
    'driver',
    v_driver.id,
    jsonb_build_object('user_id', v_driver.user_id, 'name', v_driver.name, 'on_duty', v_driver.on_duty),
    'pending',
    0,
    now(),
    p_actor_user_id
  );

  return v_driver;
end;
$function$;
