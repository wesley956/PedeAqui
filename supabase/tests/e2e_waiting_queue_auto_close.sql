begin;
do $test$
declare
  actor uuid := gen_random_uuid(); org uuid := gen_random_uuid(); store uuid := gen_random_uuid();
  contact uuid := gen_random_uuid(); convo uuid := gen_random_uuid(); latest uuid;
  v bigint; result jsonb;
begin
  insert into auth.users(id,email) values(actor,'queue-'||actor||'@example.invalid');
  insert into public.organizations(id,name,created_by) values(org,'Queue regression',actor);
  insert into public.stores(id,organization_id,name,slug,status) values(store,org,'Queue regression','queue-'||store,'active');
  insert into public.store_conversation_settings(organization_id,store_id,conversation_auto_close_enabled,human_auto_close_minutes,send_auto_close_message)
    values(org,store,true,60,false) on conflict(store_id) do update set conversation_auto_close_enabled=true,human_auto_close_minutes=60,send_auto_close_message=false;
  insert into public.contacts(id,organization_id,store_id,channel,external_id,phone_normalized,name)
    values(contact,org,store,'whatsapp','5519999997777','5519999997777','Queue regression');
  insert into public.conversations(id,organization_id,store_id,contact_id,channel,status,last_message_at,opened_at)
    values(convo,org,store,contact,'whatsapp','waiting_agent',now()-interval '3 hours',now()-interval '4 hours');
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at)
    values(org,store,convo,contact,'meta_cloud','inbound','contact','text','Preciso de atendente','received',now()-interval '4 hours');
  if public.conversation_team_reply_resolved_internal(org,store,convo) then raise exception 'Unanswered customer considered resolved'; end if;
  select version into v from public.conversations where id=convo;
  result:=public.conversation_auto_close_internal(convo,v);
  if result->>'reason'<>'customer_waiting_for_team' then raise exception 'Unanswered customer not protected: %',result; end if;
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at)
    values(org,store,convo,contact,'meta_cloud','outbound','system','text','Pedido recebido','delivered',now()-interval '3 hours');
  if public.conversation_team_reply_resolved_internal(org,store,convo) then raise exception 'Automated notification counted as team reply'; end if;
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at,sender_user_id)
    values(org,store,convo,contact,'meta_cloud','outbound','agent','text','Resolvido pela equipe','delivered',now()-interval '3 hours',actor) returning id into latest;
  if not public.conversation_team_reply_resolved_internal(org,store,convo) then raise exception 'Panel reply not recognized'; end if;
  if public.conversation_team_reply_resolved_internal(gen_random_uuid(),store,convo) then raise exception 'Cross-tenant match'; end if;
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at,metadata)
    values(org,store,convo,contact,'meta_cloud','outbound','system','text','Resposta do aplicativo','delivered',now()-interval '170 minutes','{"source":"whatsapp_business_app"}');
  if not public.conversation_team_reply_resolved_internal(org,store,convo) then raise exception 'Business app reply not recognized'; end if;
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at)
    values(org,store,convo,contact,'meta_cloud','inbound','contact','text','Ainda preciso de ajuda','received',now()-interval '2 hours') returning id into latest;
  if public.conversation_team_reply_resolved_internal(org,store,convo) then raise exception 'New unanswered request lost'; end if;
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at,sender_user_id)
    values(org,store,convo,contact,'meta_cloud','outbound','agent','text','Nova resposta','delivered',now()-interval '110 minutes',actor);
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at)
    values(org,store,convo,contact,'meta_cloud','inbound','contact','text','Obrigada!','received',now()-interval '105 minutes');
  if not public.conversation_team_reply_resolved_internal(org,store,convo) then raise exception 'Acknowledgement kept resolved queue open'; end if;
  update public.conversations set human_attention_requested_at=now()-interval '1 hour' where id=convo;
  if public.conversation_team_reply_resolved_internal(org,store,convo) then raise exception 'Fresh handoff was ignored'; end if;
  update public.conversations set human_attention_requested_at=null where id=convo;
  select version into v from public.conversations where id=convo;
  result:=public.conversation_auto_close_internal(convo,v-1);
  if result->>'reason'<>'version_changed' then raise exception 'Version guard lost'; end if;
  insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,content_type,body,delivery_status,created_at,sender_user_id)
    values(org,store,convo,contact,'meta_cloud','outbound','agent','text','Pending reply','pending',now()-interval '2 hours',actor) returning id into latest;
  result:=public.conversation_auto_close_internal(convo,v);
  if result->>'reason'<>'outbound_pending' then raise exception 'Pending send guard lost: %',result; end if;
  update public.messages set delivery_status='failed' where id=latest;
  select version into v from public.conversations where id=convo;
  insert into public.automation_sessions(organization_id,store_id,conversation_id,state,step,context,expires_at)
    values(org,store,convo,'active','order_items','{"channel":"whatsapp_order"}',now()+interval '1 hour');
  result:=public.conversation_auto_close_internal(convo,v);
  if result->>'reason'<>'whatsapp_order_active' then raise exception 'Active cart was not protected: %',result; end if;
  update public.automation_sessions set state='expired' where conversation_id=convo;
  update public.conversations set last_message_at=now() where id=convo;
  select version into v from public.conversations where id=convo;
  result:=public.conversation_auto_close_internal(convo,v);
  if result->>'reason'<>'activity_changed' then raise exception 'Recent conversation was closed: %',result; end if;
  update public.conversations set last_message_at=now()-interval '2 hours' where id=convo;
  select version into v from public.conversations where id=convo;
  result:=public.conversation_auto_close_internal(convo,v);
  if result->>'closed'<>'true' then raise exception 'Resolved waiting queue not closed: %',result; end if;
end;
$test$;
rollback;
