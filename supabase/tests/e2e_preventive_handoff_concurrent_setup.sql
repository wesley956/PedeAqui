-- INT-EVOL-04: full-schema preventive handoff, draft, grants and scope.
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
commit;
