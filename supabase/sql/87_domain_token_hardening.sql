-- PedeAqui — Milestone 23 [248]/[253]
-- search_path vazio exige qualificação explícita da extensão pgcrypto.

create or replace function public.configure_domain_internal(p_organization_id uuid,p_store_id uuid,p_hostname text,p_actor_user_id uuid)
returns public.organization_domains
language plpgsql security invoker set search_path='' as $$
declare v_row public.organization_domains%rowtype; v_host text:=lower(trim(p_hostname));
begin
  if p_store_id is not null and not exists(select 1 from public.stores s where s.organization_id=p_organization_id and s.id=p_store_id) then raise exception 'store outside organization'; end if;
  insert into public.organization_domains(organization_id,store_id,hostname,verification_token,created_by,updated_by)
  values(p_organization_id,p_store_id,v_host,encode(extensions.gen_random_bytes(18),'hex'),p_actor_user_id,p_actor_user_id)
  on conflict(hostname) do update set store_id=excluded.store_id,status='pending',verification_token=encode(extensions.gen_random_bytes(18),'hex'),verified_at=null,last_error=null,updated_by=excluded.updated_by,updated_at=now()
  where public.organization_domains.organization_id=excluded.organization_id
  returning * into v_row;
  if v_row.id is null then raise exception 'domain belongs to another organization'; end if;
  return v_row;
end;
$$;
revoke all on function public.configure_domain_internal(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.configure_domain_internal(uuid,uuid,text,uuid) to service_role;
