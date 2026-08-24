-- PedeAqui — ingestão idempotente de mensagens enviadas no WhatsApp Business App
-- em modo coexistência. Mantém a mesma inbox/conversa sem fingir identidade de
-- um usuário do painel e sem incrementar não-lidas.

create or replace function public.conversation_receive_echo_internal(
  p_store_id uuid,
  p_provider text,
  p_external_contact_id text,
  p_phone_normalized text,
  p_external_message_id text,
  p_body text,
  p_content_type text default 'text',
  p_provider_timestamp timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_store public.stores%rowtype;
  v_contact public.contacts%rowtype;
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_contact_created boolean := false;
  v_conversation_created boolean := false;
  v_message_created boolean := false;
begin
  if p_provider <> 'meta_cloud' then raise exception 'unsupported provider'; end if;
  if char_length(trim(coalesce(p_external_contact_id,''))) < 1 then raise exception 'external contact id required'; end if;
  if char_length(trim(coalesce(p_external_message_id,''))) < 1 then raise exception 'external message id required'; end if;
  if p_phone_normalized is not null and p_phone_normalized !~ '^[0-9]{8,20}$' then raise exception 'invalid phone'; end if;
  if p_content_type not in ('text','image','audio','video','document','location','template','interactive','unsupported') then
    raise exception 'invalid content type';
  end if;

  select * into v_store from public.stores where id=p_store_id and status='active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  select * into v_contact
  from public.contacts
  where store_id=v_store.id and channel='whatsapp' and external_id=trim(p_external_contact_id)
  for update;

  if v_contact.id is null and p_phone_normalized is not null then
    select * into v_contact
    from public.contacts
    where store_id=v_store.id and channel='whatsapp' and phone_normalized=p_phone_normalized
    for update;
  end if;

  if v_contact.id is null then
    insert into public.contacts (
      organization_id,store_id,channel,external_id,phone_normalized,name
    ) values (
      v_store.organization_id,v_store.id,'whatsapp',trim(p_external_contact_id),p_phone_normalized,null
    ) returning * into v_contact;
    v_contact_created := true;
  else
    update public.contacts
    set external_id=coalesce(external_id,trim(p_external_contact_id)),
        phone_normalized=coalesce(phone_normalized,p_phone_normalized),
        updated_at=now()
    where id=v_contact.id
    returning * into v_contact;
  end if;

  select * into v_conversation
  from public.conversations
  where store_id=v_store.id and contact_id=v_contact.id and channel='whatsapp' and status<>'closed'
  order by opened_at desc
  limit 1
  for update;

  if v_conversation.id is null then
    insert into public.conversations (
      organization_id,store_id,contact_id,channel,status,last_message_at
    ) values (
      v_store.organization_id,v_store.id,v_contact.id,'whatsapp','waiting_agent',coalesce(p_provider_timestamp,now())
    ) returning * into v_conversation;
    v_conversation_created := true;

    insert into public.conversation_state_history (
      organization_id,store_id,conversation_id,from_state,to_state,source
    ) values (
      v_store.organization_id,v_store.id,v_conversation.id,null,'waiting_agent','webhook'
    );

    insert into public.domain_events (
      organization_id,store_id,event_type,entity_type,entity_id,payload
    ) values (
      v_store.organization_id,v_store.id,'conversation.created','conversation',v_conversation.id,
      jsonb_build_object('channel','whatsapp','contact_id',v_contact.id,'source','whatsapp_business_app')
    );
  end if;

  insert into public.messages (
    organization_id,store_id,conversation_id,contact_id,provider,
    direction,sender_type,content_type,body,external_message_id,
    delivery_status,provider_timestamp,metadata
  ) values (
    v_store.organization_id,v_store.id,v_conversation.id,v_contact.id,p_provider,
    'outbound','system',p_content_type,left(p_body,16000),trim(p_external_message_id),
    'sent',p_provider_timestamp,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('source','whatsapp_business_app')
  )
  on conflict (store_id,provider,external_message_id) where external_message_id is not null
  do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message
    from public.messages
    where store_id=v_store.id and provider=p_provider and external_message_id=trim(p_external_message_id);
  else
    v_message_created := true;
    update public.conversations
    set last_message_at=greatest(coalesce(last_message_at,'-infinity'::timestamptz),coalesce(p_provider_timestamp,now())),
        version=version+1,
        updated_at=now()
    where id=v_conversation.id
    returning * into v_conversation;

    insert into public.domain_events (
      organization_id,store_id,event_type,entity_type,entity_id,payload
    ) values (
      v_store.organization_id,v_store.id,'conversation.message_echoed','message',v_message.id,
      jsonb_build_object('conversation_id',v_conversation.id,'contact_id',v_contact.id,'provider',p_provider,'source','whatsapp_business_app')
    );
  end if;

  return jsonb_build_object(
    'contact_id',v_contact.id,
    'conversation_id',v_conversation.id,
    'message_id',v_message.id,
    'contact_created',v_contact_created,
    'conversation_created',v_conversation_created,
    'message_created',v_message_created
  );
end;
$$;

revoke all on function public.conversation_receive_echo_internal(uuid,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.conversation_receive_echo_internal(uuid,text,text,text,text,text,text,timestamptz,jsonb) to service_role;
