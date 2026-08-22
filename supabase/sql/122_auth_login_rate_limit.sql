-- PedeAqui — PA-DIAG-106
-- Limite adicional do login. A chave é HMAC server-side; nenhum e-mail ou IP é persistido.

create table private.auth_login_attempts (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  failures smallint not null default 0 check (failures between 0 and 100),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
create index auth_login_attempts_cleanup_idx on private.auth_login_attempts(updated_at);
revoke all on table private.auth_login_attempts from public,anon,authenticated;
grant select,insert,update,delete on table private.auth_login_attempts to service_role;

create or replace function public.auth_login_guard_internal(p_key_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row private.auth_login_attempts%rowtype;
begin
  if coalesce(p_key_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid login guard key'; end if;
  select * into v_row from private.auth_login_attempts where key_hash=p_key_hash;
  return jsonb_build_object(
    'allowed',v_row.locked_until is null or v_row.locked_until<=now(),
    'retry_after_seconds',case when v_row.locked_until>now() then ceil(extract(epoch from v_row.locked_until-now()))::integer else 0 end
  );
end;
$$;

create or replace function public.auth_login_failure_internal(p_key_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row private.auth_login_attempts%rowtype; v_failures smallint;
begin
  if coalesce(p_key_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid login guard key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key_hash,0));
  select * into v_row from private.auth_login_attempts where key_hash=p_key_hash for update;
  if v_row.key_hash is null or v_row.window_started_at<now()-interval '15 minutes' then
    v_failures:=1;
    insert into private.auth_login_attempts(key_hash,failures,window_started_at,locked_until,updated_at)
    values(p_key_hash,v_failures,now(),null,now())
    on conflict(key_hash) do update set failures=excluded.failures,window_started_at=excluded.window_started_at,locked_until=null,updated_at=now()
    returning * into v_row;
  else
    v_failures:=least(v_row.failures+1,100)::smallint;
    update private.auth_login_attempts set failures=v_failures,
      locked_until=case when v_failures>=5 then greatest(coalesce(locked_until,now()),now()+interval '15 minutes') else locked_until end,
      updated_at=now() where key_hash=p_key_hash returning * into v_row;
  end if;
  return jsonb_build_object('allowed',v_row.locked_until is null or v_row.locked_until<=now(),'failures',v_row.failures,
    'retry_after_seconds',case when v_row.locked_until>now() then ceil(extract(epoch from v_row.locked_until-now()))::integer else 0 end);
end;
$$;

create or replace function public.auth_login_success_internal(p_key_hash text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(p_key_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid login guard key'; end if;
  delete from private.auth_login_attempts where key_hash=p_key_hash;
end;
$$;

revoke all on function public.auth_login_guard_internal(text),public.auth_login_failure_internal(text),public.auth_login_success_internal(text) from public,anon,authenticated;
grant execute on function public.auth_login_guard_internal(text),public.auth_login_failure_internal(text),public.auth_login_success_internal(text) to service_role;
