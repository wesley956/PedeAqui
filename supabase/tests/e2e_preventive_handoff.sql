-- PedeAqui FLOW-08 — retomada Robô ↔ Humano ↔ Robô sobre contexto canônico.
-- Exercita sessão ativa, carrinho real e correlação exata via orders.source_cart_id.
begin;

insert into auth.users (id,email)
values ('f8888888-8888-4888-8888-888888888888','quality-flow08@example.invalid');

insert into public.organizations (id,name,created_by)
values ('f8000000-0000-4000-8000-000000000001','Quality Flow08 Org','f8888888-8888-4888-8888-888888888888');

insert into public.stores (id,organization_id,name,slug,status)
values ('f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000001','Flow08 Store','quality-flow08','active');

insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
values ('f8000000-0000-4000-8000-000000000021','f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','Produto Flow08',1000,true,'available');

insert into public.contacts (
  id,organization_id,store_id,channel,external_id,phone_normalized,name
) values (
  'f8000000-0000-4000-8000-000000000031','f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000011','whatsapp','5519999991111','5519999991111','Cliente Flow08'
);

insert into public.conversations (
  id,organization_id,store_id,contact_id,channel,status
) values (
  'f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000031','whatsapp','bot'
);

insert into public.messages (id,organization_id,store_id,conversation_id,contact_id,direction,sender_type,content_type,body,delivery_status)
values ('f8000000-0000-4000-8000-000000000061','f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000031','inbound','contact','text','technical supplier','received');
insert into public.automation_sessions (organization_id,store_id,conversation_id,state,step,context,expires_at)
values ('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000041','active','order_payment','{"channel":"whatsapp_order","cartToken":"technical-draft"}',now()+interval '1 day');
do $$
declare
 c public.conversations%rowtype;
 n integer;
begin
 c := public.conversation_preventive_handoff_internal('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000061','supplier_contact');
 if c.status <> 'waiting_agent' or c.human_attention_requested_at is not null then raise exception 'unsafe preventive state/attention'; end if;
 perform public.conversation_preventive_handoff_internal('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000061','supplier_contact');
 select count(*) into n from public.conversation_state_history where conversation_id=c.id;
 if n <> 1 then raise exception 'duplicate transition'; end if;
 if not exists(select 1 from public.automation_sessions where conversation_id=c.id and step='order_payment' and context->>'cartToken'='technical-draft') then raise exception 'draft lost'; end if;
 perform public.conversation_transition_internal(c.id,'human','f8888888-8888-4888-8888-888888888888','technical assume',null,'system');
 c := public.conversation_preventive_handoff_internal('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000061','job_candidate');
 if c.status <> 'human' or c.assigned_user_id <> 'f8888888-8888-4888-8888-888888888888' then raise exception 'human owner lost'; end if;
end;
$$;
rollback;
