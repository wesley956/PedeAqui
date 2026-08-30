-- PedeAqui — hardening final do backoffice v1

-- Empresa inteira (store_id null) também deve ter apenas um passo por chave.
create unique index if not exists platform_onboarding_tasks_scope_unique_v2
on public.platform_onboarding_tasks(organization_id,store_id,step_key) nulls not distinct;

-- Mensagem já enviada é histórico e não volta a rascunho/cancelada.
create or replace function public.platform_customer_message_save_internal(
  p_message_id uuid,p_organization_id uuid,p_channel text,p_kind text,p_title text,p_body text,p_status text,p_scheduled_at timestamptz,p_actor_user_id uuid,p_reason text,p_protocol text
) returns public.platform_customer_messages
language plpgsql security invoker set search_path='' as $$
declare v_before public.platform_customer_messages%rowtype; v_row public.platform_customer_messages%rowtype; v_id uuid:=coalesce(p_message_id,gen_random_uuid());
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  if p_channel not in ('panel','email','whatsapp') then raise exception 'invalid message channel'; end if;
  if p_kind not in ('announcement','billing','support','product','onboarding','other') then raise exception 'invalid message kind'; end if;
  if p_status not in ('draft','scheduled','cancelled') then raise exception 'message can only be saved as draft, scheduled or cancelled'; end if;
  if p_status='scheduled' and p_scheduled_at is null then raise exception 'scheduled message requires a date'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'protocol required'; end if;
  if p_message_id is not null then
    select * into v_before from public.platform_customer_messages where id=p_message_id for update;
    if v_before.id is null then raise exception 'message not found'; end if;
    if v_before.status='sent' then raise exception 'sent message history is immutable'; end if;
  end if;
  insert into public.platform_customer_messages(id,organization_id,channel,kind,title,body,status,scheduled_at,created_by,updated_by)
  values(v_id,p_organization_id,p_channel,p_kind,trim(p_title),trim(p_body),p_status,p_scheduled_at,p_actor_user_id,p_actor_user_id)
  on conflict(id) do update set organization_id=excluded.organization_id,channel=excluded.channel,kind=excluded.kind,title=excluded.title,body=excluded.body,status=excluded.status,scheduled_at=excluded.scheduled_at,updated_by=p_actor_user_id,updated_at=now()
  returning * into v_row;
  insert into public.platform_global_audit(actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol)
  values(p_actor_user_id,'platform.customer_message.saved','platform_customer_message',v_row.id,p_organization_id,case when v_before.id is null then null else to_jsonb(v_before) end,to_jsonb(v_row),trim(p_reason),trim(p_protocol));
  return v_row;
end; $$;

revoke all on function public.platform_customer_message_save_internal(uuid,uuid,text,text,text,text,text,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_customer_message_save_internal(uuid,uuid,text,text,text,text,text,timestamptz,uuid,text,text) to service_role;
